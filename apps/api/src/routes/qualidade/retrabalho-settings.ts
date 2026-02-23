import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';
import { logger } from '../../logger';

export const retrabalhoSettingsRouter: Router = Router();

// ============================================================================
// NÃO CONFORMIDADES
// ============================================================================

// GET /qualidade/nao-conformidades - Listar
retrabalhoSettingsRouter.get('/qualidade/nao-conformidades', async (req, res) => {
    try {
        const { todos } = req.query;
        const where = (todos === 'true' || todos === '1') ? '1=1' : 'ativo = true';

        const { rows } = await pool.query(
            `SELECT * FROM qualidade_nao_conformidades WHERE ${where} ORDER BY nome ASC`
        );
        res.json(rows);
    } catch (e: any) {
        logger.error({ err: e }, 'Erro na rota');
        res.status(500).json({ error: String(e) });
    }
});

// POST /qualidade/nao-conformidades - Criar
retrabalhoSettingsRouter.post('/qualidade/nao-conformidades',
    requirePermission('qualidade_config', 'editar'),
    async (req, res) => {
        try {
            const { nome } = req.body;
            if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

            const { rows } = await pool.query(
                `INSERT INTO qualidade_nao_conformidades (nome) VALUES ($1) RETURNING *`,
                [nome.toUpperCase()]
            );
            res.status(201).json(rows[0]);
        } catch (e: any) {
            logger.error({ err: e }, 'Erro na rota');
            if (e.code === '23505') {
                return res.status(400).json({ error: 'Não conformidade já existe.' });
            }
            res.status(500).json({ error: String(e) });
        }
    });

// PUT /qualidade/nao-conformidades/:id - Editar/Desativar
retrabalhoSettingsRouter.put('/qualidade/nao-conformidades/:id',
    requirePermission('qualidade_config', 'editar'),
    async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { id } = req.params;
            const { nome, ativo } = req.body;

            const { rows: oldRows } = await client.query(
                `SELECT nome FROM qualidade_nao_conformidades WHERE id = $1`, [id]
            );
            if (oldRows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Não conformidade não encontrada.' });
            }
            const oldName = oldRows[0].nome;

            const fields: string[] = [];
            const values: any[] = [];
            let idx = 1;

            if (nome !== undefined) {
                fields.push(`nome = $${idx++}`);
                values.push(nome.toUpperCase());
            }
            if (ativo !== undefined) {
                fields.push(`ativo = $${idx++}`);
                values.push(ativo);
            }

            if (fields.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Nada a atualizar.' });
            }

            values.push(id);
            const { rows } = await client.query(
                `UPDATE qualidade_nao_conformidades SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
                values
            );

            // Propagate name change
            if (nome && nome.toUpperCase() !== oldName) {
                await client.query(
                    `UPDATE qualidade_retrabalho SET nao_conformidade = $1, updated_at = NOW() WHERE nao_conformidade = $2`,
                    [nome.toUpperCase(), oldName]
                );
            }

            await client.query('COMMIT');
            res.json(rows[0]);
        } catch (e: any) {
            await client.query('ROLLBACK');
            logger.error({ err: e }, 'Erro na rota');
            res.status(500).json({ error: String(e) });
        } finally {
            client.release();
        }
    });

// GET /qualidade/nao-conformidades/:id/usage
retrabalhoSettingsRouter.get('/qualidade/nao-conformidades/:id/usage', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows: ncRows } = await pool.query(
            `SELECT nome FROM qualidade_nao_conformidades WHERE id = $1`, [id]
        );
        if (ncRows.length === 0) {
            return res.status(404).json({ error: 'Não conformidade não encontrada.' });
        }
        const { rows: countRows } = await pool.query(
            `SELECT COUNT(*) as count FROM qualidade_retrabalho WHERE nao_conformidade = $1`,
            [ncRows[0].nome]
        );
        res.json({ count: Number(countRows[0].count) });
    } catch (e: any) {
        logger.error({ err: e }, 'Erro na rota');
        res.status(500).json({ error: String(e) });
    }
});

// DELETE /qualidade/nao-conformidades/:id
retrabalhoSettingsRouter.delete('/qualidade/nao-conformidades/:id',
    requirePermission('qualidade_config', 'editar'),
    async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { id } = req.params;
            const { transferToId } = req.body;

            const { rows: oldRows } = await client.query(
                `SELECT * FROM qualidade_nao_conformidades WHERE id = $1`, [id]
            );
            if (oldRows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Não conformidade não encontrada.' });
            }
            const oldName = oldRows[0].nome;

            const { rows: usageRows } = await client.query(
                `SELECT COUNT(*) as count FROM qualidade_retrabalho WHERE nao_conformidade = $1`,
                [oldName]
            );
            const count = Number(usageRows[0].count);

            if (count > 0) {
                if (!transferToId) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        error: 'Esta não conformidade possui vínculos.',
                        code: 'HAS_LINKS',
                        count
                    });
                }

                const { rows: newRows } = await client.query(
                    `SELECT nome FROM qualidade_nao_conformidades WHERE id = $1`, [transferToId]
                );
                if (newRows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: 'Não conformidade de destino não encontrada.' });
                }

                await client.query(
                    `UPDATE qualidade_retrabalho SET nao_conformidade = $1, updated_at = NOW() WHERE nao_conformidade = $2`,
                    [newRows[0].nome, oldName]
                );
            }

            await client.query(`DELETE FROM qualidade_nao_conformidades WHERE id = $1`, [id]);
            await client.query('COMMIT');
            res.json({ ok: true, transferred: count });
        } catch (e: any) {
            await client.query('ROLLBACK');
            logger.error({ err: e }, 'Erro na rota');
            res.status(500).json({ error: String(e) });
        } finally {
            client.release();
        }
    });


// ============================================================================
// SOLICITANTES
// ============================================================================

// GET /qualidade/solicitantes - Listar
retrabalhoSettingsRouter.get('/qualidade/solicitantes', async (req, res) => {
    try {
        const { todos } = req.query;
        const where = (todos === 'true' || todos === '1') ? '1=1' : 'ativo = true';

        const { rows } = await pool.query(
            `SELECT * FROM qualidade_solicitantes WHERE ${where} ORDER BY nome ASC`
        );
        res.json(rows);
    } catch (e: any) {
        logger.error({ err: e }, 'Erro na rota');
        res.status(500).json({ error: String(e) });
    }
});

// POST /qualidade/solicitantes - Criar
retrabalhoSettingsRouter.post('/qualidade/solicitantes',
    requirePermission('qualidade_config', 'editar'),
    async (req, res) => {
        try {
            const { nome } = req.body;
            if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

            const { rows } = await pool.query(
                `INSERT INTO qualidade_solicitantes (nome) VALUES ($1) RETURNING *`,
                [nome.toUpperCase()]
            );
            res.status(201).json(rows[0]);
        } catch (e: any) {
            logger.error({ err: e }, 'Erro na rota');
            if (e.code === '23505') {
                return res.status(400).json({ error: 'Solicitante já existe.' });
            }
            res.status(500).json({ error: String(e) });
        }
    });

// PUT /qualidade/solicitantes/:id - Editar/Desativar
retrabalhoSettingsRouter.put('/qualidade/solicitantes/:id',
    requirePermission('qualidade_config', 'editar'),
    async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { id } = req.params;
            const { nome, ativo } = req.body;

            const { rows: oldRows } = await client.query(
                `SELECT nome FROM qualidade_solicitantes WHERE id = $1`, [id]
            );
            if (oldRows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Solicitante não encontrado.' });
            }
            const oldName = oldRows[0].nome;

            const fields: string[] = [];
            const values: any[] = [];
            let idx = 1;

            if (nome !== undefined) {
                fields.push(`nome = $${idx++}`);
                values.push(nome.toUpperCase());
            }
            if (ativo !== undefined) {
                fields.push(`ativo = $${idx++}`);
                values.push(ativo);
            }

            if (fields.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Nada a atualizar.' });
            }

            values.push(id);
            const { rows } = await client.query(
                `UPDATE qualidade_solicitantes SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
                values
            );

            // Propagate name change
            if (nome && nome.toUpperCase() !== oldName) {
                await client.query(
                    `UPDATE qualidade_retrabalho SET solicitante = $1, updated_at = NOW() WHERE solicitante = $2`,
                    [nome.toUpperCase(), oldName]
                );
            }

            await client.query('COMMIT');
            res.json(rows[0]);
        } catch (e: any) {
            await client.query('ROLLBACK');
            logger.error({ err: e }, 'Erro na rota');
            res.status(500).json({ error: String(e) });
        } finally {
            client.release();
        }
    });

// GET /qualidade/solicitantes/:id/usage
retrabalhoSettingsRouter.get('/qualidade/solicitantes/:id/usage', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows: solRows } = await pool.query(
            `SELECT nome FROM qualidade_solicitantes WHERE id = $1`, [id]
        );
        if (solRows.length === 0) {
            return res.status(404).json({ error: 'Solicitante não encontrado.' });
        }
        const { rows: countRows } = await pool.query(
            `SELECT COUNT(*) as count FROM qualidade_retrabalho WHERE solicitante = $1`,
            [solRows[0].nome]
        );
        res.json({ count: Number(countRows[0].count) });
    } catch (e: any) {
        logger.error({ err: e }, 'Erro na rota');
        res.status(500).json({ error: String(e) });
    }
});

// DELETE /qualidade/solicitantes/:id
retrabalhoSettingsRouter.delete('/qualidade/solicitantes/:id',
    requirePermission('qualidade_config', 'editar'),
    async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { id } = req.params;
            const { transferToId } = req.body;

            const { rows: oldRows } = await client.query(
                `SELECT * FROM qualidade_solicitantes WHERE id = $1`, [id]
            );
            if (oldRows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Solicitante não encontrado.' });
            }
            const oldName = oldRows[0].nome;

            const { rows: usageRows } = await client.query(
                `SELECT COUNT(*) as count FROM qualidade_retrabalho WHERE solicitante = $1`,
                [oldName]
            );
            const count = Number(usageRows[0].count);

            if (count > 0) {
                if (!transferToId) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        error: 'Este solicitante possui vínculos.',
                        code: 'HAS_LINKS',
                        count
                    });
                }

                const { rows: newRows } = await client.query(
                    `SELECT nome FROM qualidade_solicitantes WHERE id = $1`, [transferToId]
                );
                if (newRows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: 'Solicitante de destino não encontrado.' });
                }

                await client.query(
                    `UPDATE qualidade_retrabalho SET solicitante = $1, updated_at = NOW() WHERE solicitante = $2`,
                    [newRows[0].nome, oldName]
                );
            }

            await client.query(`DELETE FROM qualidade_solicitantes WHERE id = $1`, [id]);
            await client.query('COMMIT');
            res.json({ ok: true, transferred: count });
        } catch (e: any) {
            await client.query('ROLLBACK');
            logger.error({ err: e }, 'Erro na rota');
            res.status(500).json({ error: String(e) });
        } finally {
            client.release();
        }
    });
