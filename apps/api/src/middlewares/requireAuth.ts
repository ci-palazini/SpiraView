import type { RequestHandler } from "express";

/**
 * Middleware que exige apenas que o usuário esteja autenticado (token JWT válido).
 * Use quando a rota não precisa de permissão granular, apenas de login.
 * Para permissões específicas, use requirePermission ou requireAnyPermission.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
    if (!req.user?.id) {
        return res.status(401).json({ error: "USUARIO_NAO_AUTENTICADO" });
    }
    next();
};
