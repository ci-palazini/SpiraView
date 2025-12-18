// apps/api/src/app.ts
import express, { type Express } from 'express';
import cors, { type CorsOptions } from 'cors';

import { userFromHeader } from './middlewares/userFromHeader';
import { eventsRouter } from './routes/events';
import { healthRouter } from './routes/health';
import { maquinasRouter } from './routes/maquinas';
import { chamadosRouter } from './routes/chamados';
import { agendamentosRouter } from './routes/agendamentos';
import { pecasRouter } from './routes/pecas';
import { causasRouter } from './routes/causas';
import { usuariosRouter } from './routes/usuarios';
import { authRouter } from './routes/auth';
import { operatorAuthRouter } from './routes/operatorAuth';
import { checklistsRouter } from './routes/checklists';
import { analyticsRouter } from './routes/analytics';
import { botRouter } from './routes/bot';
import { producaoRouter } from './routes/producao';
import rolesRouter from './routes/roles';
import { env } from './config/env';

export const app: Express = express(); // 👈 evita o TS2742

const ALLOW = [...env.cors.allowedOrigins]; // 👈 clona para array mutável

const corsOptions: CorsOptions = {
  origin: ALLOW.length ? (ALLOW as (string | RegExp)[]) : true,
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(userFromHeader);

app.use(eventsRouter);
app.use(healthRouter);
app.use(maquinasRouter);
app.use(chamadosRouter);
app.use(agendamentosRouter);
app.use(pecasRouter);
app.use(causasRouter);
app.use(usuariosRouter);
app.use(authRouter);
app.use(operatorAuthRouter);
app.use(checklistsRouter);
app.use(analyticsRouter);
app.use(botRouter);
app.use(producaoRouter);
app.use('/roles', rolesRouter);

