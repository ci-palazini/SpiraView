import type { NextFunction, Request, Response } from "express";
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
    // Bearer token authentication (for automation scripts)
    const authHeader = req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
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
      // Invalid token - continue to check other auth methods
    }

    const emailHdr = req.header("x-user-email");
    const nomeHdr =
      req.header("x-user-nome") ??
      req.header("x-user-name") ??
      undefined;

    // já autenticado? não mexe
    if (req.user?.id) return next();

    const email = emailHdr ? String(emailHdr).trim() : "";
    if (!email) {
      req.user = undefined;
      return next();
    }

    const { rows } = await pool.query<DbUserRow>(
      `
      SELECT id::text, nome, email, role
      FROM public.usuarios
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [email]
    );

    // não achou
    if (!rows.length) {
      if (env.auth.strict) {
        return res.status(401).json({ error: "USUARIO_NAO_CADASTRADO" });
      }
      // modo não-estrito: cria user temporário
      req.user = {
        id: undefined,                    // sem UUID no banco
        email,
        nome: nomeHdr ?? null,            // <-- use null (não undefined)
        name: nomeHdr ?? null,            // alias
        role: DEFAULT_ROLE,
      };
      return next();
    }

    // achou
    const row = rows[0];

    req.user = {
      id: row.id ?? undefined,                            // string | undefined
      email: row.email ?? email,                          // string
      nome: (row.nome ?? nomeHdr) ?? null,               // string | null
      name: (row.nome ?? nomeHdr) ?? null,               // string | null (alias)
      role: normalizeRole(row.role),                      // normaliza
    };

    return next();
  } catch (error) {
    console.error("userFromHeader", error);
    return next(error instanceof Error ? error : new Error("userFromHeader middleware failed"));
  }
}
