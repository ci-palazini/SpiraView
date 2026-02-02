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
