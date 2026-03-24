import { pool } from '../../db';

/**
 * Verifica permissão granular para um usuário sem passar pelo middleware.
 * Usado internamente nas rotas de chamados para checar chamados_gestao.
 */
export async function checkPermission(
  userId: string,
  pageKey: string,
  level: 'ver' | 'editar'
): Promise<boolean> {
  if (!userId) return false;
  const { rows } = await pool.query<{ permissoes: Record<string, string>; role_nome: string }>(
    `SELECT COALESCE(u.permissoes, r.permissoes) as permissoes, r.nome as role_nome
       FROM usuarios u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1 LIMIT 1`,
    [userId]
  );
  if (!rows.length) return false;
  if ((rows[0].role_nome || '').toLowerCase() === 'admin') return true;
  const permissions = rows[0]?.permissoes || {};
  const userPerm = permissions[pageKey];
  if (!userPerm || userPerm === 'nenhum') return false;
  if (level === 'ver') return userPerm === 'ver' || userPerm === 'editar';
  return userPerm === 'editar';
}

/**
 * Busca o resumo de um chamado para retorno após operações de escrita
 * (criar, atribuir, desatribuir, atender, atualizar status).
 * Evita repetir o mesmo SELECT em 5 lugares.
 */
export async function getChamadoSummary(id: string) {
  const { rows } = await pool.query(
    `SELECT
       c.id,
       m.nome AS maquina,
       c.tipo,
       c.status,
       CASE
         WHEN LOWER(c.status) LIKE 'abert%'       THEN 'aberto'
         WHEN LOWER(c.status) LIKE 'em andament%' THEN 'em_andamento'
         WHEN LOWER(c.status) LIKE 'conclu%'      THEN 'concluido'
         WHEN LOWER(c.status) LIKE 'cancel%'      THEN 'cancelado'
         ELSE 'aberto'
       END AS status_key,
       c.descricao,
       u.nome  AS criado_por,
       um.nome AS manutentor,
       to_char(c.criado_em, 'YYYY-MM-DD HH24:MI') AS criado_em
     FROM public.chamados c
     JOIN public.maquinas  m  ON m.id  = c.maquina_id
     JOIN public.usuarios  u  ON u.id  = c.criado_por_id
     LEFT JOIN public.usuarios um ON um.id = c.manutentor_id
     WHERE c.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}
