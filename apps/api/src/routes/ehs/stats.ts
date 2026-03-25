// apps/api/src/routes/ehs/stats.ts
import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';
import { listResponse } from '../../utils/response';
import { logger } from '../../logger';

export const ehsStatsRouter: Router = Router();

/**
 * GET /ehs/stats-avancadas?ano=YYYY
 * Retorna estatísticas avançadas de BBS: evolução mensal, ranking de departamentos, comparação entre anos.
 */
ehsStatsRouter.get(
    '/ehs/stats-avancadas',
    requirePermission('safety', 'ver'),
    async (req, res) => {
        try {
            const ano = Number(req.query.ano) || new Date().getFullYear();

            // 1. Evolução mensal agregada
            const evolucaoResult = await pool.query(
                `WITH monthly_stats AS (
                    SELECT
                        EXTRACT(MONTH FROM so.data_observacao)::int AS mes,
                        COUNT(*)::int AS total_observacoes,
                        COUNT(DISTINCT so.usuario_id)::int AS participantes
                    FROM safety_observacoes so
                    WHERE EXTRACT(YEAR FROM so.data_observacao)::int = $1::int
                    GROUP BY mes
                ),
                total_users AS (
                    SELECT COUNT(*)::int AS total FROM usuarios WHERE ativo = true
                )
                SELECT
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'mes', m.mes,
                                'totalObservacoes', COALESCE(ms.total_observacoes, 0),
                                'participantes', COALESCE(ms.participantes, 0),
                                'taxaCompliance', 
                                    (CASE 
                                        WHEN tu.total > 0 THEN ROUND((COALESCE(ms.participantes, 0)::numeric / tu.total) * 100, 1)
                                        ELSE 0
                                    END)::float
                            ) ORDER BY m.mes
                        ),
                        '[]'::json
                    ) AS data
                FROM generate_series(1, 12) AS m(mes)
                CROSS JOIN total_users tu
                LEFT JOIN monthly_stats ms ON ms.mes = m.mes`,
                [ano]
            );

            const evolucaoMensal = {
                meses: [] as number[],
                totalObservacoes: [] as number[],
                participantes: [] as number[],
                taxaCompliance: [] as number[]
            };

            const evolucaoData = evolucaoResult.rows[0]?.data || [];
            evolucaoData.forEach((item: any) => {
                evolucaoMensal.meses.push(item.mes);
                evolucaoMensal.totalObservacoes.push(item.totalObservacoes);
                evolucaoMensal.participantes.push(item.participantes);
                evolucaoMensal.taxaCompliance.push(item.taxaCompliance);
            });

            // 2. Ranking de departamentos
            const rankingResult = await pool.query(
                `WITH dept_stats AS (
                    SELECT
                        d.id AS departamento_id,
                        d.nome AS departamento_nome,
                        COUNT(DISTINCT u.id) AS total_users,
                        COUNT(DISTINCT so.usuario_id) AS participantes,
                        COUNT(so.id)::int AS total_observacoes
                    FROM departamentos d
                    LEFT JOIN usuarios u ON u.departamento_id = d.id AND u.ativo = true
                    LEFT JOIN safety_observacoes so ON so.usuario_id = u.id 
                        AND EXTRACT(YEAR FROM so.data_observacao)::int = $1::int
                    GROUP BY d.id, d.nome
                    HAVING COUNT(DISTINCT u.id) > 0
                )
                SELECT
                    departamento_id AS "departamentoId",
                    departamento_nome AS "departamentoNome",
                    total_observacoes AS "totalObservacoes",
                    participantes::int AS "participantes",
                    (CASE 
                        WHEN total_users > 0 THEN ROUND((participantes::numeric / total_users) * 100, 1)
                        ELSE 0
                    END)::float AS "compliance",
                    (CASE 
                        WHEN participantes > 0 THEN ROUND(total_observacoes::numeric / participantes, 1)
                        ELSE 0
                    END)::float AS "mediaObsPorParticipante"
                FROM dept_stats
                ORDER BY "compliance" DESC, "totalObservacoes" DESC`,
                [ano]
            );

            // 3. Comparação com ano anterior
            const anoAnterior = ano - 1;
            
            const comparacaoResult = await pool.query(
                `WITH stats_ano AS (
                    SELECT
                        $1::int AS ano,
                        COUNT(*)::int AS total_obs,
                        COUNT(DISTINCT usuario_id)::int AS participantes
                    FROM safety_observacoes
                    WHERE EXTRACT(YEAR FROM data_observacao)::int = $1::int
                ),
                stats_ano_ant AS (
                    SELECT
                        $2::int AS ano,
                        COUNT(*)::int AS total_obs,
                        COUNT(DISTINCT usuario_id)::int AS participantes
                    FROM safety_observacoes
                    WHERE EXTRACT(YEAR FROM data_observacao)::int = $2::int
                ),
                total_users AS (
                    SELECT COUNT(*)::int AS total FROM usuarios WHERE ativo = true
                )
                SELECT
                    json_build_object(
                        'totalObservacoes', COALESCE(sa.total_obs, 0),
                        'participantes', COALESCE(sa.participantes, 0),
                        'compliance', 
                            (CASE 
                                WHEN tu.total > 0 THEN ROUND((COALESCE(sa.participantes, 0)::numeric / tu.total) * 100, 1)
                                ELSE 0
                            END)::float
                    ) AS "anoAtual",
                    json_build_object(
                        'totalObservacoes', COALESCE(saa.total_obs, 0),
                        'participantes', COALESCE(saa.participantes, 0),
                        'compliance', 
                            (CASE 
                                WHEN tu.total > 0 THEN ROUND((COALESCE(saa.participantes, 0)::numeric / tu.total) * 100, 1)
                                ELSE 0
                            END)::float
                    ) AS "anoAnterior",
                    json_build_object(
                        'observacoes', 
                            (CASE 
                                WHEN COALESCE(saa.total_obs, 0) > 0 
                                THEN ROUND(((COALESCE(sa.total_obs, 0) - COALESCE(saa.total_obs, 0))::numeric / saa.total_obs) * 100, 1)
                                ELSE 0
                            END)::float,
                        'participantes',
                            (CASE 
                                WHEN COALESCE(saa.participantes, 0) > 0 
                                THEN ROUND(((COALESCE(sa.participantes, 0) - COALESCE(saa.participantes, 0))::numeric / saa.participantes) * 100, 1)
                                ELSE 0
                            END)::float,
                        'compliance',
                            (CASE 
                                WHEN tu.total > 0 AND COALESCE(saa.participantes, 0) > 0
                                THEN ROUND(
                                    (COALESCE(sa.participantes, 0)::numeric / tu.total * 100) - 
                                    (COALESCE(saa.participantes, 0)::numeric / tu.total * 100), 
                                    1
                                )
                                ELSE 0
                            END)::float
                    ) AS "variacao"
                FROM stats_ano sa
                CROSS JOIN total_users tu
                LEFT JOIN stats_ano_ant saa ON true`,
                [ano, anoAnterior]
            );

            const comparacao = comparacaoResult.rows[0] || {
                anoAtual: { totalObservacoes: 0, participantes: 0, compliance: 0 },
                anoAnterior: { totalObservacoes: 0, participantes: 0, compliance: 0 },
                variacao: { observacoes: 0, participantes: 0, compliance: 0 }
            };

            const response = {
                evolucaoMensal,
                rankingDepartamentos: rankingResult.rows,
                comparacaoPeriodos: comparacao
            };

            return listResponse(res, [response]);
        } catch (e: unknown) {
            logger.error({ err: e }, '[ehs/stats] Erro ao buscar estatísticas avançadas');
            res.status(500).json({ error: 'Erro interno.' });
        }
    }
);
