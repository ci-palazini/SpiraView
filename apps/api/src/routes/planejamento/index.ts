// apps/api/src/routes/planejamento/index.ts
import { Router } from 'express';
import { capacidadeRouter } from './capacidade';

export const planejamentoRouter: Router = Router();

// Agregador: Monta todas as rotas de planejamento com prefixo
planejamentoRouter.use('/planejamento', capacidadeRouter);

// Rota de health check do módulo
planejamentoRouter.get('/planejamento/health', (_req, res) => {
    res.json({
        status: 'ok',
        module: 'planejamento',
        message: 'Módulo de Planejamento ativo'
    });
});
