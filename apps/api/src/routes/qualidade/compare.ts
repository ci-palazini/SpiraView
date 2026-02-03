import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';

export const compareRouter: Router = Router();

// Helper to build WHERE clause for a period
const buildWhereForPeriod = (
    params: any[],
    dataInicio: string,
    dataFim: string,
    query: any
) => {
    let where = '1=1';
    const { origem, responsavel, tipo, tipoLancamento } = query;

    params.push(dataInicio);
    where += ` AND data_ocorrencia >= $${params.length}`;

    params.push(dataFim);
    where += ` AND data_ocorrencia <= $${params.length}`;

    if (origem) {
        params.push(origem);
        where += ` AND origem = $${params.length}`;
    }
    if (responsavel) {
        params.push(responsavel);
        where += ` AND responsavel_nome = $${params.length}`;
    }
    if (tipo && (tipo === 'INTERNO' || tipo === 'EXTERNO')) {
        params.push(tipo);
        where += ` AND EXISTS (SELECT 1 FROM qualidade_origens qo WHERE qo.nome = qualidade_refugos.origem AND qo.tipo = $${params.length})`;
    }
    if (tipoLancamento) {
        params.push(tipoLancamento);
        where += ` AND tipo_lancamento = $${params.length}`;
    }
    return where;
};

interface PeriodData {
    label: string;
    totalCost: number;
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
    const params: any[] = [];
    const where = buildWhereForPeriod(params, dataInicio, dataFim, query);

    // Total cost and count
    const totalsQuery = await pool.query(
        `SELECT COALESCE(SUM(custo), 0) as total_cost, COUNT(*) as total_count 
         FROM qualidade_refugos WHERE ${where}`,
        params
    );

    // Top 5 defects
    const defectsParams: any[] = [];
    const defectsWhere = buildWhereForPeriod(defectsParams, dataInicio, dataFim, query);
    const defectsQuery = await pool.query(
        `SELECT motivo_defeito as motivo, SUM(custo) as custo 
         FROM qualidade_refugos 
         WHERE ${defectsWhere} AND motivo_defeito IS NOT NULL AND motivo_defeito != ''
         GROUP BY motivo_defeito 
         ORDER BY custo DESC 
         LIMIT 5`,
        defectsParams
    );

    // Top 5 origins
    const origensParams: any[] = [];
    const origensWhere = buildWhereForPeriod(origensParams, dataInicio, dataFim, query);
    const origensQuery = await pool.query(
        `SELECT origem, SUM(custo) as custo 
         FROM qualidade_refugos 
         WHERE ${origensWhere} AND origem IS NOT NULL AND origem != ''
         GROUP BY origem 
         ORDER BY custo DESC 
         LIMIT 5`,
        origensParams
    );

    // Top 5 responsaveis
    const respParams: any[] = [];
    const respWhere = buildWhereForPeriod(respParams, dataInicio, dataFim, query);
    const respQuery = await pool.query(
        `SELECT responsavel_nome as responsavel, SUM(custo) as custo 
         FROM qualidade_refugos 
         WHERE ${respWhere} AND responsavel_nome IS NOT NULL AND responsavel_nome != ''
         GROUP BY responsavel_nome 
         ORDER BY custo DESC 
         LIMIT 5`,
        respParams
    );

    return {
        label,
        totalCost: parseFloat(totalsQuery.rows[0]?.total_cost || '0'),
        count: parseInt(totalsQuery.rows[0]?.total_count || '0', 10),
        topDefects: defectsQuery.rows.map(r => ({
            motivo: r.motivo,
            custo: parseFloat(r.custo)
        })),
        topOrigens: origensQuery.rows.map(r => ({
            origem: r.origem,
            custo: parseFloat(r.custo)
        })),
        topResponsaveis: respQuery.rows.map(r => ({
            responsavel: r.responsavel,
            custo: parseFloat(r.custo)
        }))
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
                    countDiff
                }
            });

        } catch (e: any) {
            console.error('[compare]', e);
            res.status(500).json({ error: String(e) });
        }
    }
);
