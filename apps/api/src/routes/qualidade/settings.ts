import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';

export const settingsRouter: Router = Router();

// ============================================================================
// ORIGENS (antigo Setores)
// ============================================================================

// GET /qualidade/origens - Listar origens
settingsRouter.get('/qualidade/origens', async (req, res) => {
    try {
        const { todos } = req.query;
        // Se todos=true, traz tudo. Se não, só ativos.
        const where = (todos === 'true' || todos === '1') ? '1=1' : 'ativo = true';

        const { rows } = await pool.query(
            `SELECT * FROM qualidade_origens WHERE ${where} ORDER BY nome ASC`
        );
        res.json(rows);
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// POST /qualidade/origens - Criar nova origem
settingsRouter.post('/qualidade/origens',
    requirePermission('qualidade_config', 'editar'), // Assuming specific permission or borrowing 'qualidade_lancamento'
    async (req, res) => {
        try {
            const { nome } = req.body;
            if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

            const { rows } = await pool.query(
                `INSERT INTO qualidade_origens (nome) VALUES ($1) RETURNING *`,
                [nome.toUpperCase()]
            );
            res.status(201).json(rows[0]);
        } catch (e: any) {
            console.error(e);
            if (e.code === '23505') { // Unique violation
                return res.status(400).json({ error: 'Origem já existe.' });
            }
            res.status(500).json({ error: String(e) });
        }
    });

// PUT /qualidade/origens/:id - Editar/Desativar
settingsRouter.put('/qualidade/origens/:id',
    requirePermission('qualidade_config', 'editar'),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { nome, ativo } = req.body;

            const fields: any[] = [];
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

            if (fields.length === 0) return res.status(400).json({ error: 'Nada a atualizar.' });

            values.push(id);
            const { rows } = await pool.query(
                `UPDATE qualidade_origens SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
                values
            );

            res.json(rows[0]);
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });

// ============================================================================
// MOTIVOS
// ============================================================================

// GET /qualidade/motivos - Listar motivos
settingsRouter.get('/qualidade/motivos', async (req, res) => {
    try {
        const { todos } = req.query;
        // Se todos=true, traz tudo. Se não, só ativos.
        const where = (todos === 'true' || todos === '1') ? '1=1' : 'ativo = true';

        const { rows } = await pool.query(
            `SELECT * FROM qualidade_motivos WHERE ${where} ORDER BY nome ASC`
        );
        res.json(rows);
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// POST /qualidade/motivos - Criar novo motivo
settingsRouter.post('/qualidade/motivos',
    requirePermission('qualidade_config', 'editar'),
    async (req, res) => {
        try {
            const { nome } = req.body;
            if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

            const { rows } = await pool.query(
                `INSERT INTO qualidade_motivos (nome) VALUES ($1) RETURNING *`,
                [nome.toUpperCase()]
            );
            res.status(201).json(rows[0]);
        } catch (e: any) {
            console.error(e);
            if (e.code === '23505') {
                return res.status(400).json({ error: 'Motivo já existe.' });
            }
            res.status(500).json({ error: String(e) });
        }
    });

// PUT /qualidade/motivos/:id - Editar/Desativar
settingsRouter.put('/qualidade/motivos/:id',
    requirePermission('qualidade_config', 'editar'),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { nome, ativo } = req.body;

            const fields: any[] = [];
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

            if (fields.length === 0) return res.status(400).json({ error: 'Nada a atualizar.' });

            values.push(id);
            const { rows } = await pool.query(
                `UPDATE qualidade_motivos SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
                values
            );

            res.json(rows[0]);
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });

// ============================================================================
// RESPONSÁVEIS
// ============================================================================

// GET /qualidade/responsaveis - Listar responsáveis
settingsRouter.get('/qualidade/responsaveis', async (req, res) => {
    try {
        const { todos } = req.query;
        // Se todos=true, traz tudo. Se não, só ativos.
        const where = (todos === 'true' || todos === '1') ? '1=1' : 'ativo = true';

        const { rows } = await pool.query(
            `SELECT * FROM qualidade_responsaveis WHERE ${where} ORDER BY nome ASC`
        );
        res.json(rows);
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// POST /qualidade/responsaveis - Criar novo responsável
settingsRouter.post('/qualidade/responsaveis',
    requirePermission('qualidade_config', 'editar'),
    async (req, res) => {
        try {
            const { nome } = req.body;
            if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

            const { rows } = await pool.query(
                `INSERT INTO qualidade_responsaveis (nome) VALUES ($1) RETURNING *`,
                [nome.toUpperCase()]
            );
            res.status(201).json(rows[0]);
        } catch (e: any) {
            console.error(e);
            if (e.code === '23505') {
                return res.status(400).json({ error: 'Responsável já existe.' });
            }
            res.status(500).json({ error: String(e) });
        }
    });

// PUT /qualidade/responsaveis/:id - Editar/Desativar
settingsRouter.put('/qualidade/responsaveis/:id',
    requirePermission('qualidade_config', 'editar'),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { nome, ativo } = req.body;

            const fields: any[] = [];
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

            if (fields.length === 0) return res.status(400).json({ error: 'Nada a atualizar.' });

            values.push(id);
            const { rows } = await pool.query(
                `UPDATE qualidade_responsaveis SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
                values
            );

            res.json(rows[0]);
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: String(e) });
        }
    });

// GET /qualidade/responsaveis/:id/usage - Verificar uso antes de excluir
settingsRouter.get('/qualidade/responsaveis/:id/usage', async (req, res) => {
    try {
        const { id } = req.params;

        // Primeiro pega o nome deste responsável
        const { rows: responsavelRows } = await pool.query(
            `SELECT nome FROM qualidade_responsaveis WHERE id = $1`,
            [id]
        );

        if (responsavelRows.length === 0) {
            return res.status(404).json({ error: 'Responsável não encontrado.' });
        }

        const nome = responsavelRows[0].nome;

        // Conta quantos refugos usam este nome
        const { rows: countRows } = await pool.query(
            `SELECT COUNT(*) as count FROM qualidade_refugos WHERE responsavel_nome = $1`,
            [nome]
        );

        res.json({ count: Number(countRows[0].count) });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

// DELETE /qualidade/responsaveis/:id - Excluir com opção de transferir
settingsRouter.delete('/qualidade/responsaveis/:id',
    requirePermission('qualidade_config', 'editar'),
    async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { id } = req.params;
            const { transferToId } = req.body;

            // 1. Busca o responsável a ser excluído
            const { rows: oldRows } = await client.query(
                `SELECT * FROM qualidade_responsaveis WHERE id = $1`,
                [id]
            );
            if (oldRows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Responsável não encontrado.' });
            }
            const oldName = oldRows[0].nome;

            // 2. Verifica uso
            const { rows: usageRows } = await client.query(
                `SELECT COUNT(*) as count FROM qualidade_refugos WHERE responsavel_nome = $1`,
                [oldName]
            );
            const count = Number(usageRows[0].count);

            // 3. Se tem uso, exige transferToId
            if (count > 0) {
                if (!transferToId) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        error: 'Este responsável possui vínculos.',
                        code: 'HAS_LINKS',
                        count
                    });
                }

                // Busca o novo responsável
                const { rows: newRows } = await client.query(
                    `SELECT nome FROM qualidade_responsaveis WHERE id = $1`,
                    [transferToId]
                );
                if (newRows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: 'Responsável de destino não encontrado.' });
                }
                const newName = newRows[0].nome;

                // Transfere
                await client.query(
                    `UPDATE qualidade_refugos SET responsavel_nome = $1, updated_at = NOW() WHERE responsavel_nome = $2`,
                    [newName, oldName]
                );
            }

            // 4. Exclui da tabela de configurações
            await client.query(
                `DELETE FROM qualidade_responsaveis WHERE id = $1`,
                [id]
            );

            await client.query('COMMIT');
            res.json({ ok: true, transferred: count });
        } catch (e: any) {
            await client.query('ROLLBACK');
            console.error(e);
            res.status(500).json({ error: String(e) });
        } finally {
            client.release();
        }
    });

// Temporary Fix Route
settingsRouter.get('/qualidade/fix-trigger', async (req, res) => {
    try {
        await pool.query(`
            CREATE OR REPLACE FUNCTION set_qualidade_refugos_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ language 'plpgsql';

            DROP TRIGGER IF EXISTS trg_qualidade_refugos_updated_at ON qualidade_refugos;

            CREATE TRIGGER trg_qualidade_refugos_updated_at
                BEFORE UPDATE ON qualidade_refugos
                FOR EACH ROW
                EXECUTE FUNCTION set_qualidade_refugos_updated_at();
        `);
        res.json({ ok: true, message: 'Trigger fixed' });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});
