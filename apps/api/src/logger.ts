// apps/api/src/logger.ts
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino(
  {
    // 'debug' só se explicitamente pedido — em dev o padrão é 'info'
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service: 'spiraview-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Redact sensitive fields from logs
    redact: {
      paths: ['req.headers.authorization', 'body.senha', 'body.senhaAtual', 'body.novaSenha', 'body.senha_hash'],
      censor: '[REDACTED]',
    },
  },
  isDev
    ? pino.transport({ target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } })
    : undefined,
);
