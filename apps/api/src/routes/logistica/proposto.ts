import express, { Router } from 'express';
import { pool } from '../../db';
import { logger } from '../../logger';
import { requirePermission } from '../../middlewares/requirePermission';

export const propostoRouter: Router = Router();

function getField(row: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    }
    const rowKeys = Object.keys(row);
    for (const key of keys) {
        const lower = key.toLowerCase();
        const found = rowKeys.find(k => k.toLowerCase() === lower);
        if (found !== undefined && row[found] !== undefined && row[found] !== null && row[found] !== '') {
            return row[found];
        }
    }
    return '';
}

function parsePtBrNumber(raw: unknown): number {
    if (raw === null || raw === undefined || raw === '') return 0;
    if (typeof raw === 'number') return Number.isNaN(raw) ? 0 : raw;
    const s = String(raw).trim();
    if (!s) return 0;
    if (s.includes(',')) {
        const cleaned = s.replace(/\./g, '').replace(',', '.');
        const n = parseFloat(cleaned);
        return Number.isNaN(n) ? 0 : n;
    }
    const n = parseFloat(s);
    return Number.isNaN(n) ? 0 : n;
}

function parseNullableInt(raw: unknown): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
}

function parseDateTime(raw: unknown): string | null {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'number') {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const dt = new Date(excelEpoch.getTime() + raw * 86400000);
        return dt.toISOString();
    }

    const s = String(raw).trim();
    if (!s) return null;

    const ptbrDateTime = s.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (ptbrDateTime) {
        const dd = ptbrDateTime[1].padStart(2, '0');
        const mm = ptbrDateTime[2].padStart(2, '0');
        const yyyy = ptbrDateTime[3];
        const hh = (ptbrDateTime[4] ?? '00').padStart(2, '0');
        const mi = (ptbrDateTime[5] ?? '00').padStart(2, '0');
        const ss = (ptbrDateTime[6] ?? '00').padStart(2, '0');
        return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`;
    }

    if (/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(s)) {
        const normalized = s.includes('T') ? s : s.replace(' ', 'T');
        if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return `${normalized}T00:00:00-03:00`;
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) return `${normalized}:00-03:00`;
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) return `${normalized}-03:00`;
        return normalized;
    }

    return null;
}

propostoRouter.post(
    '/logistica/proposto/upload',
    express.json({ limit: '10mb' }),
    requirePermission('logistica_proposto', 'editar'),
    async (req, res) => {
        const client = await pool.connect();
        try {
            const auth = (req as any).user || {};
            const userId = auth.id || null;
            const userEmail = auth.email || null;
            const { fileName, rows: inputRows } = req.body;

            if (!Array.isArray(inputRows) || inputRows.length === 0) {
                return res.status(400).json({ error: 'Nenhuma linha recebida.' });
            }

            await client.query('BEGIN');

            const resultUpload = await client.query(
                `INSERT INTO logistica_proposto_uploads (nome_arquivo, linhas_total, upload_por_email)
                 VALUES ($1, $2, $3) RETURNING id`,
                [fileName || 'upload', inputRows.length, userEmail]
            );
            const uploadId = resultUpload.rows[0].id as string;

            const BATCH_SIZE = 100;
            let inserted = 0;
            const errors: { linha: number; erro: string }[] = [];

            for (let i = 0; i < inputRows.length; i += BATCH_SIZE) {
                const batch = inputRows.slice(i, i + BATCH_SIZE);
                const values: unknown[] = [];
                const placeholders: string[] = [];

                batch.forEach((row: Record<string, unknown>, batchIdx: number) => {
                    const rowNum = i + batchIdx + 1;

                    const canalVendas = parseNullableInt(getField(row, 'canal_vendas', 'canalVendas', 'Canal de Vendas'));
                    const canalDescricao = String(getField(row, 'canal_descricao', 'canalDescricao', 'Descrição Canal')).trim();
                    const roteiroSeparacao = String(getField(row, 'roteiro_separacao', 'roteiroSeparacao', 'Roteiro de separação')).trim();
                    const dataHora = parseDateTime(getField(row, 'data_hora', 'dataHora', 'Data/Hora'));
                    const ordemVenda = String(getField(row, 'ordem_venda', 'ordemVenda', 'Ordem de venda', 'OV')).trim();
                    const contaCliente = String(getField(row, 'conta_cliente', 'contaCliente', 'Conta do cliente')).trim();
                    const nomeCliente = String(getField(row, 'nome_cliente', 'nomeCliente', 'Nome do cliente', 'Nome Cliente')).trim();
                    const numeroItem = String(getField(row, 'numero_item', 'numeroItem', 'Nº do item', 'Numero item')).trim();
                    const configuracao = String(getField(row, 'configuracao', 'Configuração', 'Configuracao')).trim();
                    const filial = String(getField(row, 'filial', 'Filial')).trim();
                    const tipoDestino = String(getField(row, 'tipo_destino', 'tipoDestino', 'Tipo destino', 'Tipo')).trim();
                    const localizacao = String(getField(row, 'localizacao', 'Localização', 'Localizacao')).trim();
                    const valorNet = parsePtBrNumber(getField(row, 'valor_net', 'valorNet', 'Valor NET', 'Valor (NET)'));
                    const cidade = String(getField(row, 'cidade', 'Cidade')).trim();
                    const estado = String(getField(row, 'estado', 'Estado')).trim();

                    if (!roteiroSeparacao || !ordemVenda) {
                        errors.push({ linha: rowNum, erro: 'Linha sem roteiro de separação ou ordem de venda' });
                        return;
                    }

                    const offset = values.length;
                    values.push(
                        uploadId,         // $1
                        canalVendas,      // $2
                        canalDescricao,   // $3
                        roteiroSeparacao, // $4
                        dataHora,         // $5
                        ordemVenda,       // $6
                        contaCliente,     // $7
                        nomeCliente,      // $8
                        numeroItem,       // $9
                        configuracao,     // $10
                        filial,           // $11
                        tipoDestino,      // $12
                        localizacao,      // $13
                        valorNet,         // $14
                        cidade,           // $15
                        estado            // $16
                    );

                    placeholders.push(
                        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16})`
                    );

                    inserted++;
                });

                if (placeholders.length > 0) {
                    await client.query(
                        `INSERT INTO logistica_proposto_dados
                            (upload_id, canal_vendas, canal_descricao, roteiro_separacao, data_hora,
                             ordem_venda, conta_cliente, nome_cliente, numero_item, configuracao,
                             filial, tipo_destino, localizacao, valor_net, cidade, estado)
                         VALUES ${placeholders.join(', ')}`,
                        values
                    );
                }
            }

            if (inserted > 0) {
                await client.query(
                    `UPDATE logistica_proposto_uploads SET ativo = false WHERE id != $1`,
                    [uploadId]
                );
            } else {
                await client.query('ROLLBACK');
                logger.warn({ userId, errors: errors.length }, 'Upload logistica proposto sem linhas válidas');
                return res.json({
                    uploadId: null,
                    inserted: 0,
                    errors,
                    message: `Nenhum dado importado.${errors.length > 0 ? ` ${errors.length} linhas com erro.` : ''}`,
                });
            }

            await client.query('COMMIT');
            logger.info({ userId, uploadId, inserted, errors: errors.length }, 'Logistica proposto upload completo');

            res.json({
                uploadId,
                inserted,
                errors,
                message: `${inserted} registros importados com sucesso.${errors.length > 0 ? ` ${errors.length} linhas ignoradas por erro.` : ''}`,
            });
        } catch (e: any) {
            await client.query('ROLLBACK');
            logger.error({ err: e }, 'Erro no upload logistica proposto');
            res.status(500).json({ error: 'Erro ao processar upload.' });
        } finally {
            client.release();
        }
    }
);

propostoRouter.get(
    '/logistica/proposto',
    requirePermission('logistica_proposto', 'ver'),
    async (_req, res) => {
        try {
            const latestUpload = await pool.query(
                `SELECT u.id, u.nome_arquivo, u.criado_em, u.upload_por_email, usr.nome AS upload_por_nome
                 FROM logistica_proposto_uploads u
                 LEFT JOIN usuarios usr ON LOWER(usr.email) = LOWER(u.upload_por_email)
                 WHERE u.ativo = true
                 ORDER BY u.criado_em DESC
                 LIMIT 1`
            );

            if (latestUpload.rows.length === 0) {
                return res.json({ items: [], uploadInfo: null });
            }

            const uploadInfo = latestUpload.rows[0];

            const { rows } = await pool.query(
                `SELECT d.*,
                        GREATEST(0, CURRENT_DATE - DATE(d.data_hora))::int AS dias_desde_proposta
                 FROM logistica_proposto_dados d
                 WHERE d.upload_id = $1
                 ORDER BY dias_desde_proposta DESC, d.valor_net ASC`,
                [uploadInfo.id]
            );

            res.json({
                items: rows,
                uploadInfo: {
                    uploadId: uploadInfo.id,
                    nomeArquivo: uploadInfo.nome_arquivo,
                    criadoEm: uploadInfo.criado_em,
                    uploadPorEmail: uploadInfo.upload_por_email,
                    uploadPorNome: uploadInfo.upload_por_nome,
                    totalRows: rows.length,
                },
            });
        } catch (e: any) {
            logger.error({ err: e }, 'Erro ao listar logistica proposto');
            res.status(500).json({ error: 'Erro ao buscar dados do painel proposto.' });
        }
    }
);

propostoRouter.delete(
    '/logistica/proposto/:uploadId',
    requirePermission('logistica_proposto', 'editar'),
    async (req, res) => {
        try {
            const { uploadId } = req.params;
            const result = await pool.query(
                `DELETE FROM logistica_proposto_uploads WHERE id = $1`,
                [uploadId]
            );
            res.json({ deleted: result.rowCount });
        } catch (e: any) {
            logger.error({ err: e }, 'Erro ao deletar logistica proposto');
            res.status(500).json({ error: 'Erro ao deletar upload.' });
        }
    }
);
