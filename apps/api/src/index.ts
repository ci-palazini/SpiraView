import { app } from './app';
import { logger } from './logger';
import { initScheduler } from './services/scheduler';

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';

// Iniciar agendador
initScheduler();

app.listen(PORT, HOST, () => {
  logger.info({ port: PORT, host: HOST }, 'API iniciada');
});
