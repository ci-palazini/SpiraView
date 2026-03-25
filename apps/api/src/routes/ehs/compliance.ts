// apps/api/src/routes/ehs/compliance.ts
import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';
import { listResponse } from '../../utils/response';
import { logger } from '../../logger';

export const ehsComplianceRouter: Router = Router();

/**
 * GET /ehs/compliance-mensal?ano=YYYY
 * Retorna conformidade BBS mensal de todos os utilizadores ativos.
 */
ehsComplianceRouter.get(
    '/ehs/compliance-mensal',
    requirePermission('safety', 'ver'),
    async (req, res) => {
        try {
            const ano = Number(req.query.ano) || new Date().getFullYear();

            const { rows } = await pool.query(
                `SELECT
                    u.id   AS "usuarioId",
                    u.nome AS "nome",
                    u.funcao AS "funcao",
                    u.departamento_id AS "departamentoId",
                    d.nome AS "departamentoNome",
                    ARRAY(
                        SELECT COALESCE(c.cnt, 0)
                        FROM generate_series(1, 12) AS m(mes)
                        LEFT JOIN (
                            SELECT
                                EXTRACT(MONTH FROM so.data_observacao)::int AS mes,
                                COUNT(*)::int AS cnt
                            FROM safety_observacoes so
                            WHERE so.usuario_id = u.id
                              AND EXTRACT(YEAR FROM so.data_observacao) = $1
                            GROUP BY 1
                        ) c ON c.mes = m.mes
                        ORDER BY m.mes
                    ) AS "meses"
                FROM usuarios u
                LEFT JOIN departamentos d ON d.id = u.departamento_id
                WHERE u.ativo = true
                ORDER BY u.nome`,
                [ano]
            );

            return listResponse(res, rows);
        } catch (e: unknown) {
            logger.error({ err: e }, '[ehs/compliance] Erro ao buscar compliance mensal');
            res.status(500).json({ error: 'Erro interno.' });
        }
    }
);
