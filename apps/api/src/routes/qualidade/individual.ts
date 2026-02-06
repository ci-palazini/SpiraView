import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';

export const individualRouter: Router = Router();

// Helper to build WHERE clause (reused logic pattern)
const buildWhere = (params: any[], query: any) => {
    let where = '1=1';
    const { dataInicio, dataFim, origem, tipo, tipoLancamento } = query;

    if (dataInicio) {
        params.push(dataInicio);
        where += ` AND data_ocorrencia >= $${params.length}`;
    }
    if (dataFim) {
        params.push(dataFim);
        where += ` AND data_ocorrencia <= $${params.length}`;
    }
    if (origem) {
        if (Array.isArray(origem)) {
            params.push(origem);
            where += ` AND origem = ANY($${params.length})`;
        } else {
            params.push(origem);
            where += ` AND origem = $${params.length}`;
        }
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

// GET /qualidade/individual/metrics
// Returns list of performance metrics by responsible
individualRouter.get('/qualidade/individual/metrics',
    requirePermission('qualidade_desempenho', 'ver'),
    async (req, res) => {
        try {
            const params: any[] = [];
            const where = buildWhere(params, req.query);

            const query = `
                WITH BaseData AS (
                    SELECT 
                        responsavel_nome,
                        origem,
                        custo,
                        quantidade
                    FROM qualidade_refugos
                    WHERE ${where}
                ),
                TotalPlantCost AS (
                    SELECT COALESCE(SUM(custo), 0) as total_plant_cost 
                    FROM BaseData
                ),
                OriginCosts AS (
                    SELECT 
                        origem,
                        SUM(custo) as origin_total_cost
                    FROM BaseData
                    GROUP BY origem
                ),
                CollaboratorStats AS (
                    SELECT 
                        responsavel_nome,
                        SUM(custo) as person_total_cost,
                        SUM(quantidade) as total_items,
                        COUNT(*) as total_count,
                        ARRAY_AGG(DISTINCT origem) as origins_touched
                    FROM BaseData
                    WHERE responsavel_nome IS NOT NULL AND responsavel_nome != ''
                    GROUP BY responsavel_nome
                )
                SELECT 
                    cs.responsavel_nome,
                    cs.person_total_cost,
                    cs.total_items,
                    cs.total_count,
                    (cs.person_total_cost / NULLIF((SELECT total_plant_cost FROM TotalPlantCost), 0)) * 100 as share_total,
                    (
                        SELECT SUM(oc.origin_total_cost)
                        FROM OriginCosts oc
                        WHERE oc.origem = ANY(cs.origins_touched)
                    ) as cell_total_cost
                FROM CollaboratorStats cs
                ORDER BY cs.person_total_cost DESC
            `;

            const result = await pool.query(query, params);

            const formatted = result.rows.map(row => {
                const personCost = parseFloat(row.person_total_cost);
                const cellTotal = parseFloat(row.cell_total_cost || '0');
                const shareCell = cellTotal > 0 ? (personCost / cellTotal) * 100 : 0;

                return {
                    name: row.responsavel_nome,
                    totalCost: personCost,
                    totalItems: parseInt(row.total_items),
                    totalCount: parseInt(row.total_count),
                    shareTotal: parseFloat(row.share_total || '0'),
                    shareCell: shareCell
                };
            });

            res.json({ items: formatted });

        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    }
);
