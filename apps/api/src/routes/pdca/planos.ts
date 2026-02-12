import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';

export const planosRouter: Router = Router();

// Helper para registrar audit log
async function logAudit(
    entidade: 'plano' | 'causa',
    entidadeId: string,
    acao: 'criado' | 'atualizado' | 'excluido',
    dadosAnteriores: any,
    dadosNovos: any,
    usuario: { id?: string; email?: string }
) {
    await pool.query(
        `INSERT INTO pdca_audit_log (entidade, entidade_id, acao, dados_anteriores, dados_novos, usuario_id, usuario_email)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [entidade, entidadeId, acao, dadosAnteriores, dadosNovos, usuario.id, usuario.email]
    );
}

// GET /pdca/planos - Listar planos
planosRouter.get('/pdca/planos',
    requirePermission('pdca_planos', 'ver'),
    async (req, res) => {
        try {
            const user = (req as any).user;
            const status = req.query.status as string;
            const origem = req.query.origem as string;
            const dataInicio = req.query.dataInicio as string;
            const dataFim = req.query.dataFim as string;

            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;
            const offset = (page - 1) * limit;

            const params: any[] = [];
            let where = '1=1';

            // Filter by company
            if (user?.company_id) {
                params.push(user.company_id);
                where += ` AND p.company_id = $${params.length}`;
            }

            if (status) {
                params.push(status);
                where += ` AND p.status = $${params.length}`;
            }
            if (origem) {
                params.push(`%${origem}%`);
                where += ` AND p.origem ILIKE $${params.length}`;
            }
            if (dataInicio) {
                params.push(dataInicio);
                where += ` AND p.created_at >= $${params.length}`;
            }
            if (dataFim) {
                params.push(dataFim);
                where += ` AND p.created_at <= $${params.length}::date + interval '1 day'`;
            }

            // Count total
            const countQuery = await pool.query(
                `SELECT COUNT(*) as total FROM pdca_planos p WHERE ${where}`,
                params
            );
            const total = parseInt(countQuery.rows[0].total);

            // Fetch data with causa count
            const query = `
                SELECT 
                    p.*,
                    u.nome as criado_por_nome,
                    (SELECT COUNT(*) FROM pdca_causas c WHERE c.plano_id = p.id) as total_causas,
                    (SELECT COUNT(*) FROM pdca_causas c WHERE c.plano_id = p.id AND c.data_realizada IS NOT NULL) as causas_concluidas
                FROM pdca_planos p
                LEFT JOIN usuarios u ON u.id = p.criado_por_id
                WHERE ${where}
                ORDER BY p.created_at DESC
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
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });

// GET /pdca/planos/:id - Detalhe do plano
planosRouter.get('/pdca/planos/:id',
    requirePermission('pdca_planos', 'ver'),
    async (req, res) => {
        try {
            const { id } = req.params;

            const planoQuery = await pool.query(
                `SELECT p.*, u.nome as criado_por_nome
                 FROM pdca_planos p
                 LEFT JOIN usuarios u ON u.id = p.criado_por_id
                 WHERE p.id = $1`,
                [id]
            );

            if (planoQuery.rows.length === 0) {
                return res.status(404).json({ error: 'Plano não encontrado' });
            }

            const causasQuery = await pool.query(
                `SELECT * FROM pdca_causas WHERE plano_id = $1 ORDER BY created_at ASC`,
                [id]
            );

            res.json({
                ...planoQuery.rows[0],
                causas: causasQuery.rows
            });
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });

// POST /pdca/planos - Criar plano
planosRouter.post('/pdca/planos',
    requirePermission('pdca_planos', 'editar'),
    async (req, res) => {
        try {
            const user = (req as any).user;
            const { titulo, origem, tipo, nao_conformidade } = req.body;

            if (!titulo) {
                return res.status(400).json({ error: 'Título é obrigatório' });
            }

            const insert = await pool.query(
                `INSERT INTO pdca_planos (titulo, origem, tipo, nao_conformidade, company_id, criado_por_id)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [titulo, origem, tipo, nao_conformidade, user?.company_id, user?.id]
            );

            const plano = insert.rows[0];

            await logAudit('plano', plano.id, 'criado', null, plano, { id: user?.id, email: user?.email });

            res.status(201).json(plano);
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });

// PUT /pdca/planos/:id - Atualizar plano
planosRouter.put('/pdca/planos/:id',
    requirePermission('pdca_planos', 'editar'),
    async (req, res) => {
        try {
            const user = (req as any).user;
            const { id } = req.params;
            const { titulo, origem, tipo, nao_conformidade, status } = req.body;

            // Get current data for audit
            const currentQuery = await pool.query('SELECT * FROM pdca_planos WHERE id = $1', [id]);
            if (currentQuery.rows.length === 0) {
                return res.status(404).json({ error: 'Plano não encontrado' });
            }
            const dadosAnteriores = currentQuery.rows[0];

            const update = await pool.query(
                `UPDATE pdca_planos SET
                    titulo = COALESCE($1, titulo),
                    origem = COALESCE($2, origem),
                    tipo = COALESCE($3, tipo),
                    nao_conformidade = COALESCE($4, nao_conformidade),
                    status = COALESCE($5, status),
                    updated_at = NOW()
                 WHERE id = $6
                 RETURNING *`,
                [titulo, origem, tipo, nao_conformidade, status, id]
            );

            const plano = update.rows[0];

            await logAudit('plano', id, 'atualizado', dadosAnteriores, plano, { id: user?.id, email: user?.email });

            res.json(plano);
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });

// DELETE /pdca/planos/:id - Excluir plano (cascata: desvincula retrabalho, exclui causas)
planosRouter.delete('/pdca/planos/:id',
    requirePermission('pdca_planos', 'editar'),
    async (req, res) => {
        try {
            const user = (req as any).user;
            const { id } = req.params;

            // Get current data for audit
            const currentQuery = await pool.query('SELECT * FROM pdca_planos WHERE id = $1', [id]);
            if (currentQuery.rows.length === 0) {
                return res.status(404).json({ error: 'Plano não encontrado' });
            }
            const dadosAnteriores = currentQuery.rows[0];

            // 1. Desvincular registros de retrabalho
            await pool.query(
                'UPDATE qualidade_retrabalho SET pdca_plano_id = NULL WHERE pdca_plano_id = $1',
                [id]
            );

            // 2. Excluir causas associadas
            await pool.query('DELETE FROM pdca_causas WHERE plano_id = $1', [id]);

            // 3. Excluir o plano
            await pool.query('DELETE FROM pdca_planos WHERE id = $1', [id]);

            await logAudit('plano', id, 'excluido', dadosAnteriores, null, { id: user?.id, email: user?.email });

            res.json({ ok: true });
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });
