// apps/api/src/routes/ehs/index.ts
import { Router } from 'express';
import { ehsUploadRouter } from './upload';

export const ehsRouter: Router = Router();

ehsRouter.use(ehsUploadRouter);
