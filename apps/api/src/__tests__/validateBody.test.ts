import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validateBody } from '../middlewares/validateBody';
import type { Request, Response, NextFunction } from 'express';

function mockReqRes(body: unknown) {
  const req = { body } as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('validateBody', () => {
  const schema = z.object({
    nome: z.string().min(1, 'Nome obrigatório.'),
    idade: z.coerce.number().int().positive(),
  });

  it('chama next() quando o body é válido e substitui req.body pelo valor parseado', () => {
    const { req, res, next } = mockReqRes({ nome: '  João  ', idade: '25' });
    validateBody(schema)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toMatchObject({ nome: '  João  ', idade: 25 }); // idade coerced
    expect(res.status).not.toHaveBeenCalled();
  });

  it('retorna 400 com errors quando o body é inválido', () => {
    const { req, res, next } = mockReqRes({ nome: '', idade: -1 });
    validateBody(schema)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Dados inválidos.',
        details: expect.objectContaining({ nome: 'Nome obrigatório.' }),
      })
    );
  });

  it('retorna 400 quando body é completamente ausente', () => {
    const { req, res, next } = mockReqRes(undefined);
    validateBody(schema)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
