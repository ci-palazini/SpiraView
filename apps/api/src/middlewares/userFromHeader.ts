//apps/api/src/middlewares/userFromHeader.ts
import type { NextFunction, Request, Response } from "express";
import * as jwt from "jsonwebtoken";
import { env } from "../config/env";
import { pool } from "../db";
import { DEFAULT_ROLE, normalizeRole } from "../auth/roles";

type DbUserRow = {
  id: string | null;   // UUID no banco
  nome: string | null;
  email: string | null;
  role: string | null;
};

export async function userFromHeader(req: Request, res: Response, next: NextFunction) {
  try {
    // Bearer token authentication
    const authHeader = req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);

      // 1. Check automation token first
      if (env.automation.apiToken && token === env.automation.apiToken) {
        req.user = {
          id: "automation",
          email: "automation@system.local",
          nome: "Automação",
          name: "Automação",
          role: "gestor",
        };
        return next();
      }

      // 2. Check JWT
      try {
        const decoded = jwt.verify(token, env.auth.jwtSecret) as any;
        req.user = {
          id: decoded.id,
          email: decoded.email,
          nome: decoded.nome,
          name: decoded.nome, // alias
          role: normalizeRole(decoded.role),
        };
        return next();
      } catch (err) {
        console.warn("JWT verification failed:", err);
        // Fallthrough: token invalid, so user is undefined
      }
    }

    // REMOVIDO: Fallback inseguro de x-user-email
    // O sistema agora exige Token JWT ou Token de Automação.

    req.user = undefined;
    return next();
  } catch (error) {
    console.error("userFromHeader", error);
    return next(error instanceof Error ? error : new Error("userFromHeader middleware failed"));
  }
}
