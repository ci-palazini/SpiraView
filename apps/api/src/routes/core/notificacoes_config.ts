import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';
import { logger } from '../../logger';

const notificacoesConfigRouter: Router = Router();

/**
 * @swagger
 * /notificacoes/config/:evento:
 *   get:
 *     summary: Lista usuários que recebem notificação de um evento
 *     tags: [Notificações]
 */
notificacoesConfigRouter.get('/config/:evento', requirePermission('notificacoes_config', 'ver'), async (req, res) => {
    const { evento } = req.params;

    try {
        const result = await pool.query(
            `SELECT 
                nc.id, 
                nc.evento, 
                nc.usuario_id, 
                u.nome, 
                u.email, 
                u.email_real
             FROM notificacoes_config nc
             JOIN usuarios u ON nc.usuario_id = u.id
             WHERE nc.evento = $1
             ORDER BY u.nome ASC`,
            [evento]
        );
        res.json(result.rows);
    } catch (error: any) {
        logger.error({ err: error }, 'Erro ao listar notificacoes_config:');
        res.status(500).json({ error: 'Erro interno ao listar configurações.' });
    }
});

/**
 * @swagger
 * /notificacoes/config:
 *   post:
 *     summary: Adiciona usuário para receber notificação
 *     tags: [Notificações]
 */
notificacoesConfigRouter.post('/config', requirePermission('notificacoes_config', 'editar'), async (req, res) => {
    const { evento, usuario_id } = req.body;

    if (!evento || !usuario_id) {
        return res.status(400).json({ error: 'Evento e usuario_id são obrigatórios.' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO notificacoes_config (evento, usuario_id)
             VALUES ($1, $2)
             ON CONFLICT (evento, usuario_id) DO NOTHING
             RETURNING id, evento, usuario_id`,
            [evento, usuario_id]
        );

        // Se não retornou nada, é porque já existia (DO NOTHING)
        if (result.rows.length === 0) {
            return res.status(200).json({ message: 'Usuário já configurado para este evento.' });
        }

        res.status(201).json(result.rows[0]);
    } catch (error: any) {
        logger.error({ err: error }, 'Erro ao criar notificacoes_config:');
        res.status(500).json({ error: 'Erro interno ao salvar configuração.' });
    }
});

/**
 * @swagger
 * /notificacoes/config/:evento/:usuarioId:
 *   delete:
 *     summary: Remove usuário da lista de notificação
 *     tags: [Notificações]
 */
notificacoesConfigRouter.delete('/config/:evento/:usuarioId', requirePermission('notificacoes_config', 'editar'), async (req, res) => {
    const { evento, usuarioId } = req.params;

    try {
        await pool.query(
            `DELETE FROM notificacoes_config 
             WHERE evento = $1 AND usuario_id = $2`,
            [evento, usuarioId]
        );
        res.status(204).send();
    } catch (error: any) {
        logger.error({ err: error }, 'Erro ao excluir notificacoes_config:');
        res.status(500).json({ error: 'Erro interno ao remover configuração.' });
    }
});

export { notificacoesConfigRouter };
