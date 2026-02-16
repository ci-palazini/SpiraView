//apps/api/src/middlewares/requirePermission.ts
import type { RequestHandler, Request, Response } from "express";
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
 * Carrega as permissões do usuário e o status de admin.
 * Retorna null se a autenticação ou role falhar, enviando a resposta de erro.
 */
async function loadUserPermissions(req: Request, res: Response): Promise<{ isRoleAdmin: boolean; permissions: UserPermissions } | null> {
    const user = req.user;

    if (!user?.id) {
        res.status(401).json({ error: "USUARIO_NAO_AUTENTICADO" });
        return null;
    }

    // Busca permissões e o nome da role diretamente do banco (fonte da verdade)
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
            console.error("Erro ao verificar permissão:", error);
            return res.status(500).json({ error: "ERRO_VERIFICACAO_PERMISSAO" });
        }
    };
}
