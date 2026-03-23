import type { Response } from "express";

/**
 * Resposta padrão para listas sem paginação.
 * { items: T[] }
 */
export function listResponse<T>(res: Response, items: T[]): void {
    res.json({ items });
}

/**
 * Resposta padrão para listas paginadas.
 * { items: T[], page, pageSize, total, hasNext }
 */
export function paginatedResponse<T>(
    res: Response,
    items: T[],
    total: number,
    page: number,
    pageSize: number
): void {
    res.json({
        items,
        total,
        page,
        pageSize,
        hasNext: page * pageSize < total,
    });
}
