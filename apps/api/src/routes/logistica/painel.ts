// apps/api/src/routes/logistica/painel.ts
import express, { Router } from 'express';
import { pool } from '../../db';
import { logger } from '../../logger';
import { requirePermission } from '../../middlewares/requirePermission';
import crypto from 'crypto';

export const painelRouter: Router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Case-insensitive column lookup.
 * Tries exact keys first, then falls back to a case-insensitive match.
 */
function getField(row: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    }
    // Case-insensitive fallback
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

/**
 * Parse a pt-BR number string (1.234,56) into a JS number (1234.56).
 * Returns 0 if unparseable.
 */
function parsePtBrNumber(raw: unknown): number {
    if (raw === null || raw === undefined || raw === '') return 0;
    if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
    const s = String(raw).trim();
    if (s.includes(',')) {
        // pt-BR format: "1.234,56" — remove thousand dots, swap decimal comma
        const cleaned = s.replace(/\./g, '').replace(',', '.');
        const n = parseFloat(cleaned);
        return isNaN(n) ? 0 : n;
    }
    // No comma: dot is the decimal separator (or plain integer)
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

/**
 * Parse a date string DD/MM/YYYY into YYYY-MM-DD.
 * Returns null if unparseable.
 */
function parseDate(raw: unknown): string | null {
    if (!raw) return null;

    // Se for número (provavelmente data serial do Excel)
    if (typeof raw === 'number') {
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
    // Already YYYY-MM-DD?
    if (/^\d{4}-\d{2}-\d{2}(\s|T)?/.test(s)) return s.substring(0, 10);
    return null;
}

// ── POST /logistica/notas-embarque/upload ────────────────────────────────
/**
 * @swagger
 * /logistica/notas-embarque/upload:
 *   post:
 *     tags: [Logística]
 *     summary: Upload de notas de embarque via CSV (parseado como JSON pelo frontend)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rows:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Upload processado
 */
painelRouter.post(
    '/logistica/notas-embarque/upload',
    express.json({ limit: '10mb' }),
    requirePermission('logistica_painel', 'editar'),
    async (req, res) => {
        const client = await pool.connect();
        try {
            const auth = (req as any).user || {};
            const userId = auth.id || null;
            const { rows: inputRows } = req.body;

            if (!Array.isArray(inputRows) || inputRows.length === 0) {
                return res.status(400).json({ error: 'Nenhuma linha recebida.' });
            }

            await client.query('BEGIN');

            // Generate a new upload_id
            const uploadId = crypto.randomUUID();

            // Insert rows in batches of 100
            const BATCH_SIZE = 100;
            let inserted = 0;
            const errors: { linha: number; erro: string }[] = [];

            for (let i = 0; i < inputRows.length; i += BATCH_SIZE) {
                const batch = inputRows.slice(i, i + BATCH_SIZE);
                const values: unknown[] = [];
                const placeholders: string[] = [];

                batch.forEach((row: Record<string, unknown>, batchIdx: number) => {
                    const rowNum = i + batchIdx + 1;

                    // Filter out total/summary rows
                    const ordemVenda = String(getField(row, 'Ordem de venda', 'ordem_venda')).trim();
                    if (!ordemVenda || ordemVenda.toLowerCase() === 'total') {
                        return; // Skip total row
                    }

                    const nomeCliente = String(getField(row, 'Nome do cliente', 'nome_cliente')).trim();
                    const transportadora = String(getField(row, 'Transportadora', 'transportadora')).trim();
                    const notaFiscal = String(getField(row, 'Nota fiscal', 'Nota Fiscal', 'nota_fiscal')).trim();
                    const valorNet = parsePtBrNumber(getField(row, 'Valor NET', 'Valor Net', 'valor_net'));
                    const pesoBruto = parsePtBrNumber(getField(row, 'Peso bruto', 'Peso Bruto', 'peso_bruto'));
                    const qtdVolume = Math.round(parsePtBrNumber(getField(row, 'Quantidade de volume', 'Qtd. Volume', 'qtd_volume')));
                    const dataEmissao = parseDate(getField(row, 'Data', 'Data emissão', 'Data Emissão', 'data_emissao'));
                    const tipoOperacao = String(getField(row, 'Tipo de operação de venda', 'Tipo de Operação de Venda', 'tipo_operacao')).trim();
                    const condicoesEntrega = String(getField(row, 'Condições de entrega', 'Condições de Entrega', 'condicoes_entrega')).trim();
                    const tipoFrete = String(getField(row, 'Tipo de frete', 'Tipo de Frete', 'tipo_frete')).trim();
                    const valorMoeda = parsePtBrNumber(getField(row, 'Valor na moeda', 'Valor na Moeda', 'valor_moeda'));
                    const diasAtraso = Math.round(parsePtBrNumber(getField(row, 'Dias em atraso', 'Dias em Atraso', 'dias_atraso')));

                    if (!notaFiscal) {
                        errors.push({ linha: rowNum, erro: 'Nota fiscal ausente' });
                        return;
                    }

                    const offset = values.length;
                    values.push(
                        uploadId,                   // $1
                        ordemVenda,                 // $2
                        nomeCliente,                // $3
                        transportadora,             // $4
                        notaFiscal,                 // $5
                        valorNet,                   // $6
                        pesoBruto,                  // $7
                        qtdVolume,                  // $8
                        dataEmissao,                // $9
                        tipoOperacao,               // $10
                        condicoesEntrega,           // $11
                        tipoFrete,                  // $12
                        valorMoeda,                 // $13
                        diasAtraso,                 // $14
                        userId                      // $15
                    );

                    placeholders.push(
                        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15})`
                    );

                    inserted++;
                });

                if (placeholders.length > 0) {
                    await client.query(
                        `INSERT INTO logistica_notas_embarque
                            (upload_id, ordem_venda, nome_cliente, transportadora, nota_fiscal,
                             valor_net, peso_bruto, qtd_volume, data_emissao, tipo_operacao,
                             condicoes_entrega, tipo_frete, valor_moeda, dias_atraso, uploaded_by)
                         VALUES ${placeholders.join(', ')}`,
                        values
                    );
                }
            }

            // Only replace previous data if something was actually inserted
            if (inserted > 0 && userId) {
                await client.query(
                    `DELETE FROM logistica_notas_embarque WHERE uploaded_by = $1 AND upload_id != $2`,
                    [userId, uploadId]
                );
            } else if (inserted === 0) {
                // Nothing inserted — rollback to preserve previous data
                await client.query('ROLLBACK');
                logger.warn({ userId, errors: errors.length }, 'Upload sem linhas válidas');
                return res.json({
                    uploadId,
                    inserted: 0,
                    errors,
                    message: `Nenhuma nota importada.${errors.length > 0 ? ` ${errors.length} linhas com erro.` : ' Verifique se o arquivo está no formato correto.'}`,
                });
            }

            await client.query('COMMIT');

            logger.info({ userId, uploadId, inserted, errors: errors.length }, 'Notas embarque upload completo');

            res.json({
                uploadId,
                inserted,
                errors,
                message: `${inserted} notas importadas com sucesso.${errors.length > 0 ? ` ${errors.length} linhas com erro.` : ''}`,
            });

        } catch (e: any) {
            await client.query('ROLLBACK');
            logger.error({ err: e }, 'Erro no upload de notas de embarque');
            res.status(500).json({ error: 'Erro ao processar upload.' });
        } finally {
            client.release();
        }
    }
);

// ── GET /logistica/notas-embarque ────────────────────────────────────────
/**
 * @swagger
 * /logistica/notas-embarque:
 *   get:
 *     tags: [Logística]
 *     summary: Lista notas de embarque (último upload)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de notas
 */
painelRouter.get(
    '/logistica/notas-embarque',
    requirePermission('logistica_painel', 'ver'),
    async (_req, res) => {
        try {
            // Get the latest upload_id
            const latestUpload = await pool.query(
                `SELECT upload_id, uploaded_at, uploaded_by
                 FROM logistica_notas_embarque
                 ORDER BY uploaded_at DESC
                 LIMIT 1`
            );

            if (latestUpload.rows.length === 0) {
                return res.json({ items: [], uploadInfo: null });
            }

            const { upload_id, uploaded_at, uploaded_by } = latestUpload.rows[0];

            // Get all rows for this upload
            const { rows } = await pool.query(
                `SELECT * FROM logistica_notas_embarque
                 WHERE upload_id = $1
                 ORDER BY dias_atraso DESC`,
                [upload_id]
            );

            // Get uploader name
            let uploaderName = null;
            if (uploaded_by) {
                const userResult = await pool.query(
                    `SELECT nome FROM usuarios WHERE id = $1`,
                    [uploaded_by]
                );
                uploaderName = userResult.rows[0]?.nome || null;
            }

            res.json({
                items: rows,
                uploadInfo: {
                    uploadId: upload_id,
                    uploadedAt: uploaded_at,
                    uploadedBy: uploaded_by,
                    uploaderName,
                    totalRows: rows.length,
                },
            });

        } catch (e: any) {
            logger.error({ err: e }, 'Erro ao listar notas de embarque');
            res.status(500).json({ error: 'Erro ao buscar notas.' });
        }
    }
);

// ── DELETE /logistica/notas-embarque/:uploadId ───────────────────────────
/**
 * @swagger
 * /logistica/notas-embarque/{uploadId}:
 *   delete:
 *     tags: [Logística]
 *     summary: Remove um upload de notas
 *     security:
 *       - bearerAuth: []
 */
painelRouter.delete(
    '/logistica/notas-embarque/:uploadId',
    requirePermission('logistica_painel', 'editar'),
    async (req, res) => {
        try {
            const { uploadId } = req.params;
            const result = await pool.query(
                `DELETE FROM logistica_notas_embarque WHERE upload_id = $1`,
                [uploadId]
            );

            res.json({ deleted: result.rowCount });
        } catch (e: any) {
            logger.error({ err: e }, 'Erro ao deletar notas de embarque');
            res.status(500).json({ error: 'Erro ao deletar.' });
        }
    }
);
