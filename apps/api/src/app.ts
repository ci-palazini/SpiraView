// apps/api/src/app.ts
import express, { type Express } from 'express';
import cors, { type CorsOptions } from 'cors';

import { userFromHeader } from './middlewares/userFromHeader';
import { env } from './config/env';
import { setupSwagger } from './swagger';

// Rotas organizadas por módulo
import { coreRouter } from './routes/core';
import { sharedRouter } from './routes/shared';
import { manutencaoRouter } from './routes/manutencao';
import { producaoRouter } from './routes/producao';
import { planejamentoRouter } from './routes/planejamento';
import { qualidadeRouter } from './routes/qualidade';
import { logisticaRouter } from './routes/logistica';
import { pdcaRouter } from './routes/pdca';

export const app: Express = express(); // 👈 evita o TS2742

setupSwagger(app);

const ALLOW = [...env.cors.allowedOrigins]; // 👈 clona para array mutável

const corsOptions: CorsOptions = {
  origin: ALLOW.length ? (ALLOW as (string | RegExp)[]) : true,
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(userFromHeader);

// Módulos organizados
app.use(coreRouter);          // Auth, usuarios, roles, health, events
app.use(sharedRouter);        // Recursos compartilhados (maquinas)
app.use(manutencaoRouter);    // Departamento Manutenção
app.use(producaoRouter);      // Departamento Produção
app.use(planejamentoRouter);  // Departamento Planejamento
app.use(qualidadeRouter);     // Departamento Qualidade
app.use(logisticaRouter);     // Departamento Logística
app.use(pdcaRouter);          // Módulo PDCA

