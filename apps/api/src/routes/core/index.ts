// apps/api/src/routes/core/index.ts
import { Router } from 'express';
import { authRouter } from './auth';
import { operatorAuthRouter } from './operatorAuth';
import { usuariosRouter } from './usuarios';
import rolesRouter from './roles';
import { healthRouter } from './health';
import { eventsRouter } from './events';

export const coreRouter: Router = Router();

// Agregador: Monta todas as rotas core
coreRouter.use(authRouter);
coreRouter.use(operatorAuthRouter);
coreRouter.use(usuariosRouter);
coreRouter.use('/roles', rolesRouter);
coreRouter.use(healthRouter);
coreRouter.use(eventsRouter);

// Re-export individual routers for direct access if needed
export { authRouter } from './auth';
export { operatorAuthRouter } from './operatorAuth';
export { usuariosRouter } from './usuarios';
export { default as rolesRouter } from './roles';
export { healthRouter } from './health';
export { eventsRouter } from './events';
