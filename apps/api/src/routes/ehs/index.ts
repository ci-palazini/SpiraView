// apps/api/src/routes/ehs/index.ts
import { Router } from 'express';
import { ehsUploadRouter } from './upload';
import { ehsResolverRouter } from './resolver';
import { ehsComplianceRouter } from './compliance';

export const ehsRouter: Router = Router();

ehsRouter.use(ehsUploadRouter);
ehsRouter.use(ehsResolverRouter);
ehsRouter.use(ehsComplianceRouter);
