// apps/api/src/routes/safety/index.ts
import { Router } from 'express';
import { uploadRouter } from './upload';

export const safetyRouter: Router = Router();

safetyRouter.use(uploadRouter);
