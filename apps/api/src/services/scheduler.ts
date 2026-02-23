import cron from 'node-cron';
import { checkMissingChecklists } from '../scripts/checkMissingChecklists';
import { logger } from '../logger';

/**
 * Inicializa o agendador de tarefas (Cron Jobs)
 */
export const initScheduler = () => {
    logger.info('[Scheduler] Inicializando agendador de tarefas...');

    // JOB ÚNICO: 05:30 da manhã (Verificar dia anterior completo)
    // O script checkMissingChecklists() por padrão verifica "ontem" (subDays 1).
    // Então rodando as 05:30 do dia X, ele verificará as pendências do dia X-1.
    cron.schedule('30 5 * * *', async () => {
        logger.info('[Scheduler] Executando job 05:30 - Verificando pendencias de ontem...');
        try {
            await checkMissingChecklists(); // usa "ontem" por padrao
        } catch (error) {
            logger.error({ err: error }, '[Scheduler] Erro no job 05:30');
        }
    });

    logger.info('[Scheduler] Job configurado: 05:30 (verifica dia anterior)');
};
