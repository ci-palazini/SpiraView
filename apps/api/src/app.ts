// apps/api/src/app.ts
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';

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

// Security headers (Helmet)
app.use(helmet());

// Swagger docs — apenas em dev/test
if (env.nodeEnv !== 'production') {
  setupSwagger(app);
}

const ALLOW = [...env.cors.allowedOrigins]; // 👈 clona para array mutável

const corsOptions: CorsOptions = {
  // Em produção sem CORS_ORIGINS configurado, bloqueia tudo (origin: false)
  origin: ALLOW.length ? (ALLOW as (string | RegExp)[]) : false,
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));
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

// Global error handler — captura erros não tratados
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[GLOBAL ERROR]', new Date().toISOString(), err.stack || err.message);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});
