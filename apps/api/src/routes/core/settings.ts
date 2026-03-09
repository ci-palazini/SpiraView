// apps/api/src/routes/core/settings.ts
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../../db';
import { logger } from '../../logger';
import { requireAuth } from '../../middlewares/requireAuth';
import { validateBody } from '../../middlewares/validateBody';

export const settingsRouter: Router = Router();

/** Verifica se o usuário logado é admin (via DB, não só JWT) */
async function isRealAdmin(userId: string): Promise<boolean> {
    const { rows } = await pool.query(
        `SELECT r.nome FROM usuarios u JOIN roles r ON u.role_id = r.id WHERE u.id = $1 LIMIT 1`,
        [userId]
    );
    return rows.length > 0 && rows[0].nome.toLowerCase() === 'admin';
}

const setPinSchema = z.object({
    pin: z.string().min(4).max(8).regex(/^\d+$/, 'PIN deve conter apenas dígitos.'),
});

/**
 * GET /settings/tv-config
 * Retorna configuração pública do Modo TV (se PIN está definido).
 * Requer autenticação + admin.
 */
settingsRouter.get('/settings/tv-config', requireAuth, async (req, res) => {
    try {
        if (!(await isRealAdmin(req.user!.id!))) {
            return res.status(403).json({ error: 'Apenas administradores podem acessar configurações do sistema.' });
        }

        const { rows } = await pool.query<{ value: string | null }>(
            `SELECT value FROM system_settings WHERE key = 'tv_pin_hash' LIMIT 1`
        );

        return res.json({ hasPin: !!(rows[0]?.value) });
    } catch (e: any) {
        logger.error({ err: e }, '[SETTINGS TV-CONFIG GET ERROR]');
        res.status(500).json({ error: 'Erro ao buscar configuração do Modo TV.' });
    }
});

/**
 * PUT /settings/tv-pin
 * Define ou atualiza o PIN do Modo TV.
 * Requer autenticação + admin.
 */
settingsRouter.put('/settings/tv-pin', requireAuth, validateBody(setPinSchema), async (req, res) => {
    try {
        if (!(await isRealAdmin(req.user!.id!))) {
            return res.status(403).json({ error: 'Apenas administradores podem configurar o PIN do Modo TV.' });
        }

        const { pin } = req.body as { pin: string };
        const hash = await bcrypt.hash(pin, 10);

        await pool.query(
            `INSERT INTO system_settings (key, value, updated_at)
             VALUES ('tv_pin_hash', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
            [hash]
        );

        return res.json({ ok: true });
    } catch (e: any) {
        logger.error({ err: e }, '[SETTINGS TV-PIN PUT ERROR]');
        res.status(500).json({ error: 'Erro ao salvar PIN do Modo TV.' });
    }
});

/**
 * DELETE /settings/tv-pin
 * Remove o PIN do Modo TV (desabilita acesso).
 * Requer autenticação + admin.
 */
settingsRouter.delete('/settings/tv-pin', requireAuth, async (req, res) => {
    try {
        if (!(await isRealAdmin(req.user!.id!))) {
            return res.status(403).json({ error: 'Apenas administradores podem configurar o PIN do Modo TV.' });
        }

        await pool.query(
            `UPDATE system_settings SET value = NULL, updated_at = NOW() WHERE key = 'tv_pin_hash'`
        );

        return res.json({ ok: true });
    } catch (e: any) {
        logger.error({ err: e }, '[SETTINGS TV-PIN DELETE ERROR]');
        res.status(500).json({ error: 'Erro ao remover PIN do Modo TV.' });
    }
});
