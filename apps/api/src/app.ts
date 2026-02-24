// apps/api/src/app.ts
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './logger';

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
import { melhoriaContinuaRouter } from './routes/melhoria-continua';
import { logisticaRouter } from './routes/logistica';
import { pdcaRouter } from './routes/pdca';

export const app: Express = express(); // 👈 evita o TS2742

// Security headers (Helmet)
app.use(helmet());

// HTTP request logging (Pino)
app.use(pinoHttp({
  logger,
  // Skip health check noise in logs
  autoLogging: { ignore: (req) => req.url === '/health' },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Serializa apenas os campos relevantes — evita dump de todos os headers
  serializers: {
    req(req) {
      return {
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
}));

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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
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
app.use('/melhoria-continua', melhoriaContinuaRouter); // Melhoria Contínua

// Global error handler — captura erros não tratados
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err }, '[GLOBAL ERROR]');
  res.status(500).json({ error: 'Erro interno do servidor.' });
});
