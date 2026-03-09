import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';
import { logger } from '../../logger';
import { buildQualidadeWhere, qualidadeFiltrosSchema } from './whereBuilders';

export const analyticsRouter: Router = Router();

// buildBaseWhere: filtros sem datas (usado em contextos onde datas vêm de outro nível)
const buildBaseWhere = (params: unknown[], query: Record<string, unknown>) =>
    buildQualidadeWhere(params, { ...query, dataInicio: undefined, dataFim: undefined } as Parameters<typeof buildQualidadeWhere>[1]);

// GET /qualidade/analytics/responsaveis
// Returns list of unique responsible names
analyticsRouter.get('/qualidade/analytics/responsaveis',
    requirePermission('qualidade_analitico', 'ver'),
    async (req, res) => {
        try {
            const parsed = qualidadeFiltrosSchema.safeParse(req.query);
            if (!parsed.success) {
                return res.status(400).json({ error: 'Parâmetros inválidos.', details: parsed.error.flatten().fieldErrors });
            }
            const filters = parsed.data;
            const params: any[] = [];
            const { tipo, dataInicio, dataFim, origem, tipoLancamento } = filters;

            let where = 'responsavel_nome IS NOT NULL AND responsavel_nome != \'\'';

            if (dataInicio) {
                params.push(dataInicio);
                where += ` AND data_ocorrencia >= $${params.length}`;
            }
            if (dataFim) {
                params.push(dataFim);
                where += ` AND data_ocorrencia <= $${params.length}`;
            }
            if (origem) {
                params.push(origem);
                where += ` AND origem = $${params.length}`;
            }
            if (tipo && (tipo === 'INTERNO' || tipo === 'EXTERNO')) {
                params.push(tipo);
                where += ` AND EXISTS (SELECT 1 FROM qualidade_origens qo WHERE qo.nome = qualidade_refugos.origem AND qo.tipo = $${params.length})`;
            }
            if (tipoLancamento) {
                params.push(tipoLancamento);
                where += ` AND tipo_lancamento = $${params.length}`;
            }

            const query = await pool.query(
                `SELECT DISTINCT responsavel_nome 
                 FROM qualidade_refugos 
                 WHERE ${where}
                 ORDER BY responsavel_nome ASC`,
                params
            );
            res.json({
                items: query.rows.map(r => r.responsavel_nome)
            });
        } catch (e: any) {
            logger.error({ err: e }, 'Erro na rota');
            res.status(500).json({ error: String(e) });
        }
    }
);

// GET /qualidade/analytics/summary
// Returns Top 5 Responsible and Total Cost
analyticsRouter.get('/qualidade/analytics/summary',
    requirePermission('qualidade_analitico', 'ver'),
    async (req, res) => {
        try {
            const parsed = qualidadeFiltrosSchema.safeParse(req.query);
            if (!parsed.success) {
                return res.status(400).json({ error: 'Parâmetros inválidos.', details: parsed.error.flatten().fieldErrors });
            }
            const params: any[] = [];
            const where = buildQualidadeWhere(params, parsed.data);

            // Total Cost
            const totalCostQuery = await pool.query(
                `SELECT SUM(custo) as total FROM qualidade_refugos WHERE ${where}`,
                params
            );

            // Top 5 Responsible
            const topResponsibleQuery = await pool.query(
                `SELECT responsavel_nome, SUM(custo) as custo 
                 FROM qualidade_refugos 
                 WHERE ${where} AND responsavel_nome IS NOT NULL AND responsavel_nome != ''
                 GROUP BY responsavel_nome 
                 ORDER BY custo DESC 
                 LIMIT 5`,
                params
            );

            // Top 5 Origins
            const topOriginsQuery = await pool.query(
                `SELECT origem, SUM(custo) as custo 
                 FROM qualidade_refugos 
                 WHERE ${where} AND origem IS NOT NULL AND origem != ''
                 GROUP BY origem 
                 ORDER BY custo DESC 
                 LIMIT 5`,
                params
            );

            // Cost Last Month
            const paramsLastMonth: any[] = [];
            const whereLastMonth = buildBaseWhere(paramsLastMonth, parsed.data);
            const lastMonthQuery = await pool.query(
                `SELECT SUM(custo) as total FROM qualidade_refugos 
                 WHERE ${whereLastMonth} 
                 AND data_ocorrencia >= date_trunc('month', current_date - interval '1 month')
                 AND data_ocorrencia < date_trunc('month', current_date)`,
                paramsLastMonth
            );

            // Cost Last Year (Previous Calendar Year)
            const paramsLastYear: any[] = [];
            const whereLastYear = buildBaseWhere(paramsLastYear, parsed.data);
            const lastYearQuery = await pool.query(
                `SELECT SUM(custo) as total FROM qualidade_refugos 
                  WHERE ${whereLastYear} 
                  AND data_ocorrencia >= date_trunc('year', current_date - interval '1 year')
                  AND data_ocorrencia < date_trunc('year', current_date)`,
                paramsLastYear
            );

            res.json({
                totalCost: parseFloat(totalCostQuery.rows[0]?.total || '0'),
                costLastMonth: parseFloat(lastMonthQuery.rows[0]?.total || '0'),
                costLastYear: parseFloat(lastYearQuery.rows[0]?.total || '0'),
                topResponsible: topResponsibleQuery.rows.map(r => ({
                    name: r.responsavel_nome,
                    cost: parseFloat(r.custo)
                })),
                topOrigins: topOriginsQuery.rows.map(r => ({
                    name: r.origem,
                    cost: parseFloat(r.custo)
                }))
            });

        } catch (e: any) {
            logger.error({ err: e }, 'Erro na rota');
            res.status(500).json({ error: String(e) });
        }
    }
);

// GET /qualidade/analytics/trends
// Returns Cost Evolution (Monthly/Daily)
analyticsRouter.get('/qualidade/analytics/trends',
    requirePermission('qualidade_analitico', 'ver'),
    async (req, res) => {
        try {
            const parsed = qualidadeFiltrosSchema.safeParse(req.query);
            if (!parsed.success) {
                return res.status(400).json({ error: 'Parâmetros inválidos.', details: parsed.error.flatten().fieldErrors });
            }
            const params: any[] = [];
            const where = buildQualidadeWhere(params, parsed.data);

            // Cost by Month (for the selected period)
            // Using TO_CHAR for formatting, assumes Postgres
            const trendQuery = await pool.query(
                `SELECT TO_CHAR(data_ocorrencia, 'YYYY-MM') as periodo, SUM(custo) as custo 
                 FROM qualidade_refugos 
                 WHERE ${where}
                 GROUP BY periodo 
                 ORDER BY periodo ASC`,
                params
            );

            res.json({
                trends: trendQuery.rows.map(r => ({
                    period: r.periodo,
                    cost: parseFloat(r.custo)
                }))
            });

        } catch (e: any) {
            logger.error({ err: e }, 'Erro na rota');
            res.status(500).json({ error: String(e) });
        }
    }
);

// GET /qualidade/analytics/details
// Returns detailed breakdown list (Responsible Stats)
analyticsRouter.get('/qualidade/analytics/details',
    requirePermission('qualidade_analitico', 'ver'),
    async (req, res) => {
        try {
            const parsed = qualidadeFiltrosSchema.safeParse(req.query);
            if (!parsed.success) {
                return res.status(400).json({ error: 'Parâmetros inválidos.', details: parsed.error.flatten().fieldErrors });
            }
            const params: any[] = [];
            const where = buildQualidadeWhere(params, parsed.data);

            // Responsible List with aggregation
            const listQuery = await pool.query(
                `SELECT 
                    responsavel_nome, 
                    SUM(custo) as total_custo, 
                    COUNT(*) as total_ocorrencias,
                    MAX(data_ocorrencia) as ultima_ocorrencia
                 FROM qualidade_refugos 
                 WHERE ${where} AND responsavel_nome IS NOT NULL AND responsavel_nome != ''
                 GROUP BY responsavel_nome 
                 ORDER BY total_custo DESC
                 LIMIT 100`, // Limiting for performance
                params
            );

            // Origin List with aggregation
            const originQuery = await pool.query(
                `SELECT 
                    origem,
                SUM(custo) as total_custo,
                COUNT(*) as total_ocorrencias,
                MAX(data_ocorrencia) as ultima_ocorrencia
                 FROM qualidade_refugos 
                 WHERE ${where} AND origem IS NOT NULL AND origem != ''
                 GROUP BY origem 
                 ORDER BY total_custo DESC
                 LIMIT 100`,
                params
            );

            res.json({
                items: listQuery.rows.map(r => ({
                    name: r.responsavel_nome,
                    totalCost: parseFloat(r.total_custo),
                    count: parseInt(r.total_ocorrencias),
                    lastOccurrence: r.ultima_ocorrencia
                })),
                originItems: originQuery.rows.map(r => ({
                    name: r.origem,
                    totalCost: parseFloat(r.total_custo),
                    count: parseInt(r.total_ocorrencias),
                    lastOccurrence: r.ultima_ocorrencia
                }))
            });

        } catch (e: any) {
            logger.error({ err: e }, 'Erro na rota');
            res.status(500).json({ error: String(e) });
        }
    }
);
