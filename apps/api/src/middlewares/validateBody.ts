import type { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

/**
 * Middleware factory que valida req.body contra um schema Zod.
 * Retorna 400 com os erros detalhados se a validação falhar.
 * Substitui req.body pelo valor parseado (já coerced/transformed pelo schema).
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = formatZodErrors(result.error);
      res.status(400).json({ error: 'Dados inválidos.', details: errors });
      return;
    }
    req.body = result.data;
    next();
  };
}

function formatZodErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_root';
    out[key] = issue.message;
  }
  return out;
}
