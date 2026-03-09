//apps/api/src/middlewares/requirePermission.ts
import type { RequestHandler, Request, Response } from "express";
import { pool } from "../db";
import { logger } from "../logger";

type PermissionLevel = "nenhum" | "ver" | "editar";

interface UserPermissions {
    [pageKey: string]: PermissionLevel;
}

// Cache em memória para status ativo do usuário — evita DB hit em cada request autenticado
const ACTIVE_CACHE_TTL_MS = 60_000; // 60 segundos
const activeCache = new Map<string, { ativo: boolean; ts: number }>();

/** Invalida o cache de status ativo para um usuário (chamar ao desativar) */
export function invalidateUserActiveCache(userId: string): void {
    activeCache.delete(userId);
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            permissions?: UserPermissions;
            isAdmin?: boolean;
        }
    }
}

/**
 * Verifica se o nível de permissão do usuário é suficiente
 * @internal também exportada para testes unitários
 */
export function hasPermission(
    userPerm: PermissionLevel | undefined,
    requiredLevel: "ver" | "editar"
): boolean {
    if (!userPerm || userPerm === "nenhum") return false;
    if (requiredLevel === "ver") return userPerm === "ver" || userPerm === "editar";
    if (requiredLevel === "editar") return userPerm === "editar";
    return false;
}

/**
 * Carrega as permissões do usuário e o status de admin.
 * Retorna null se a autenticação ou role falhar, enviando a resposta de erro.
 */
async function loadUserPermissions(req: Request, res: Response): Promise<{ isRoleAdmin: boolean; permissions: UserPermissions } | null> {
    const user = req.user;

    if (!user?.id) {
        res.status(401).json({ error: "USUARIO_NAO_AUTENTICADO" });
        return null;
    }

    // Usa permissões do JWT quando disponíveis (evita DB query por request)
    if (user.permissoes !== undefined) {
        const permissions = user.permissoes as UserPermissions;
        const roleName = (user.role ?? "").toLowerCase();

        // Verifica se o usuário ainda está ativo — cache de 60s para evitar DB hit por request
        const cacheKey = user.id!;
        const cached = activeCache.get(cacheKey);
        const now = Date.now();
        let isActive: boolean;

        if (cached && now - cached.ts < ACTIVE_CACHE_TTL_MS) {
            isActive = cached.ativo;
        } else {
            const { rows: activeCheck } = await pool.query<{ ativo: boolean }>(
                `SELECT ativo FROM usuarios WHERE id = $1 LIMIT 1`, [user.id]
            );
            isActive = activeCheck.length > 0 && activeCheck[0].ativo;
            activeCache.set(cacheKey, { ativo: isActive, ts: now });
        }

        if (!isActive) {
            res.status(401).json({ error: "USUARIO_INATIVO" });
            return null;
        }

        return { isRoleAdmin: roleName === 'admin', permissions };
    }

    // Fallback: tokens antigos sem permissoes no payload → busca no banco
    const { rows } = await pool.query<{ permissoes: UserPermissions; role_nome: string }>(
        `SELECT r.permissoes, r.nome as role_nome
         FROM usuarios u
         JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1
         LIMIT 1`,
        [user.id]
    );

    if (!rows.length) {
        res.status(403).json({ error: "ROLE_NAO_ENCONTRADO" });
        return null;
    }

    const dbRoleName = (rows[0].role_nome || "").toLowerCase();
    const isRoleAdmin = dbRoleName === 'admin';
    const permissions = rows[0].permissoes || {};

    return { isRoleAdmin, permissions };
}

/**
 * Middleware para verificar permissão granular do usuário.
 * Busca as permissões do role do usuário no banco de dados.
 *
 * @param pageKey - Chave da página/recurso (ex: 'usuarios', 'maquinas')
 * @param level - Nível mínimo requerido: 'ver' ou 'editar'
 */
export function requirePermission(
    pageKey: string,
    level: "ver" | "editar" = "ver"
): RequestHandler {
    return async (req, res, next) => {
        try {
            // Modo TV: permite apenas leitura, sem verificar a tabela usuarios
            if (req.user?.role === 'tv') {
                if (level === 'editar') {
                    return res.status(403).json({ error: 'PERMISSAO_NEGADA', message: 'Modo TV não tem permissão de edição.' });
                }
                return next();
            }

            const userPerms = await loadUserPermissions(req, res);
            if (!userPerms) {
                return; // Response already sent by loadUserPermissions
            }

            const { isRoleAdmin, permissions } = userPerms;

            // Admin tem acesso total - bypass
            if (isRoleAdmin) {
                req.permissions = permissions;
                req.isAdmin = isRoleAdmin;
                return next();
            }

            const userPerm = permissions[pageKey];
            if (!hasPermission(userPerm, level)) {
                return res.status(403).json({
                    error: "PERMISSAO_NEGADA",
                    message: `Permissão '${level}' necessária para '${pageKey}'`
                });
            }

            // Anexa permissões ao request para uso posterior
            req.permissions = permissions;
            req.isAdmin = isRoleAdmin;

            next();
        } catch (error) {
            logger.error({ err: error }, "Erro ao verificar permissão");
            return res.status(500).json({ error: "ERRO_VERIFICACAO_PERMISSAO" });
        }
    };
}

/**
 * Middleware para verificar múltiplas permissões (ANY - basta ter uma)
 */
export function requireAnyPermission(
    pageKeys: string[],
    level: "ver" | "editar" = "ver"
): RequestHandler {
    return async (req, res, next) => {
        try {
            // Modo TV: permite apenas leitura, sem verificar a tabela usuarios
            if (req.user?.role === 'tv') {
                if (level === 'editar') {
                    return res.status(403).json({ error: 'PERMISSAO_NEGADA', message: 'Modo TV não tem permissão de edição.' });
                }
                return next();
            }

            const userPerms = await loadUserPermissions(req, res);
            if (!userPerms) {
                return; // Response already sent by loadUserPermissions
            }

            const { isRoleAdmin, permissions } = userPerms;

            // Admin tem acesso total - bypass
            if (isRoleAdmin) {
                req.permissions = permissions;
                req.isAdmin = isRoleAdmin;
                return next();
            }

            const hasAny = pageKeys.some(key => hasPermission(permissions[key], level));

            if (!hasAny) {
                return res.status(403).json({
                    error: "PERMISSAO_NEGADA",
                    message: `Permissão '${level}' necessária para um de: ${pageKeys.join(", ")}`
                });
            }

            req.permissions = permissions;
            req.isAdmin = isRoleAdmin;

            next();
        } catch (error) {
            logger.error({ err: error }, "Erro ao verificar permissão");
            return res.status(500).json({ error: "ERRO_VERIFICACAO_PERMISSAO" });
        }
    };
}
