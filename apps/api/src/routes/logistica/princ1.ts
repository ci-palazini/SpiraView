import express, { Router } from 'express';
import { pool } from '../../db';
import { logger } from '../../logger';
import { requirePermission } from '../../middlewares/requirePermission';
import crypto from 'crypto';

export const princ1Router: Router = Router();

// Helpers
function getField(row: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    }
    const ObjectKeys = Object.keys(row);
    for (const key of keys) {
        const lower = key.toLowerCase();
        const found = ObjectKeys.find(k => k.toLowerCase() === lower);
        if (found !== undefined && row[found] !== undefined && row[found] !== null && row[found] !== '') {
            return row[found];
        }
    }
    return '';
}

function parsePtBrNumber(raw: unknown): number {
    if (raw === null || raw === undefined || raw === '') return 0;
    if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
    const s = String(raw).trim();
    if (s.includes(',')) {
        const cleaned = s.replace(/\./g, '').replace(',', '.');
        const n = parseFloat(cleaned);
        return isNaN(n) ? 0 : n;
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

function parseDate(raw: unknown): string | null {
    if (!raw) return null;

    // Se for número (provavelmente data serial do Excel)
    if (typeof raw === 'number') {
        // Exemplo: 45000 (16/03/2023)
        // Data base do Excel é 30/12/1899
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const dt = new Date(excelEpoch.getTime() + raw * 86400000);
        return dt.toISOString().substring(0, 10);
    }

    const s = String(raw).trim();
    // DD/MM/YYYY
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
        const dd = m[1].padStart(2, '0');
        const mm = m[2].padStart(2, '0');
        return `${m[3]}-${mm}-${dd}`;
    }
    if (/^\d{4}-\d{2}-\d{2}(\s|T)?/.test(s)) return s.substring(0, 10);
    return null;
}

princ1Router.post(
    '/logistica/princ1/upload',
    express.json({ limit: '10mb' }),
    requirePermission('logistica_princ1', 'editar'),
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

            // Inserir upload_id
            const resultUpload = await client.query(
                `INSERT INTO logistica_princ1_uploads (nome_arquivo, linhas_total, upload_por_email)
                 VALUES ($1, $2, $3) RETURNING id`,
                [fileName || 'upload', inputRows.length, userEmail]
            );
            const uploadId = resultUpload.rows[0].id;

            const BATCH_SIZE = 100;
            let inserted = 0;
            const errors: { linha: number; erro: string }[] = [];

            for (let i = 0; i < inputRows.length; i += BATCH_SIZE) {
                const batch = inputRows.slice(i, i + BATCH_SIZE);
                const values: unknown[] = [];
                const placeholders: string[] = [];

                batch.forEach((row: Record<string, unknown>, batchIdx: number) => {
                    const rowNum = i + batchIdx + 1;

                    const numeroItem = String(getField(row, 'Nº do item', 'numero_item')).trim();
                    const nomeItem = String(getField(row, 'Nome do item', 'nome_item')).trim();
                    const configuracao = String(getField(row, 'Configuração', 'configuracao')).trim();
                    const estoqueFisico = parsePtBrNumber(getField(row, 'Estoque físico', 'Estoque Fisico', 'estoque_fisico'));
                    const deposito = String(getField(row, 'Depósito', 'Deposito', 'deposito')).trim();
                    const localizacao = String(getField(row, 'Localização', 'Localizacao', 'localizacao')).trim();
                    const numeroLote = String(getField(row, 'Nº do lote', 'Numero do lote', 'numero_lote')).trim();
                    const numeroSerie = String(getField(row, 'Nº de série', 'Numero de serie', 'numero_serie')).trim();
                    const dataEntrada = parseDate(getField(row, 'Data de entrada', 'data_entrada'));

                    if (!numeroItem) {
                        return; // Pular se vazio
                    }
                    if (!dataEntrada) {
                        errors.push({ linha: rowNum, erro: 'Data de entrada ausente ou inválida' });
                        return;
                    }

                    const offset = values.length;
                    values.push(
                        uploadId,       // $1
                        numeroItem,     // $2
                        nomeItem,       // $3
                        configuracao,   // $4
                        estoqueFisico,  // $5
                        deposito,       // $6
                        localizacao,    // $7
                        numeroLote,     // $8
                        numeroSerie,    // $9
                        dataEntrada     // $10
                    );

                    placeholders.push(
                        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`
                    );

                    inserted++;
                });

                if (placeholders.length > 0) {
                    await client.query(
                        `INSERT INTO logistica_princ1_dados
                            (upload_id, numero_item, nome_item, configuracao, estoque_fisico, 
                             deposito, localizacao, numero_lote, numero_serie, data_entrada)
                         VALUES ${placeholders.join(', ')}`,
                        values
                    );
                }
            }

            if (inserted > 0) {
                // Desativar uploads antigos
                await client.query(
                    `UPDATE logistica_princ1_uploads SET ativo = false WHERE id != $1`,
                    [uploadId]
                );
            } else {
                await client.query('ROLLBACK');
                logger.warn({ userId, errors: errors.length }, 'Upload Princ1 sem linhas válidas');
                return res.json({
                    uploadId: null,
                    inserted: 0,
                    errors,
                    message: `Nenhum dado importado.${errors.length > 0 ? ` ${errors.length} linhas com erro.` : ' Verifique o arquivo.'}`,
                });
            }

            await client.query('COMMIT');
            logger.info({ userId, uploadId, inserted, errors: errors.length }, 'Logistica princ1 upload completo');

            res.json({
                uploadId,
                inserted,
                errors,
                message: `${inserted} registros importados com sucesso.${errors.length > 0 ? ` ${errors.length} linhas ignoradas por erro.` : ''}`,
            });

        } catch (e: any) {
            await client.query('ROLLBACK');
            logger.error({ err: e }, 'Erro no upload logistica princ1');
            res.status(500).json({ error: 'Erro ao processar upload.' });
        } finally {
            client.release();
        }
    }
);

princ1Router.get(
    '/logistica/princ1',
    requirePermission('logistica_princ1', 'ver'),
    async (_req, res) => {
        try {
            const latestUpload = await pool.query(
                `SELECT u.id, u.nome_arquivo, u.criado_em, u.upload_por_email, usr.nome as upload_por_nome
                 FROM logistica_princ1_uploads u
                 LEFT JOIN usuarios usr ON usr.email = u.upload_por_email
                 WHERE u.ativo = true
                 ORDER BY u.criado_em DESC LIMIT 1`
            );

            if (latestUpload.rows.length === 0) {
                return res.json({ items: [], uploadInfo: null });
            }

            const uploadInfo = latestUpload.rows[0];

            // Calcula dias de atraso baseado no CURRENT_DATE no DB
            const { rows } = await pool.query(
                `SELECT d.*, 
                        CURRENT_DATE - d.data_entrada AS dias_atraso 
                 FROM logistica_princ1_dados d
                 WHERE d.upload_id = $1
                 ORDER BY dias_atraso DESC`,
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
            logger.error({ err: e }, 'Erro ao listar logistica princ1');
            res.status(500).json({ error: 'Erro ao buscar dados do Princ. 1.' });
        }
    }
);

princ1Router.delete(
    '/logistica/princ1/:uploadId',
    requirePermission('logistica_princ1', 'editar'),
    async (req, res) => {
        try {
            const { uploadId } = req.params;
            const result = await pool.query(
                `DELETE FROM logistica_princ1_uploads WHERE id = $1`,
                [uploadId]
            );
            res.json({ deleted: result.rowCount });
        } catch (e: any) {
            logger.error({ err: e }, 'Erro ao deletar logistica princ1');
            res.status(500).json({ error: 'Erro ao deletar.' });
        }
    }
);
