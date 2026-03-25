import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { requirePermission } from '../../middlewares/requirePermission';
import { validateBody } from '../../middlewares/validateBody';
import { logger } from '../../logger';
import { listResponse } from '../../utils/response';

const createDepartamentoSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório.').max(150).trim(),
  descricao: z.string().max(500).optional().nullable(),
  pai_id: z.string().uuid().optional().nullable(),
});

const updateDepartamentoSchema = createDepartamentoSchema.partial();

export const departamentosRouter: Router = Router();

// GET /departamentos — lista plana com contagem de colaboradores
departamentosRouter.get('/departamentos', requirePermission('departamentos', 'ver'), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        d.id,
        d.nome,
        d.descricao,
        d.pai_id,
        d.ativo,
        d.created_at,
        COUNT(u.id)::int AS colaboradores_count
      FROM departamentos d
      LEFT JOIN usuarios u ON u.departamento_id = d.id AND u.ativo = true
      WHERE d.ativo = true
      GROUP BY d.id
      ORDER BY d.nome ASC
    `);
    listResponse(res, rows);
  } catch (e: any) {
    logger.error({ err: e }, 'Erro ao listar departamentos');
    res.status(500).json({ error: String(e) });
  }
});

// GET /departamentos/arvore — árvore recursiva via CTE
departamentosRouter.get('/departamentos/arvore', requirePermission('departamentos', 'ver'), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH RECURSIVE arvore AS (
        SELECT id, nome, descricao, pai_id, ativo, 0 AS nivel
        FROM departamentos WHERE pai_id IS NULL AND ativo = true
        UNION ALL
        SELECT d.id, d.nome, d.descricao, d.pai_id, d.ativo, a.nivel + 1
        FROM departamentos d JOIN arvore a ON d.pai_id = a.id WHERE d.ativo = true
      )
      SELECT
        a.id,
        a.nome,
        a.descricao,
        a.pai_id,
        a.ativo,
        a.nivel,
        COUNT(u.id)::int AS colaboradores_count
      FROM arvore a
      LEFT JOIN usuarios u ON u.departamento_id = a.id AND u.ativo = true
      GROUP BY a.id, a.nome, a.descricao, a.pai_id, a.ativo, a.nivel
      ORDER BY a.nivel ASC, a.nome ASC
    `);

    // Monta estrutura em árvore
    const map = new Map<string, any>();
    const roots: any[] = [];

    for (const row of rows) {
      map.set(row.id, { ...row, subdepartamentos: [] });
    }

    for (const row of rows) {
      const node = map.get(row.id)!;
      if (row.pai_id && map.has(row.pai_id)) {
        map.get(row.pai_id)!.subdepartamentos.push(node);
      } else {
        roots.push(node);
      }
    }

    res.json({ items: roots });
  } catch (e: any) {
    logger.error({ err: e }, 'Erro ao montar árvore de departamentos');
    res.status(500).json({ error: String(e) });
  }
});

// POST /departamentos — criar
departamentosRouter.post('/departamentos', requirePermission('departamentos', 'editar'), validateBody(createDepartamentoSchema), async (req, res) => {
  try {
    const { nome, descricao, pai_id } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO departamentos (nome, descricao, pai_id)
       VALUES ($1, $2, $3)
       RETURNING id, nome, descricao, pai_id, ativo, created_at`,
      [nome, descricao ?? null, pai_id ?? null]
    );

    res.status(201).json(rows[0]);
  } catch (e: any) {
    logger.error({ err: e }, 'Erro ao criar departamento');
    res.status(500).json({ error: String(e) });
  }
});

// PUT /departamentos/:id — editar
departamentosRouter.put('/departamentos/:id', requirePermission('departamentos', 'editar'), validateBody(updateDepartamentoSchema), async (req, res) => {
  try {
    const id = String(req.params.id);
    const { nome, descricao, pai_id } = req.body;

    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, v: unknown) => { params.push(v); sets.push(`${col}=$${params.length}`); };

    if (nome !== undefined) add('nome', nome);
    if (descricao !== undefined) add('descricao', descricao);
    if (pai_id !== undefined) {
      // Impede ciclo: o pai não pode ser o próprio departamento
      if (pai_id === id) return res.status(400).json({ error: 'Departamento não pode ser pai de si mesmo.' });
      add('pai_id', pai_id);
    }

    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE departamentos SET ${sets.join(', ')}
       WHERE id=$${params.length} AND ativo=true
       RETURNING id, nome, descricao, pai_id, ativo, created_at`,
      params
    );

    if (!rows.length) return res.status(404).json({ error: 'Departamento não encontrado.' });
    res.json(rows[0]);
  } catch (e: any) {
    logger.error({ err: e }, 'Erro ao editar departamento');
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /departamentos/:id — remove apenas se sem filhos e sem utilizadores
departamentosRouter.delete('/departamentos/:id', requirePermission('departamentos', 'editar'), async (req, res) => {
  try {
    const id = String(req.params.id);

    // Verifica filhos ativos
    const { rows: filhos } = await pool.query(
      `SELECT id FROM departamentos WHERE pai_id=$1 AND ativo=true LIMIT 1`,
      [id]
    );
    if (filhos.length) {
      return res.status(400).json({ error: 'Departamento possui subdepartamentos e não pode ser excluído.' });
    }

    // Verifica colaboradores vinculados
    const { rows: colab } = await pool.query(
      `SELECT id FROM usuarios WHERE departamento_id=$1 AND ativo=true LIMIT 1`,
      [id]
    );
    if (colab.length) {
      return res.status(400).json({ error: 'Departamento possui colaboradores e não pode ser excluído.' });
    }

    // Soft-delete
    const { rowCount } = await pool.query(
      `UPDATE departamentos SET ativo=false WHERE id=$1 AND ativo=true`,
      [id]
    );

    if (!rowCount) return res.status(404).json({ error: 'Departamento não encontrado.' });
    res.json({ ok: true, id });
  } catch (e: any) {
    logger.error({ err: e }, 'Erro ao excluir departamento');
    res.status(500).json({ error: String(e) });
  }
});
