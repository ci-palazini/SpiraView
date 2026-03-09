import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';
import { logger } from '../../logger';

export const dashboardGeralRouter: Router = Router();

// GET /qualidade/dashboard-geral - Resumo consolidado de Qualidade (Refugo + Retrabalho)
dashboardGeralRouter.get('/qualidade/dashboard-geral',
    requirePermission('qualidade_dashboard', 'ver'),
    async (req, res) => {
        try {
            const dataInicio = req.query.dataInicio as string;
            const dataFim = req.query.dataFim as string;
            const tipo = req.query.tipo as string;
            const tipoLancamento = req.query.tipoLancamento as string;

            const baseParams: any[] = [];
            let dateWhere = '1=1';

            if (dataInicio) {
                baseParams.push(dataInicio);
                dateWhere += ` AND data >= $${baseParams.length}`;
            }
            if (dataFim) {
                baseParams.push(dataFim);
                dateWhere += ` AND data <= $${baseParams.length}`;
            }

            // O refugo usa data_ocorrencia, retrabalho usa data
            let refugoWhere = dateWhere.replace(/data/g, 'data_ocorrencia');
            const refugoParams = [...baseParams];

            if (tipo && (tipo === 'INTERNO' || tipo === 'EXTERNO')) {
                refugoParams.push(tipo);
                refugoWhere += ` AND EXISTS (SELECT 1 FROM qualidade_origens qo WHERE qo.nome = qualidade_refugos.origem AND qo.tipo = $${refugoParams.length})`;
            }
            if (tipoLancamento && tipoLancamento !== 'ambos') {
                refugoParams.push(tipoLancamento);
                refugoWhere += ` AND tipo_lancamento ILIKE $${refugoParams.length}`;
            }

            const retrabalhoWhere = dateWhere;
            const retrabalhoParams = [...baseParams];

            // 1. KPIs Refugo
            const totaisRefugoQuery = await pool.query(
                `SELECT SUM(custo) as total, SUM(quantidade) as pecas, COUNT(*) as ocorrencias FROM qualidade_refugos WHERE ${refugoWhere}`, refugoParams
            );

            // 2. KPIs Retrabalho
            // extract epoch from interval hours to get total hours
            const totaisRetrabalhoQuery = await pool.query(
                `SELECT 
                    COUNT(*) as ocorrencias, 
                    SUM(
                        CASE WHEN horas_retrabalho IS NOT NULL AND horas_retrabalho != '' THEN
                            EXTRACT(EPOCH FROM horas_retrabalho::interval)/3600.0
                        ELSE 0 END
                    ) as horas_totais 
                 FROM qualidade_retrabalho 
                 WHERE ${retrabalhoWhere}`, retrabalhoParams
            );

            // 3. Top Defeitos (Refugo)
            const topDefeitosQuery = await pool.query(
                `SELECT motivo_defeito, SUM(quantidade) as qtd, SUM(custo) as custo 
                 FROM qualidade_refugos 
                 WHERE ${refugoWhere} 
                 GROUP BY motivo_defeito 
                 ORDER BY custo DESC 
                 LIMIT 5`, refugoParams
            );

            // 4. Top Origens (Refugo)
            const topOrigensQuery = await pool.query(
                `SELECT origem, SUM(custo) as custo 
                 FROM qualidade_refugos 
                 WHERE ${refugoWhere} 
                 GROUP BY origem 
                 ORDER BY custo DESC
                 LIMIT 5`, refugoParams
            );

            // 5. Top Não-Conformidades (Retrabalho)
            const topNcsQuery = await pool.query(
                `SELECT nao_conformidade, COUNT(*) as qtd, SUM(
                    CASE WHEN horas_retrabalho IS NOT NULL AND horas_retrabalho != '' THEN
                        EXTRACT(EPOCH FROM horas_retrabalho::interval)/3600.0
                    ELSE 0 END
                ) as horas
                 FROM qualidade_retrabalho 
                 WHERE ${retrabalhoWhere} 
                 GROUP BY nao_conformidade 
                 ORDER BY qtd DESC
                 LIMIT 5`, retrabalhoParams
            );

            let trendsRefugoWhere = `data_ocorrencia >= date_trunc('month', current_date - interval '5 months')`;
            const trendsParams: any[] = [];

            if (tipo && (tipo === 'INTERNO' || tipo === 'EXTERNO')) {
                trendsParams.push(tipo);
                trendsRefugoWhere += ` AND EXISTS (SELECT 1 FROM qualidade_origens qo WHERE qo.nome = qualidade_refugos.origem AND qo.tipo = $${trendsParams.length})`;
            }
            if (tipoLancamento && tipoLancamento !== 'ambos') {
                trendsParams.push(tipoLancamento);
                trendsRefugoWhere += ` AND tipo_lancamento ILIKE $${trendsParams.length}`;
            }

            // 6. Tendência mensal (últimos 6 meses)
            // Combinar dados de refugo e retrabalho por mês
            const trendsQuery = await pool.query(
                `WITH meses AS (
                    SELECT TO_CHAR(generate_series(
                        date_trunc('month', current_date - interval '5 months'),
                        date_trunc('month', current_date),
                        '1 month'
                    ), 'YYYY-MM') as periodo
                ),
                refugos_mes AS (
                    SELECT TO_CHAR(data_ocorrencia, 'YYYY-MM') as periodo, SUM(custo) as custo_refugo, COUNT(*) as qtd_refugo
                    FROM qualidade_refugos
                    WHERE ${trendsRefugoWhere}
                    GROUP BY periodo
                ),
                retrabalhos_mes AS (
                    SELECT TO_CHAR(data, 'YYYY-MM') as periodo, COUNT(*) as qtd_retrabalho, SUM(
                        CASE WHEN horas_retrabalho IS NOT NULL AND horas_retrabalho != '' THEN
                            EXTRACT(EPOCH FROM horas_retrabalho::interval)/3600.0
                        ELSE 0 END
                    ) as horas_retrabalho
                    FROM qualidade_retrabalho
                    WHERE data >= date_trunc('month', current_date - interval '5 months')
                    GROUP BY periodo
                )
                SELECT 
                    m.periodo,
                    COALESCE(rf.custo_refugo, 0) as custo_refugo,
                    COALESCE(rf.qtd_refugo, 0) as qtd_refugo,
                    COALESCE(rt.qtd_retrabalho, 0) as qtd_retrabalho,
                    COALESCE(rt.horas_retrabalho, 0) as horas_retrabalho
                FROM meses m
                LEFT JOIN refugos_mes rf ON m.periodo = rf.periodo
                LEFT JOIN retrabalhos_mes rt ON m.periodo = rt.periodo
                ORDER BY m.periodo ASC`, trendsParams
            );

            const custoTotalRefugo = parseFloat(totaisRefugoQuery.rows[0]?.total || '0');
            const ocorrenciasRefugo = parseInt(totaisRefugoQuery.rows[0]?.ocorrencias || '0');
            const pecasRefugo = parseInt(totaisRefugoQuery.rows[0]?.pecas || '0');

            const ocorrenciasRetrabalho = parseInt(totaisRetrabalhoQuery.rows[0]?.ocorrencias || '0');
            const horasRetrabalho = parseFloat(totaisRetrabalhoQuery.rows[0]?.horas_totais || '0');

            res.json({
                kpis: {
                    refugo: {
                        custoTotal: custoTotalRefugo,
                        ocorrencias: ocorrenciasRefugo,
                        pecas: pecasRefugo
                    },
                    retrabalho: {
                        ocorrencias: ocorrenciasRetrabalho,
                        horasTotais: Math.round(horasRetrabalho * 10) / 10
                    }
                },
                topDefeitos: topDefeitosQuery.rows.map(r => ({
                    nome: r.motivo_defeito,
                    custo: parseFloat(r.custo),
                    qtd: parseInt(r.qtd)
                })),
                topOrigens: topOrigensQuery.rows.map(r => ({
                    nome: r.origem,
                    custo: parseFloat(r.custo)
                })),
                topNcs: topNcsQuery.rows.map(r => ({
                    nome: r.nao_conformidade,
                    qtd: parseInt(r.qtd),
                    horas: parseFloat(r.horas || '0')
                })),
                trends: trendsQuery.rows.map(r => ({
                    period: r.periodo,
                    custo_refugo: parseFloat(r.custo_refugo),
                    qtd_refugo: parseInt(r.qtd_refugo),
                    qtd_retrabalho: parseInt(r.qtd_retrabalho),
                    horas_retrabalho: parseFloat(r.horas_retrabalho)
                }))
            });

        } catch (e: any) {
            logger.error({ err: e }, 'Erro na rota dashboard-geral');
            res.status(500).json({ error: String(e) });
        }
    });

