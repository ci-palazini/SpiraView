import { Router } from 'express';
import { pool } from '../../db';
import { requirePermission, requireAnyPermission } from '../../middlewares/requirePermission';
import { logger } from '../../logger';
import { listResponse } from '../../utils/response';

export const setoresRouter: Router = Router();

// GET /producao/setores - Listar setores de produção
setoresRouter.get(
  '/producao/setores',
  requireAnyPermission(['producao_resultados', 'producao_config'], 'ver'),
  async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, nome, ordem, ativo, criado_em AS "criadoEm", atualizado_em AS "atualizadoEm"
         FROM producao_setores
         ORDER BY ordem ASC, nome ASC`
      );
      listResponse(res, rows);
    } catch (e: unknown) {
      logger.error({ err: e }, 'Erro ao listar setores de produção');
      res.status(500).json({ error: 'Erro ao listar setores.' });
    }
  }
);

// POST /producao/setores - Criar setor
setoresRouter.post(
  '/producao/setores',
  requirePermission('producao_config', 'editar'),
  async (req, res) => {
    try {
      const { nome, ordem } = req.body || {};
      const nomeTrim = String(nome || '').trim();

      if (!nomeTrim) {
        return res.status(400).json({ error: 'Nome é obrigatório.' });
      }

      // Check duplicate
      const dup = await pool.query(
        'SELECT id FROM producao_setores WHERE lower(nome) = lower($1)',
        [nomeTrim]
      );
      if (dup.rowCount && dup.rowCount > 0) {
        return res.status(409).json({ error: 'Já existe um setor com esse nome.' });
      }

      const { rows } = await pool.query(
        `INSERT INTO producao_setores (nome, ordem)
         VALUES ($1, $2)
         RETURNING id, nome, ordem, ativo, criado_em AS "criadoEm"`,
        [nomeTrim, typeof ordem === 'number' ? ordem : 0]
      );

      res.status(201).json(rows[0]);
    } catch (e: unknown) {
      logger.error({ err: e }, 'Erro ao criar setor de produção');
      res.status(500).json({ error: 'Erro ao criar setor.' });
    }
  }
);

// PUT /producao/setores/:id - Atualizar setor
setoresRouter.put(
  '/producao/setores/:id',
  requirePermission('producao_config', 'editar'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { nome, ordem, ativo } = req.body || {};
      const nomeTrim = String(nome || '').trim();

      if (!nomeTrim) {
        return res.status(400).json({ error: 'Nome é obrigatório.' });
      }

      // Check duplicate (exclude self)
      const dup = await pool.query(
        'SELECT id FROM producao_setores WHERE lower(nome) = lower($1) AND id != $2',
        [nomeTrim, id]
      );
      if (dup.rowCount && dup.rowCount > 0) {
        return res.status(409).json({ error: 'Já existe outro setor com esse nome.' });
      }

      const { rows, rowCount } = await pool.query(
        `UPDATE producao_setores
         SET nome = $2, ordem = $3, ativo = $4, atualizado_em = NOW()
         WHERE id = $1
         RETURNING id, nome, ordem, ativo, atualizado_em AS "atualizadoEm"`,
        [id, nomeTrim, typeof ordem === 'number' ? ordem : 0, ativo !== false]
      );

      if (!rowCount) {
        return res.status(404).json({ error: 'Setor não encontrado.' });
      }

      res.json(rows[0]);
    } catch (e: unknown) {
      logger.error({ err: e }, 'Erro ao atualizar setor de produção');
      res.status(500).json({ error: 'Erro ao atualizar setor.' });
    }
  }
);

// DELETE /producao/setores/:id - Excluir setor
setoresRouter.delete(
  '/producao/setores/:id',
  requirePermission('producao_config', 'editar'),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Guard: nenhuma máquina referencia este setor
      const inUse = await pool.query(
        'SELECT COUNT(*)::int AS total FROM maquinas WHERE setor_producao_id = $1',
        [id]
      );
      if (Number(inUse.rows[0]?.total) > 0) {
        return res.status(400).json({
          error: 'Não é possível excluir: existem máquinas vinculadas a este setor.',
        });
      }

      const { rowCount } = await pool.query(
        'DELETE FROM producao_setores WHERE id = $1',
        [id]
      );

      if (!rowCount) {
        return res.status(404).json({ error: 'Setor não encontrado.' });
      }

      res.json({ ok: true });
    } catch (e: unknown) {
      logger.error({ err: e }, 'Erro ao excluir setor de produção');
      res.status(500).json({ error: 'Erro ao excluir setor.' });
    }
  }
);
