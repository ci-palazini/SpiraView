import type { RequestHandler } from "express";
import { pool } from "../db";

type PermissionLevel = "nenhum" | "ver" | "editar";

interface UserPermissions {
    [pageKey: string]: PermissionLevel;
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
 */
function hasPermission(
    userPerm: PermissionLevel | undefined,
    requiredLevel: "ver" | "editar"
): boolean {
    if (!userPerm || userPerm === "nenhum") return false;
    if (requiredLevel === "ver") return userPerm === "ver" || userPerm === "editar";
    if (requiredLevel === "editar") return userPerm === "editar";
    return false;
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
            const user = req.user;

            if (!user?.id) {
                return res.status(401).json({ error: "USUARIO_NAO_AUTENTICADO" });
            }

            // Admin tem acesso total - bypass
            const userRole = (user.role || "").toLowerCase();
            if (userRole === "admin") {
                req.permissions = {}; // Permissões não são necessárias
                req.isAdmin = true;
                return next();
            }

            // Busca as permissões do role do usuário
            const { rows } = await pool.query<{ permissoes: UserPermissions }>(
                `SELECT r.permissoes 
         FROM usuarios u
         JOIN roles r ON u.role_id = r.id OR LOWER(u.role) = LOWER(r.nome)
         WHERE u.id = $1
         LIMIT 1`,
                [user.id]
            );

            if (!rows.length) {
                return res.status(403).json({ error: "ROLE_NAO_ENCONTRADO" });
            }

            const permissions = rows[0].permissoes || {};
            const userPerm = permissions[pageKey];

            if (!hasPermission(userPerm, level)) {
                return res.status(403).json({
                    error: "PERMISSAO_NEGADA",
                    message: `Permissão '${level}' necessária para '${pageKey}'`
                });
            }

            // Anexa permissões ao request para uso posterior
            req.permissions = permissions;

            next();
        } catch (error) {
            console.error("Erro ao verificar permissão:", error);
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
            const user = req.user;

            if (!user?.id) {
                return res.status(401).json({ error: "USUARIO_NAO_AUTENTICADO" });
            }

            // Admin tem acesso total - bypass
            const userRole = (user.role || "").toLowerCase();
            if (userRole === "admin") {
                req.permissions = {};
                req.isAdmin = true;
                return next();
            }

            const { rows } = await pool.query<{ permissoes: UserPermissions }>(
                `SELECT r.permissoes 
         FROM usuarios u
         JOIN roles r ON u.role_id = r.id OR LOWER(u.role) = LOWER(r.nome)
         WHERE u.id = $1
         LIMIT 1`,
                [user.id]
            );

            if (!rows.length) {
                return res.status(403).json({ error: "ROLE_NAO_ENCONTRADO" });
            }

            const permissions = rows[0].permissoes || {};
            const hasAny = pageKeys.some(key => hasPermission(permissions[key], level));

            if (!hasAny) {
                return res.status(403).json({
                    error: "PERMISSAO_NEGADA",
                    message: `Permissão '${level}' necessária para um de: ${pageKeys.join(", ")}`
                });
            }

            req.permissions = permissions;

            next();
        } catch (error) {
            console.error("Erro ao verificar permissão:", error);
            return res.status(500).json({ error: "ERRO_VERIFICACAO_PERMISSAO" });
        }
    };
}
