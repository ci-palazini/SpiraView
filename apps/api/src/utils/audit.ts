// apps/api/src/utils/audit.ts
// Central audit log helper — registra todas as ações de escrita críticas
import type { PoolClient } from 'pg';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'RESET_PASSWORD';

export interface AuditParams {
  /** Nome da tabela/entidade sendo auditada (ex: 'usuarios', 'chamados') */
  tabela: string;
  /** ID do registro afetado */
  registroId: string | number | null;
  /** Tipo de ação realizada */
  acao: AuditAction;
  /** Dados anteriores (para UPDATE/DELETE) */
  dadosAnteriores?: Record<string, unknown> | null;
  /** Dados novos (para CREATE/UPDATE) */
  dadosNovos?: Record<string, unknown> | null;
  /** ID do usuário que realizou a ação */
  usuarioId?: string | null;
  /** Nome do usuário que realizou a ação */
  usuarioNome?: string | null;
  /** IP do cliente (opcional) */
  ip?: string | null;
}

/**
 * Registra uma entrada no audit_log central.
 * Deve ser chamado DENTRO de uma transação (`withTx`) para garantir atomicidade.
 *
 * @example
 * await withTx(async (client) => {
 *   const { rows } = await client.query('UPDATE chamados SET ... WHERE id=$1 RETURNING *', [id]);
 *   await logAudit(client, {
 *     tabela: 'chamados', registroId: id, acao: 'UPDATE',
 *     dadosNovos: rows[0], usuarioId: req.user?.id, usuarioNome: req.user?.nome,
 *   });
 * });
 */
export async function logAudit(client: PoolClient, params: AuditParams): Promise<void> {
  const { tabela, registroId, acao, dadosAnteriores = null, dadosNovos = null, usuarioId = null, usuarioNome = null, ip = null } = params;

  await client.query(
    `INSERT INTO audit_log
       (tabela, registro_id, acao, dados_anteriores, dados_novos, usuario_id, usuario_nome, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      tabela,
      registroId !== null ? String(registroId) : null,
      acao,
      dadosAnteriores ? JSON.stringify(dadosAnteriores) : null,
      dadosNovos ? JSON.stringify(dadosNovos) : null,
      usuarioId,
      usuarioNome,
      ip,
    ]
  );
}
