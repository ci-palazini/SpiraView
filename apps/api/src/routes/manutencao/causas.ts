import { Router } from 'express';
import { pool } from '../../db';

export const causasRouter: Router = Router();

// Helper: verificar permissão granular inline
async function checkPermission(userId: string, pageKey: string, level: 'ver' | 'editar'): Promise<boolean> {
  if (!userId) return false;
  const { rows } = await pool.query<{ permissoes: Record<string, string> }>(
    `SELECT r.permissoes FROM usuarios u
         JOIN roles r ON u.role_id = r.id OR LOWER(u.role) = LOWER(r.nome)
         WHERE u.id = $1 LIMIT 1`,
    [userId]
  );
  const permissions = rows[0]?.permissoes || {};
  const userPerm = permissions[pageKey];
  if (!userPerm || userPerm === 'nenhum') return false;
  if (level === 'ver') return userPerm === 'ver' || userPerm === 'editar';
  return userPerm === 'editar';
}

causasRouter.get('/causas', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome
         FROM causas_raiz
        ORDER BY nome ASC`
    );
    // 👇 devolve o array direto
    res.json(rows);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// POST /causas
causasRouter.post('/causas', async (req, res) => {
  try {
    const auth = (req as any).user || {};
    const userRole = (auth.role || '').toLowerCase();
    const isAdmin = userRole === 'admin';

    if (!isAdmin && !await checkPermission(auth.id, 'causas_raiz', 'editar')) {
      return res.status(403).json({ error: 'Sem permissão para gerenciar causas.' });
    }

    const nome = String(req.body?.nome || '').trim();
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

    const ins = await pool.query(
      `INSERT INTO causas_raiz (nome)
       VALUES ($1)
       ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome
       RETURNING id, nome`,
      [nome]
    );
    res.status(201).json(ins.rows[0]);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /causas/:id
causasRouter.delete('/causas/:id', async (req, res) => {
  try {
    const auth = (req as any).user || {};
    const userRole = (auth.role || '').toLowerCase();
    const isAdmin = userRole === 'admin';

    if (!isAdmin && !await checkPermission(auth.id, 'causas_raiz', 'editar')) {
      return res.status(403).json({ error: 'Sem permissão para excluir causa.' });
    }

    const id = String(req.params.id);
    const del = await pool.query(`DELETE FROM causas_raiz WHERE id = $1`, [id]);
    if (!del.rowCount) return res.status(404).json({ error: 'Causa não encontrada.' });

    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// GET /usuarios
