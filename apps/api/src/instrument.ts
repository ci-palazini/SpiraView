/**
 * Sentry instrumentation — importar ANTES de qualquer outro módulo no index.ts
 * para garantir que as integrações automáticas (express, pg, http) sejam registradas.
 *
 * Configura via variável de ambiente SENTRY_DSN (opcional).
 * Se não estiver definida, o módulo é um no-op silencioso.
 */
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // Captura 100% das transações em dev, 10% em prod para não estourar quota
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Não enviar dados sensíveis de headers de autorização
    beforeSend(event) {
      if (event.request?.headers?.authorization) {
        delete event.request.headers.authorization;
      }
      return event;
    },
  });
} else if (process.env.NODE_ENV === 'production') {
  // Só avisa em produção — em dev sem DSN é normal não ter Sentry
  console.warn('[Sentry] SENTRY_DSN não definido — monitoramento desativado.');
}
