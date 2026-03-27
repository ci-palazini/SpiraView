//apps/api/src/middlewares/userFromHeader.ts
import { timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";
import * as jwt from "jsonwebtoken";
import { env } from "../config/env";
import { pool } from "../db";
import { DEFAULT_ROLE, normalizeRole } from "../auth/roles";
import { logger } from "../logger";

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
      if (env.automation.apiToken) {
        const a = Buffer.from(token);
        const b = Buffer.from(env.automation.apiToken);
        if (a.length === b.length && timingSafeEqual(a, b)) {
          // Fetch permissions for the automation role from the DB
          const { rows } = await pool.query(
            "SELECT nome, permissoes FROM roles WHERE nome = 'automation' LIMIT 1"
          );
          
          const roleData = rows[0];

          req.user = {
            id: "automation",
            email: "automation@system.local",
            nome: "Automação",
            name: "Automação",
            role: roleData?.nome || "automation",
            permissoes: roleData?.permissoes || { reuniao_diaria: "ver" },
          };
          return next();
        }
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
          permissoes: decoded.permissoes ?? undefined,
        };
        return next();
      } catch (err) {
        logger.warn({ err }, "JWT verification failed");
        // Fallthrough: token invalid, so user is undefined
      }
    }

    req.user = undefined;
    return next();
  } catch (error) {
    logger.error({ err: error }, "userFromHeader middleware failed");
    return next(error instanceof Error ? error : new Error("userFromHeader middleware failed"));
  }
}
