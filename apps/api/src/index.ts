import { app } from './app';
import { initScheduler } from './services/scheduler';

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';

// Iniciar agendador
initScheduler();

app.listen(PORT, HOST, () => {
  console.log(`API rodando em http://${HOST}:${PORT}`);
});
