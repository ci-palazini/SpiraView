import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';
import { logger } from '../../logger';
import { buildQualidadeWhere } from './whereBuilders';

export const compareRouter: Router = Router();

// Helper to build WHERE clause for a period
const buildWhereForPeriod = (
    params: unknown[],
    dataInicio: string,
    dataFim: string,
    query: Record<string, unknown>
) => buildQualidadeWhere(params, { dataInicio, dataFim, ...query });

interface PeriodData {
    label: string;
    totalCost: number;
    totalQuantity: number;
    count: number;
    topDefects: { motivo: string; custo: number }[];
    topOrigens: { origem: string; custo: number }[];
    topResponsaveis: { responsavel: string; custo: number }[];
}

const fetchPeriodData = async (
    dataInicio: string,
    dataFim: string,
    label: string,
    query: any
): Promise<PeriodData> => {
    const params: unknown[] = [];
    const where = buildWhereForPeriod(params, dataInicio, dataFim, query);

    // Uma única query com CTE substitui as 4 queries anteriores.
    // A tabela `filtered` é escaneada apenas uma vez por período.
    const { rows } = await pool.query(
        `WITH filtered AS (
            SELECT custo, quantidade, motivo_defeito, origem, responsavel_nome
            FROM qualidade_refugos
            WHERE ${where}
        )
        SELECT
            COALESCE(SUM(custo), 0)::float       AS total_cost,
            COALESCE(SUM(quantidade), 0)::float  AS total_quantity,
            COUNT(*)::int                         AS total_count,
            (
                SELECT json_agg(d)
                FROM (
                    SELECT motivo_defeito AS motivo, SUM(custo)::float AS custo
                    FROM filtered
                    WHERE motivo_defeito IS NOT NULL AND motivo_defeito != ''
                    GROUP BY motivo_defeito
                    ORDER BY custo DESC
                    LIMIT 5
                ) d
            ) AS top_defects,
            (
                SELECT json_agg(o)
                FROM (
                    SELECT origem, SUM(custo)::float AS custo
                    FROM filtered
                    WHERE origem IS NOT NULL AND origem != ''
                    GROUP BY origem
                    ORDER BY custo DESC
                    LIMIT 5
                ) o
            ) AS top_origens,
            (
                SELECT json_agg(r)
                FROM (
                    SELECT responsavel_nome AS responsavel, SUM(custo)::float AS custo
                    FROM filtered
                    WHERE responsavel_nome IS NOT NULL AND responsavel_nome != ''
                    GROUP BY responsavel_nome
                    ORDER BY custo DESC
                    LIMIT 5
                ) r
            ) AS top_responsaveis
        FROM filtered`,
        params
    );

    const row = rows[0] ?? {};
    return {
        label,
        totalCost: row.total_cost ?? 0,
        totalQuantity: row.total_quantity ?? 0,
        count: row.total_count ?? 0,
        topDefects: (row.top_defects ?? []).map((r: { motivo: string; custo: number }) => ({
            motivo: r.motivo,
            custo: r.custo,
        })),
        topOrigens: (row.top_origens ?? []).map((r: { origem: string; custo: number }) => ({
            origem: r.origem,
            custo: r.custo,
        })),
        topResponsaveis: (row.top_responsaveis ?? []).map((r: { responsavel: string; custo: number }) => ({
            responsavel: r.responsavel,
            custo: r.custo,
        })),
    };
};
/**
 * GET /qualidade/analytics/compare
 * Compare quality metrics between two periods
 * 
 * Query params:
 * - dataInicioA, dataFimA: Period A date range (required)
 * - dataInicioB, dataFimB: Period B date range (required)
 * - origem, responsavel, tipo, tipoLancamento: Common filters (optional)
 */
compareRouter.get('/qualidade/analytics/compare',
    requirePermission('qualidade_analitico', 'ver'),
    async (req, res) => {
        try {
            const {
                dataInicioA, dataFimA,
                dataInicioB, dataFimB
            } = req.query;

            // Validate required params
            if (!dataInicioA || !dataFimA || !dataInicioB || !dataFimB) {
                return res.status(400).json({
                    error: 'Missing required date parameters: dataInicioA, dataFimA, dataInicioB, dataFimB'
                });
            }

            // Create labels from date ranges
            const labelA = `${dataInicioA} - ${dataFimA}`;
            const labelB = `${dataInicioB} - ${dataFimB}`;

            // Fetch data for both periods
            const [periodA, periodB] = await Promise.all([
                fetchPeriodData(
                    dataInicioA as string,
                    dataFimA as string,
                    labelA,
                    req.query
                ),
                fetchPeriodData(
                    dataInicioB as string,
                    dataFimB as string,
                    labelB,
                    req.query
                )
            ]);

            // Calculate delta
            const costDiff = periodA.totalCost - periodB.totalCost;
            const costPctChange = periodB.totalCost !== 0
                ? ((periodA.totalCost - periodB.totalCost) / periodB.totalCost) * 100
                : (periodA.totalCost > 0 ? 100 : 0);
            const countDiff = periodA.count - periodB.count;

            res.json({
                periodA,
                periodB,
                delta: {
                    costDiff: +costDiff.toFixed(2),
                    costPctChange: +costPctChange.toFixed(2),
                    countDiff,
                    quantityDiff: periodA.totalQuantity - periodB.totalQuantity
                }
            });

        } catch (e: any) {
            logger.error({ err: e }, '[compare]');
            res.status(500).json({ error: String(e) });
        }
    }
);
