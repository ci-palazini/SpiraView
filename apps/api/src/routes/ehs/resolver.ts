// apps/api/src/routes/ehs/resolver.ts
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';
import { logger } from '../../logger';

export const ehsResolverRouter: Router = Router();

const resolverSchema = z.object({
    resolucoes: z
        .array(
            z.object({
                observadorTexto: z.string().min(1),
                usuarioId: z.string().uuid(),
            })
        )
        .min(1),
});

/**
 * POST /ehs/resolver-observadores
 * Mapeia observadores textuais a utilizadores cadastrados.
 */
ehsResolverRouter.post(
    '/ehs/resolver-observadores',
    requirePermission('safety', 'editar'),
    async (req, res) => {
        const parsed = resolverSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                error: 'Dados inválidos.',
                details: parsed.error.flatten().fieldErrors,
            });
        }

        const { resolucoes } = parsed.data;
        const userId = (req as any).userId || null;
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            let mapeamentosSalvos = 0;
            let observacoesAtualizadas = 0;

            for (const { observadorTexto, usuarioId } of resolucoes) {
                // UPSERT no mapeamento
                await client.query(
                    `INSERT INTO safety_observador_mapeamentos (observador_texto, usuario_id, criado_por_id)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (observador_texto) DO UPDATE SET
                         usuario_id = EXCLUDED.usuario_id,
                         criado_por_id = EXCLUDED.criado_por_id`,
                    [observadorTexto, usuarioId, userId]
                );
                mapeamentosSalvos++;

                // Atualizar observações históricas que ainda não têm usuario_id
                const updateResult = await client.query(
                    `UPDATE safety_observacoes
                     SET usuario_id = $1
                     WHERE observador = $2 AND usuario_id IS NULL`,
                    [usuarioId, observadorTexto]
                );
                observacoesAtualizadas += updateResult.rowCount || 0;
            }

            await client.query('COMMIT');

            res.json({ ok: true, mapeamentosSalvos, observacoesAtualizadas });
        } catch (e: unknown) {
            await client.query('ROLLBACK').catch(() => {});
            logger.error({ err: e }, '[ehs/resolver] Erro ao resolver observadores');
            res.status(500).json({ error: 'Erro interno ao resolver observadores.' });
        } finally {
            client.release();
        }
    }
);
