import { pool } from '../../db';
import { logger } from '../../logger';
import type { ChecklistItem } from '@spiraview/shared';

function formatHora(date: Date): string {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuracao(criado_em: Date): string {
    const diffMs = Date.now() - criado_em.getTime();
    const totalMin = Math.round(diffMs / 60_000);
    if (totalMin < 60) return `${totalMin} min`;
    const horas = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    return min > 0 ? `${horas}h ${min}min` : `${horas}h`;
}

function buildChecklistSummary(checklist: ChecklistItem[]): string {
    const total = checklist.length;
    const naoConformes = checklist.filter((item) => item.resposta === 'nao');
    const conformes = total - naoConformes.length;

    const resumo = total > 0
        ? `<strong>Checklist:</strong> ${conformes} de ${total} ${total === 1 ? 'item conforme' : 'itens conformes'}`
        : null;

    if (naoConformes.length === 0) {
        return `${resumo ? resumo + '<br>' : ''}<b>Todos os itens conformes ✅</b>`;
    }

    const linhas = naoConformes.map((item) => {
        const comentario = 'comentario' in item && item.comentario ? ` — <i>Obs: ${item.comentario}</i>` : '';
        return `<li>${item.item}${comentario}</li>`;
    });

    return `${resumo ? resumo + '<br>' : ''}<b>Itens não conformes:</b><ul>${linhas.join('')}</ul>`;
}

async function send(_message: string): Promise<void> {
    // Notificações de Teams desativadas — canal removido
    logger.debug('[PreventiveMaintenance] Notificação Teams desativada.');
}

export const PreventiveMaintenanceNotification = {
    /**
     * Dispara quando um chamado preventivo é criado (agendamento iniciado).
     */
    async onAberta(params: { maquinaNome: string; descricao: string; quemAbriu: string; qtdItens: number }): Promise<void> {
        try {
            const itensLabel = params.qtdItens === 1 ? '1 item' : `${params.qtdItens} itens`;
            const message =
                `<strong>🔧 Manutenção Preventiva Aberta</strong><br><br>` +
                `<strong>Máquina:</strong> ${params.maquinaNome}<br>` +
                `<strong>Descrição:</strong> ${params.descricao}<br>` +
                `<strong>Aberta por:</strong> ${params.quemAbriu}<br>` +
                `<strong>Checklist:</strong> ${itensLabel} a verificar`;

            await send(message);
            logger.info('[PreventiveMaintenance] onAberta enviado.');
        } catch (err) {
            logger.error({ err }, '[PreventiveMaintenance] Erro em onAberta');
        }
    },

    /**
     * Dispara quando um manutentor atende o chamado preventivo.
     */
    async onIniciada(params: { chamadoId: string; manutentorNome: string }): Promise<void> {
        try {
            const { rows } = await pool.query(
                `SELECT m.nome AS maquina_nome, c.descricao
                   FROM public.chamados c
                   JOIN public.maquinas m ON m.id = c.maquina_id
                  WHERE c.id = $1 AND LOWER(c.tipo) = 'preventiva'
                  LIMIT 1`,
                [params.chamadoId]
            );

            if (!rows.length) return; // não é preventiva ou não encontrado

            const hora = formatHora(new Date());
            const message =
                `<strong>⚙️ Manutenção Preventiva em Andamento</strong><br><br>` +
                `<strong>Máquina:</strong> ${rows[0].maquina_nome}<br>` +
                `<strong>Descrição:</strong> ${rows[0].descricao}<br>` +
                `<strong>Manutentor:</strong> ${params.manutentorNome} às ${hora}`;

            await send(message);
            logger.info('[PreventiveMaintenance] onIniciada enviado.');
        } catch (err) {
            logger.error({ err }, '[PreventiveMaintenance] Erro em onIniciada');
        }
    },

    /**
     * Dispara quando um chamado preventivo é concluído.
     */
    async onConcluida(params: {
        chamadoId: string;
        maquinaNome: string;
        concluidorNome: string;
        checklist: ChecklistItem[];
    }): Promise<void> {
        try {
            const hora = formatHora(new Date());

            // Busca criado_em para calcular duração
            const { rows } = await pool.query(
                `SELECT criado_em FROM public.chamados WHERE id = $1 LIMIT 1`,
                [params.chamadoId]
            );
            const duracao = rows[0]?.criado_em ? formatDuracao(new Date(rows[0].criado_em)) : null;

            const checklistResumo = buildChecklistSummary(params.checklist);

            const message =
                `<strong>✅ Manutenção Preventiva Concluída</strong><br><br>` +
                `<strong>Máquina:</strong> ${params.maquinaNome}<br>` +
                `<strong>Concluída por:</strong> ${params.concluidorNome} às ${hora}` +
                `${duracao ? `<br><strong>Duração:</strong> ${duracao}` : ''}<br><br>` +
                `${checklistResumo}`;

            await send(message);
            logger.info('[PreventiveMaintenance] onConcluida enviado.');
        } catch (err) {
            logger.error({ err }, '[PreventiveMaintenance] Erro em onConcluida');
        }
    },
};
