import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';

export const kpisRouter: Router = Router();

// GET /logistica/kpis - Get monthly data
kpisRouter.get('/logistica/kpis',
    requirePermission('logistica_dashboard', 'ver'),
    async (req, res) => {
        try {
            const mes = parseInt(req.query.mes as string);
            const ano = parseInt(req.query.ano as string);

            if (!mes || !ano) {
                return res.status(400).json({ error: 'Mês e Ano são obrigatórios.' });
            }

            // 1. Get Meta
            const metaQuery = await pool.query(
                `SELECT * FROM logistica_metas WHERE mes = $1 AND ano = $2`,
                [mes, ano]
            );

            // 2. Get Daily Records
            // Using a date range query for the specific month
            const kpisQuery = await pool.query(
                `SELECT * FROM logistica_kpis_diario 
                 WHERE EXTRACT(MONTH FROM data) = $1 AND EXTRACT(YEAR FROM data) = $2
                 ORDER BY data ASC`,
                [mes, ano]
            );

            // 3. Get Previous Month Data (Full month for grid comparison)
            let prevMes = mes - 1;
            let prevAno = ano;
            if (prevMes === 0) {
                prevMes = 12;
                prevAno = ano - 1;
            }

            const prevMonthQuery = await pool.query(
                `SELECT * FROM logistica_kpis_diario 
                 WHERE EXTRACT(MONTH FROM data) = $1 AND EXTRACT(YEAR FROM data) = $2
                 ORDER BY data ASC`,
                [prevMes, prevAno]
            );

            res.json({
                meta: metaQuery.rows[0] || null,
                items: kpisQuery.rows,
                previousItems: prevMonthQuery.rows
            });

        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    }
);

// PUT /logistica/kpis/:data - Upsert daily data
kpisRouter.put('/logistica/kpis/:data',
    requirePermission('logistica_kpis', 'editar'),
    async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { data } = req.params; // YYYY-MM-DD
            const payload = req.body;

            // Basic validation
            if (!data) return res.status(400).json({ error: 'Data obrigatória' });

            // Check if exists
            const check = await client.query(
                `SELECT id FROM logistica_kpis_diario WHERE data = $1`,
                [data]
            );

            let result;
            if (check.rows.length === 0) {
                // Insert
                result = await client.query(
                    `INSERT INTO logistica_kpis_diario (
                        data, faturado_acumulado, exportacao_acumulado, devolucoes_dia, 
                        total_linhas, linhas_atraso, backlog_atraso, ottr_ytd, is_dia_util, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                    RETURNING *`,
                    [
                        data,
                        payload.faturado_acumulado ?? 0,
                        payload.exportacao_acumulado ?? 0,
                        payload.devolucoes_dia ?? 0,
                        payload.total_linhas ?? 0,
                        payload.linhas_atraso ?? 0,
                        payload.backlog_atraso ?? 0,
                        payload.ottr_ytd ?? 0,
                        payload.is_dia_util ?? true
                    ]
                );
            } else {
                // Update
                const id = check.rows[0].id;
                // Construct dynamic update to avoid overwriting with nulls if partial update
                // But for simplicity in this grid, usually we send full row or handle individual fields.
                // Assuming full payload for simplicity or using COALESCE logic in SQL

                result = await client.query(
                    `UPDATE logistica_kpis_diario SET
                        faturado_acumulado = COALESCE($2, faturado_acumulado),
                        exportacao_acumulado = COALESCE($3, exportacao_acumulado),
                        devolucoes_dia = COALESCE($4, devolucoes_dia),
                        total_linhas = COALESCE($5, total_linhas),
                        linhas_atraso = COALESCE($6, linhas_atraso),
                        backlog_atraso = COALESCE($7, backlog_atraso),
                        ottr_ytd = COALESCE($8, ottr_ytd),
                        is_dia_util = COALESCE($9, is_dia_util),
                        updated_at = NOW()
                    WHERE id = $1
                    RETURNING *`,
                    [
                        id,
                        payload.faturado_acumulado,
                        payload.exportacao_acumulado,
                        payload.devolucoes_dia,
                        payload.total_linhas,
                        payload.linhas_atraso,
                        payload.backlog_atraso,
                        payload.ottr_ytd,
                        payload.is_dia_util
                    ]
                );
            }

            await client.query('COMMIT');
            res.json(result.rows[0]);

        } catch (e: any) {
            await client.query('ROLLBACK');
            console.error(e);
            res.status(500).json({ error: String(e) });
        } finally {
            client.release();
        }
    }
);

// PUT /logistica/metas/:mes/:ano - Upsert meta
kpisRouter.put('/logistica/metas/:mes/:ano',
    requirePermission('logistica_kpis', 'editar'),
    async (req, res) => {
        try {
            const mes = parseInt(req.params.mes);
            const ano = parseInt(req.params.ano);
            const { meta_financeira } = req.body;

            if (!mes || !ano) return res.status(400).json({ error: 'Mês e Ano obrigatórios' });

            const check = await pool.query(
                `SELECT id FROM logistica_metas WHERE mes = $1 AND ano = $2`,
                [mes, ano]
            );

            let result;
            if (check.rows.length === 0) {
                result = await pool.query(
                    `INSERT INTO logistica_metas (mes, ano, meta_financeira, updated_at)
                     VALUES ($1, $2, $3, NOW()) RETURNING *`,
                    [mes, ano, meta_financeira || 0]
                );
            } else {
                result = await pool.query(
                    `UPDATE logistica_metas SET meta_financeira = $1, updated_at = NOW()
                     WHERE mes = $2 AND ano = $3 RETURNING *`,
                    [meta_financeira, mes, ano]
                );
            }

            res.json(result.rows[0]);

        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    }
);
