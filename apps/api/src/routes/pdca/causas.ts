import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';

export const causasRouter: Router = Router();

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

// POST /pdca/planos/:planoId/causas - Adicionar causa
causasRouter.post('/pdca/planos/:planoId/causas',
    requirePermission('pdca_planos', 'editar'),
    async (req, res) => {
        try {
            const user = (req as any).user;
            const { planoId } = req.params;
            const {
                causa_raiz,
                correcao,
                acao_corretiva,
                responsavel,
                data_planejada,
                data_realizada,
                verificacao_data_planejada,
                verificacao_data_realizada,
                eficaz,
                verificacao_eficacia
            } = req.body;

            // Verify plano exists
            const planoCheck = await pool.query('SELECT id FROM pdca_planos WHERE id = $1', [planoId]);
            if (planoCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Plano não encontrado' });
            }

            const insert = await pool.query(
                `INSERT INTO pdca_causas (
                    plano_id, causa_raiz, correcao, acao_corretiva, responsavel,
                    data_planejada, data_realizada, verificacao_data_planejada,
                    verificacao_data_realizada, eficaz, verificacao_eficacia
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *`,
                [
                    planoId, causa_raiz, correcao, acao_corretiva, responsavel,
                    data_planejada || null, data_realizada || null, verificacao_data_planejada || null,
                    verificacao_data_realizada || null, eficaz, verificacao_eficacia
                ]
            );

            const causa = insert.rows[0];

            await logAudit('causa', causa.id, 'criado', null, causa, { id: user?.id, email: user?.email });

            // Update plano updated_at
            await pool.query('UPDATE pdca_planos SET updated_at = NOW() WHERE id = $1', [planoId]);

            res.status(201).json(causa);
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });

// PUT /pdca/causas/:id - Atualizar causa
causasRouter.put('/pdca/causas/:id',
    requirePermission('pdca_planos', 'editar'),
    async (req, res) => {
        try {
            const user = (req as any).user;
            const { id } = req.params;
            const {
                causa_raiz,
                correcao,
                acao_corretiva,
                responsavel,
                data_planejada,
                data_realizada,
                verificacao_data_planejada,
                verificacao_data_realizada,
                eficaz,
                verificacao_eficacia
            } = req.body;

            // Get current data for audit
            const currentQuery = await pool.query('SELECT * FROM pdca_causas WHERE id = $1', [id]);
            if (currentQuery.rows.length === 0) {
                return res.status(404).json({ error: 'Causa não encontrada' });
            }
            const dadosAnteriores = currentQuery.rows[0];

            const update = await pool.query(
                `UPDATE pdca_causas SET
                    causa_raiz = $1,
                    correcao = $2,
                    acao_corretiva = $3,
                    responsavel = $4,
                    data_planejada = $5,
                    data_realizada = $6,
                    verificacao_data_planejada = $7,
                    verificacao_data_realizada = $8,
                    eficaz = $9,
                    verificacao_eficacia = $10,
                    updated_at = NOW()
                 WHERE id = $11
                 RETURNING *`,
                [
                    causa_raiz !== undefined ? causa_raiz : dadosAnteriores.causa_raiz,
                    correcao !== undefined ? correcao : dadosAnteriores.correcao,
                    acao_corretiva !== undefined ? acao_corretiva : dadosAnteriores.acao_corretiva,
                    responsavel !== undefined ? responsavel : dadosAnteriores.responsavel,
                    data_planejada !== undefined ? data_planejada : dadosAnteriores.data_planejada,
                    data_realizada !== undefined ? data_realizada : dadosAnteriores.data_realizada,
                    verificacao_data_planejada !== undefined ? verificacao_data_planejada : dadosAnteriores.verificacao_data_planejada,
                    verificacao_data_realizada !== undefined ? verificacao_data_realizada : dadosAnteriores.verificacao_data_realizada,
                    eficaz !== undefined ? eficaz : dadosAnteriores.eficaz,
                    verificacao_eficacia !== undefined ? verificacao_eficacia : dadosAnteriores.verificacao_eficacia,
                    id
                ]
            );

            const causa = update.rows[0];

            await logAudit('causa', id, 'atualizado', dadosAnteriores, causa, { id: user?.id, email: user?.email });

            // Update plano updated_at
            await pool.query('UPDATE pdca_planos SET updated_at = NOW() WHERE id = $1', [dadosAnteriores.plano_id]);

            res.json(causa);
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });

// DELETE /pdca/causas/:id - Excluir causa
causasRouter.delete('/pdca/causas/:id',
    requirePermission('pdca_planos', 'editar'),
    async (req, res) => {
        try {
            const user = (req as any).user;
            const { id } = req.params;

            // Get current data for audit
            const currentQuery = await pool.query('SELECT * FROM pdca_causas WHERE id = $1', [id]);
            if (currentQuery.rows.length === 0) {
                return res.status(404).json({ error: 'Causa não encontrada' });
            }
            const dadosAnteriores = currentQuery.rows[0];

            await pool.query('DELETE FROM pdca_causas WHERE id = $1', [id]);

            await logAudit('causa', id, 'excluido', dadosAnteriores, null, { id: user?.id, email: user?.email });

            // Update plano updated_at
            await pool.query('UPDATE pdca_planos SET updated_at = NOW() WHERE id = $1', [dadosAnteriores.plano_id]);

            res.json({ ok: true });
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });
