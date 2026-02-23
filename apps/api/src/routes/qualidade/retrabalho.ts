import { Router } from 'express';
import { pool, withTx } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';
import { logger } from '../../logger';

export const retrabalhoRouter: Router = Router();

// Normaliza horas de retrabalho para formato HH:MM:SS (max 10 chars)
function normalizeHoras(v: any): string | null {
    if (v == null || v === '') return null;
    const s = String(v).trim();
    if (s === '') return null;

    // Se for número decimal (Excel armazena horas como fração de dia: 0.0625 = 1h30m)
    const num = Number(s);
    if (!isNaN(num) && num >= 0 && num < 100) {
        // Se < 1, assume fração de dia (Excel default)
        if (num < 1) {
            const totalMinutes = Math.round(num * 24 * 60);
            const h = Math.floor(totalMinutes / 60);
            const m = totalMinutes % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
        }
        // Se >= 1, pode ser horas inteiras
        const h = Math.floor(num);
        const m = Math.round((num - h) * 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    }

    // Tenta extrair HH:MM:SS ou HH:MM de uma string
    const match = s.match(/(\d{1,3}):(\d{2})(?::(\d{2}))?/);
    if (match) {
        const h = match[1].padStart(2, '0');
        const m = match[2];
        const sec = match[3] || '00';
        return `${h}:${m}:${sec}`.substring(0, 10);
    }

    // Fallback: trunca para 10 chars
    return s.substring(0, 10);
}

// GET /qualidade/retrabalho - Listar registros de retrabalho
retrabalhoRouter.get('/qualidade/retrabalho',
    requirePermission('qualidade_retrabalho', 'ver'),
    async (req, res) => {
        try {
            const dataInicio = req.query.dataInicio as string;
            const dataFim = req.query.dataFim as string;
            const solicitante = req.query.solicitante as string | string[];
            const naoConformidade = req.query.naoConformidade as string | string[];
            const causaProvavel = req.query.causaProvavel as string;

            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;
            const offset = (page - 1) * limit;

            const params: any[] = [];
            let where = '1=1';

            if (dataInicio) {
                params.push(dataInicio);
                where += ` AND r.data >= $${params.length}`;
            }
            if (dataFim) {
                params.push(dataFim);
                where += ` AND r.data <= $${params.length}`;
            }
            if (solicitante) {
                if (Array.isArray(solicitante)) {
                    params.push(solicitante);
                    where += ` AND r.solicitante = ANY($${params.length})`;
                } else {
                    params.push(solicitante);
                    where += ` AND r.solicitante = $${params.length}`;
                }
            }
            if (naoConformidade) {
                if (Array.isArray(naoConformidade)) {
                    params.push(naoConformidade);
                    where += ` AND r.nao_conformidade = ANY($${params.length})`;
                } else {
                    params.push(naoConformidade);
                    where += ` AND r.nao_conformidade = $${params.length}`;
                }
            }
            if (causaProvavel) {
                params.push(causaProvavel);
                where += ` AND r.causa_provavel = $${params.length}`;
            }

            // Count total
            const countQuery = await pool.query(
                `SELECT COUNT(*) as total FROM qualidade_retrabalho r WHERE ${where}`,
                params
            );
            const total = parseInt(countQuery.rows[0].total);

            // Fetch data
            const query = `
                SELECT 
                    r.*,
                    u.nome as criado_por_nome,
                    p.numero as pdca_plano_numero
                FROM qualidade_retrabalho r
                LEFT JOIN usuarios u ON u.id = r.criado_por_id
                LEFT JOIN pdca_planos p ON p.id = r.pdca_plano_id
                WHERE ${where}
                ORDER BY r.data DESC, r.created_at DESC
                LIMIT $${params.length + 1} OFFSET $${params.length + 2}
            `;

            const { rows } = await pool.query(query, [...params, limit, offset]);

            res.json({
                items: rows,
                meta: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            });
        } catch (e: any) {
            logger.error({ err: e }, 'Erro na rota');
            res.status(500).json({ error: String(e) });
        }
    });

// POST /qualidade/retrabalho - Novo registro
retrabalhoRouter.post('/qualidade/retrabalho',
    requirePermission('qualidade_retrabalho', 'editar'),
    async (req, res) => {
        try {
            const user = (req as any).user;
            const {
                data,
                codigo,
                ordem_producao,
                descricao,
                nao_conformidade,
                solicitante,
                ocorrencia,
                severidade,
                deteccao,
                causa_provavel,
                ncr,
                horas_retrabalho,
                pdca_plano_id
            } = req.body;

            if (!data || !codigo || !ocorrencia || !severidade || !deteccao) {
                return res.status(400).json({ error: 'Campos obrigatórios faltando (data, código, ocorrência, severidade, detecção).' });
            }

            // Validate ranges
            if (ocorrencia < 1 || ocorrencia > 5 || severidade < 1 || severidade > 5 || deteccao < 1 || deteccao > 5) {
                return res.status(400).json({ error: 'Ocorrência, Severidade e Detecção devem estar entre 1 e 5.' });
            }

            // If total >= 18, pdca_plano_id should eventually be required
            const total = ocorrencia * severidade * deteccao;
            if (total >= 18 && !pdca_plano_id) {
                // Allow creation without pdca for now, but flag it
                // The frontend will enforce this
            }

            const insert = await pool.query(
                `INSERT INTO qualidade_retrabalho (
                    data, codigo, ordem_producao, descricao, nao_conformidade,
                    solicitante, ocorrencia, severidade, deteccao, causa_provavel,
                    ncr, horas_retrabalho, pdca_plano_id, criado_por_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING id`,
                [
                    data, codigo, ordem_producao || null, descricao || null,
                    nao_conformidade || null, solicitante || null,
                    ocorrencia, severidade, deteccao, causa_provavel || null,
                    ncr || null, normalizeHoras(horas_retrabalho),
                    pdca_plano_id || null, user?.id
                ]
            );

            res.status(201).json({ id: insert.rows[0].id, ok: true });
        } catch (e: any) {
            logger.error({ err: e }, 'Erro na rota');
            res.status(500).json({ error: String(e) });
        }
    });


// PUT /qualidade/retrabalho/:id - Atualizar (suporta update parcial)
retrabalhoRouter.put('/qualidade/retrabalho/:id',
    requirePermission('qualidade_retrabalho', 'editar'),
    async (req, res) => {
        try {
            const { id } = req.params;
            const payload = req.body.data || req.body;

            // Validate ranges if provided
            if (payload.ocorrencia !== undefined && (payload.ocorrencia < 1 || payload.ocorrencia > 5)) {
                return res.status(400).json({ error: 'Ocorrência deve estar entre 1 e 5.' });
            }
            if (payload.severidade !== undefined && (payload.severidade < 1 || payload.severidade > 5)) {
                return res.status(400).json({ error: 'Severidade deve estar entre 1 e 5.' });
            }
            if (payload.deteccao !== undefined && (payload.deteccao < 1 || payload.deteccao > 5)) {
                return res.status(400).json({ error: 'Detecção deve estar entre 1 e 5.' });
            }

            // Build dynamic SET clause from provided fields only
            const allowedFields: Record<string, (v: any) => any> = {
                data: (v) => v,
                codigo: (v) => v,
                ordem_producao: (v) => v || null,
                descricao: (v) => v || null,
                nao_conformidade: (v) => v || null,
                solicitante: (v) => v || null,
                ocorrencia: (v) => v,
                severidade: (v) => v,
                deteccao: (v) => v,
                causa_provavel: (v) => v || null,
                ncr: (v) => v || null,
                horas_retrabalho: (v) => normalizeHoras(v),
                pdca_plano_id: (v) => v || null,
            };

            const setClauses: string[] = [];
            const values: any[] = [];
            let paramIdx = 1;

            for (const [field, transform] of Object.entries(allowedFields)) {
                if (field in payload) {
                    setClauses.push(`${field} = $${paramIdx}`);
                    values.push(transform(payload[field]));
                    paramIdx++;
                }
            }

            if (setClauses.length === 0) {
                return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
            }

            values.push(id);
            const update = await pool.query(
                `UPDATE qualidade_retrabalho SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
                values
            );

            if ((update as any).rowCount === 0) {
                return res.status(404).json({ error: 'Registro não encontrado ou sem alteração.' });
            }

            res.json({ ok: true });
        } catch (e: any) {
            logger.error({ err: e }, 'Erro na rota');
            res.status(500).json({ error: String(e) });
        }
    });

// DELETE /qualidade/retrabalho/:id - Excluir
retrabalhoRouter.delete('/qualidade/retrabalho/:id',
    requirePermission('qualidade_retrabalho', 'editar'),
    async (req, res) => {
        try {
            const { id } = req.params;
            const del = await pool.query('DELETE FROM qualidade_retrabalho WHERE id = $1', [id]);

            if ((del as any).rowCount === 0) {
                return res.status(404).json({ error: 'Registro não encontrado.' });
            }

            res.json({ ok: true });
        } catch (e: any) {
            logger.error({ err: e }, 'Erro na rota');
            res.status(500).json({ error: String(e) });
        }
    });

// POST /qualidade/retrabalho/upload - Upload em lote
retrabalhoRouter.post('/qualidade/retrabalho/upload',
    requirePermission('qualidade_retrabalho', 'editar'),
    async (req, res) => {
        try {
            const { items } = req.body;
            const auth = (req as any).user || {};

            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: 'Nenhum item para importar.' });
            }

            const resultados = {
                sucesso: 0,
                ignorado: 0,
                erro: 0,
                erros: [] as string[]
            };

            await withTx(async (client) => {
                const validItems: any[] = [];
                const distinctDates = new Set<string>();

                for (const [index, item] of items.entries()) {
                    const rowNum = index + 2;

                    const missingFields = [];
                    if (!item.data) missingFields.push('Data');
                    if (!item.codigo) missingFields.push('Código');
                    if (!item.ocorrencia) missingFields.push('Ocorrência');
                    if (!item.severidade) missingFields.push('Severidade');
                    if (!item.deteccao) missingFields.push('Detecção');

                    if (missingFields.length > 0) {
                        resultados.erro++;
                        resultados.erros.push(`Linha ${rowNum}: Faltando campos: ${missingFields.join(', ')}.`);
                        continue;
                    }

                    // Validate ranges
                    const occ = Number(item.ocorrencia);
                    const sev = Number(item.severidade);
                    const det = Number(item.deteccao);
                    if (occ < 1 || occ > 5 || sev < 1 || sev > 5 || det < 1 || det > 5) {
                        resultados.erro++;
                        resultados.erros.push(`Linha ${rowNum}: Ocorrência, Severidade e Detecção devem estar entre 1 e 5.`);
                        continue;
                    }

                    const normalizedItem = {
                        ...item,
                        ocorrencia: occ,
                        severidade: sev,
                        deteccao: det,
                        row_index: rowNum
                    };

                    validItems.push(normalizedItem);
                    distinctDates.add(normalizedItem.data);
                }

                if (validItems.length === 0) return;

                // Deduplication: check existing records for same dates
                const datesArray = Array.from(distinctDates);
                const existingRes = await client.query(
                    `SELECT data, codigo, ncr
                     FROM qualidade_retrabalho
                     WHERE data = ANY($1::date[])`,
                    [datesArray]
                );

                const existingSet = new Set<string>();
                existingRes.rows.forEach((row: any) => {
                    const d = row.data instanceof Date
                        ? row.data.toISOString().split('T')[0]
                        : String(row.data).split('T')[0];
                    const key = `${d}|${row.codigo}|${row.ncr || ''}`;
                    existingSet.add(key.toUpperCase());
                });

                const toInsert: any[] = [];
                for (const item of validItems) {
                    const d = item.data.split('T')[0];
                    const key = `${d}|${item.codigo}|${item.ncr || ''}`;

                    if (existingSet.has(key.toUpperCase())) {
                        resultados.ignorado++;
                    } else {
                        toInsert.push(item);
                    }
                }

                // Batch insert
                if (toInsert.length > 0) {
                    const chunkSize = 500;
                    for (let i = 0; i < toInsert.length; i += chunkSize) {
                        const chunk = toInsert.slice(i, i + chunkSize);

                        const values: any[] = [];
                        const placeHolders: string[] = [];
                        let paramIdx = 1;

                        for (const row of chunk) {
                            placeHolders.push(
                                `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}, $${paramIdx + 11}, $${paramIdx + 12})`
                            );

                            values.push(
                                row.data,
                                row.codigo,
                                row.ordem_producao || null,
                                row.descricao || null,
                                row.nao_conformidade || null,
                                row.solicitante || null,
                                row.ocorrencia,
                                row.severidade,
                                row.deteccao,
                                row.causa_provavel || null,
                                row.ncr || null,
                                normalizeHoras(row.horas_retrabalho),
                                auth.id || null
                            );
                            paramIdx += 13;
                        }

                        const query = `
                            INSERT INTO qualidade_retrabalho
                            (data, codigo, ordem_producao, descricao, nao_conformidade,
                             solicitante, ocorrencia, severidade, deteccao, causa_provavel,
                             ncr, horas_retrabalho, criado_por_id)
                            VALUES ${placeHolders.join(', ')}
                        `;

                        await client.query(query, values);
                    }
                    resultados.sucesso = toInsert.length;
                }
            });

            res.json({
                ok: true,
                summary: resultados
            });
        } catch (error: any) {
            logger.error({ err: error }, 'Erro no upload de retrabalho:');
            res.status(500).json({ error: 'Erro interno ao processar upload.' });
        }
    });

// GET /qualidade/retrabalho/analise - Horas agrupadas por causa (4M1D)
retrabalhoRouter.get('/qualidade/retrabalho/analise',
    requirePermission('qualidade_retrabalho', 'ver'),
    async (req, res) => {
        try {
            const dataInicio = req.query.dataInicio as string;
            const dataFim = req.query.dataFim as string;
            const solicitante = req.query.solicitante as string | string[];

            if (!dataInicio || !dataFim) {
                return res.status(400).json({ error: 'dataInicio e dataFim são obrigatórios.' });
            }

            const params: any[] = [dataInicio, dataFim];
            let where = 'r.data >= $1 AND r.data <= $2';

            if (solicitante) {
                if (Array.isArray(solicitante)) {
                    if (solicitante.length > 0) {
                        params.push(solicitante);
                        where += ` AND r.solicitante = ANY($${params.length})`;
                    }
                } else {
                    params.push(solicitante);
                    where += ` AND r.solicitante = $${params.length}`;
                }
            }

            // Aggregate hours by causa_provavel
            const query = `
                SELECT
                    COALESCE(r.causa_provavel, 'N/A') as causa,
                    COUNT(*) as total_registros,
                    COALESCE(SUM(
                        CASE
                            WHEN r.horas_retrabalho IS NOT NULL AND r.horas_retrabalho != '' THEN
                                EXTRACT(EPOCH FROM r.horas_retrabalho::interval) / 3600.0
                            ELSE 0
                        END
                    ), 0) as total_horas
                FROM qualidade_retrabalho r
                WHERE ${where}
                GROUP BY r.causa_provavel
                ORDER BY total_horas DESC
            `;

            const { rows } = await pool.query(query, params);

            // Calculate totals
            let totalHoras = 0;
            let totalRegistros = 0;
            const items = rows.map((row: any) => {
                const horas = parseFloat(row.total_horas) || 0;
                const registros = parseInt(row.total_registros) || 0;
                totalHoras += horas;
                totalRegistros += registros;
                return {
                    causa: row.causa,
                    totalHoras: Math.round(horas * 100) / 100,
                    totalRegistros: registros,
                };
            });

            res.json({
                items,
                totalHoras: Math.round(totalHoras * 100) / 100,
                totalRegistros,
                periodo: { inicio: dataInicio, fim: dataFim },
            });
        } catch (e: any) {
            logger.error({ err: e }, 'Erro na análise de retrabalho:');
            res.status(500).json({ error: String(e) });
        }
    });
