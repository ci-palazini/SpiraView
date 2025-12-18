// Roles dinâmicos - agora gerenciados pelo banco de dados
// Este arquivo mantém apenas funções utilitárias básicas

export const DEFAULT_ROLE = "operador";

/**
 * Normaliza o nome do role:
 * - Trim e lowercase
 * - Retorna DEFAULT_ROLE se inválido
 */
export function normalizeRole(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return DEFAULT_ROLE;
  }
  return value.trim().toLowerCase();
}
