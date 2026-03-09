// apps/api/src/routes/core/index.ts
import { Router } from 'express';
import { authRouter } from './auth';
import { operatorAuthRouter } from './operatorAuth';
import { usuariosRouter } from './usuarios';
import rolesRouter from './roles';
import { healthRouter } from './health';
import { eventsRouter } from './events';
import { notificacoesConfigRouter } from './notificacoes_config';
import { settingsRouter } from './settings';

export const coreRouter: Router = Router();

// Agregador: Monta todas as rotas core
coreRouter.use(authRouter);
coreRouter.use(operatorAuthRouter);
coreRouter.use(usuariosRouter);
coreRouter.use('/roles', rolesRouter);
coreRouter.use(healthRouter);
coreRouter.use(eventsRouter);
coreRouter.use('/notificacoes', notificacoesConfigRouter);
coreRouter.use(settingsRouter);
