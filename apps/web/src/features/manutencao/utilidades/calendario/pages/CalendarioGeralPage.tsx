// src/features/calendario/pages/CalendarioGeralPage.tsx
import React, { useState, useEffect, useMemo, FormEvent, ChangeEvent } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../../../../shared/components/Modal';
import styles from './CalendarioGeralPage.module.css';
import PageHeader from '../../../../../shared/components/PageHeader';
import { useTranslation } from 'react-i18next';
import Skeleton from '@mui/material/Skeleton';
import { df } from '../../../../../i18n/format';
import usePermissions from '../../../../../hooks/usePermissions';
import CalendarGrid, { CalendarEvent as GridCalendarEvent } from '../components/CalendarGrid';

import {
    listarAgendamentos,
    criarAgendamento,
    atualizarAgendamento,
    excluirAgendamento,
    iniciarAgendamento
} from '../../../../../services/apiClient';
import { getMaquinas } from '../../../../../services/apiClient';
import { subscribeSSE } from '../../../../../services/sseClient';

// ---------- Types ----------
interface User {
    role?: string;
    email?: string;
}

export interface CalendarioGeralPageProps {
    user: User;
}

interface Maquina {
    id: string;
    nome: string;
}

interface AgendamentoApi {
    id: string;
    maquina_nome?: string;
    maquinaNome?: string;
    descricao?: string;
    date?: string;
    maquina_id?: string;
    data_agendada?: string;
    start?: string;
    end?: string;
    start_ts?: string;
    end_ts?: string;
    status?: string;
    itens_checklist?: unknown[];
    itensChecklist?: unknown[];
    concluido_em?: string;
    concluidoEm?: string;
    data_original?: string;
    original_start?: string;
    originalStart?: string;
}

interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    allDay: boolean;
    resource: {
        maquinaNome: string;
        descricao: string;
        status: string;
        itensChecklist: unknown[];
        concluidoEm?: Date;
        originalStart?: Date;
        atrasado?: boolean;
    };
}

interface Template {
    id: string;
    maquinaNome: string;
    date: Date;
    itens: unknown[];
}

interface SlotInfo {
    start: Date;
    end: Date;
}

interface DragArgs {
    event: CalendarEvent;
    start: string | Date;
    end: string | Date;
}

// ---------- Setup ----------

// Helper para garantir que tudo que vai para o JSX é string legível
function toPlainText(v: unknown): string {
    if (v == null) return '';

    let text = '';

    if (typeof v === 'string') {
        text = v;
    } else if (Array.isArray(v)) {
        text = v
            .map((x) => {
                if (x == null) return '';
                if (typeof x === 'string') return x;
                if (typeof x === 'object') {
                    const obj = x as Record<string, unknown>;
                    return obj.texto ?? obj.item ?? obj.nome ?? obj.label ?? obj.key ?? '';
                }
                return String(x);
            })
            .filter(Boolean)
            .join(' • '); // bullet correto
    } else if (typeof v === 'object') {
        const obj = v as Record<string, unknown>;
        text = String(obj.texto ?? obj.item ?? obj.nome ?? obj.label ?? obj.key ?? '');
    } else {
        try {
            text = String(v);
        } catch {
            text = '';
        }
    }

    // Corrigir artefatos de encoding comuns
    return text
        .replace(/â€”/g, '—')
        .replace(/â€¢/g, '•');
}

function getContrastColor(hexColor: string): string {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? '#000000' : '#ffffff';
}

// ---------- Component ----------
export default function CalendarioGeralPage({ user }: CalendarioGeralPageProps) {
    const { t, i18n } = useTranslation();
    const perm = usePermissions(user);

    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [reloadTick, setReloadTick] = useState(0);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [showNew, setShowNew] = useState(false);
    const [slotInfo, setSlotInfo] = useState<SlotInfo | null>(null);

    const [machines, setMachines] = useState<Maquina[]>([]);
    const [selMachine, setSelMachine] = useState('');
    const [descAgendamento, setDescAgendamento] = useState('');
    const [checklistTxt, setChecklistTxt] = useState('');

    // Templates (para importar checklist)
    // Busca historico para sugerir templates (ultimos 10 de maquinas diferentes)
    const [historyTemplates, setHistoryTemplates] = useState<Template[]>([]);
    const [selTemplate, setSelTemplate] = useState('');

    // Modal de confirmação de exclusão
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const intervalDays = 90;



    const fmtDate = useMemo(
        () => df({ dateStyle: 'short' }),
        [i18n.language]
    );

    // SSE para reagir a mudanças de agendamentos
    useEffect(() => {
        const unsubscribe = subscribeSSE((msg: { topic?: string }) => {
            if (msg?.topic === 'agendamentos') {
                setReloadTick((n) => n + 1);
            }
        });
        return () => unsubscribe();
    }, []);

    // Busca máquinas
    useEffect(() => {
        getMaquinas('', 'manutencao').then((list: Maquina[]) => {
            setMachines(list.sort((a, b) => toPlainText(a.nome).localeCompare(toPlainText(b.nome), 'pt')));
        }).catch(console.error);
    }, []);

    // Templates: Buscar ultimos 100 agendamentos (qualquer status) 
    // e filtrar os ultimos 10 de maquinas unicas
    useEffect(() => {
        listarAgendamentos({ limit: '100', order: 'recent' })
            .then((list: AgendamentoApi[]) => {
                const uniqueMachines = new Set<string>();
                const tpls: Template[] = [];

                for (const ag of list) {
                    const mId = ag.maquina_id; // Verificar se a API retorna maquina_id ou se precisamos extrair
                    const mNome = toPlainText(ag.maquina_nome || ag.maquinaNome);
                    // Se não tivermos ID, usamos o nome como chave
                    const key = mId || mNome;

                    if (!key) continue;

                    if (!uniqueMachines.has(key)) {
                        uniqueMachines.add(key);

                        // Validar itens
                        const itens = ag.itens_checklist || ag.itensChecklist || [];
                        // Opcional: só adicionar se tiver itens
                        // if (!Array.isArray(itens) || itens.length === 0) continue;

                        const startStr = ag.start_ts || ag.start || ag.date || '';
                        tpls.push({
                            id: ag.id,
                            maquinaNome: mNome,
                            date: startStr ? new Date(startStr) : new Date(),
                            itens: itens,
                        });
                    }

                    if (tpls.length >= 10) break;
                }
                setHistoryTemplates(tpls);
            })
            .catch(console.error);
    }, [reloadTick]);

    // Busca agendamentos
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const from = new Date();
                from.setDate(from.getDate() - intervalDays);
                const to = new Date();
                to.setDate(to.getDate() + intervalDays);

                const raw: AgendamentoApi[] = await listarAgendamentos({
                    from: from.toISOString(),
                    to: to.toISOString(),
                });

                if (!alive) return;

                const mapped: CalendarEvent[] = raw.map((ag) => {
                    // API retorna start_ts/end_ts - priorizar
                    const startStr = ag.start_ts || ag.start || ag.date || ag.data_agendada || '';
                    const endStr = ag.end_ts || ag.end || startStr;
                    const start = new Date(startStr);
                    const end = new Date(endStr);

                    const originalStr = ag.original_start || ag.data_original || ag.originalStart;
                    const originalStart = originalStr ? new Date(originalStr) : undefined;

                    const concluidoStr = ag.concluido_em || ag.concluidoEm;
                    const concluidoEm = concluidoStr ? new Date(concluidoStr) : undefined;

                    const hoje = new Date();
                    hoje.setHours(0, 0, 0, 0);
                    const atrasado = ag.status === 'agendado' && start < hoje;

                    return {
                        id: ag.id,
                        title: `${toPlainText(ag.maquina_nome || ag.maquinaNome)} — ${toPlainText(ag.descricao)}`,
                        start,
                        end,
                        allDay: true,
                        resource: {
                            maquinaNome: toPlainText(ag.maquina_nome || ag.maquinaNome),
                            descricao: toPlainText(ag.descricao),
                            status: ag.status || 'agendado',
                            itensChecklist: ag.itens_checklist || ag.itensChecklist || [],
                            concluidoEm,
                            originalStart,
                            atrasado,
                        },
                    };
                });

                setEvents(mapped);
            } catch (e) {
                console.error(e);
                toast.error(t('calendarioGeral.toasts.loadError'));
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [reloadTick, t]);

    const handleSelectSlot = (info: SlotInfo) => {
        if (!perm.canEdit('calendario')) return;
        setSlotInfo(info);
        setSelMachine('');
        setDescAgendamento('');
        setChecklistTxt('');
        setSelTemplate('');
        setShowNew(true);
    };

    const handleSubmitNew = async (e: FormEvent) => {
        e.preventDefault();
        if (!selMachine) {
            toast.error(t('calendarioGeral.toasts.selectMachine'));
            return;
        }
        const itens = checklistTxt.split('\n').map((l) => l.trim()).filter(Boolean);

        try {
            const startDate = slotInfo?.start || new Date();
            const endDate = slotInfo?.end || slotInfo?.start || new Date();
            await criarAgendamento(
                {
                    maquinaId: selMachine,
                    descricao: descAgendamento,
                    start: startDate.toISOString(),
                    end: endDate.toISOString(),
                    itensChecklist: itens,
                },
                { email: user?.email, role: user?.role }
            );
            toast.success(t('calendarioGeral.toasts.created'));
            setShowNew(false);
            setReloadTick((n) => n + 1);
        } catch (err) {
            console.error(err);
            toast.error(t('calendarioGeral.toasts.createError'));
        }
    };

    const handleIniciarManutencao = async (event: CalendarEvent) => {
        try {
            await iniciarAgendamento(event.id, { email: user?.email, role: user?.role });
            toast.success(t('calendarioGeral.toasts.started'));
            setSelectedEvent(null);
            setReloadTick((n) => n + 1);
        } catch (err) {
            console.error(err);
            toast.error(t('calendarioGeral.toasts.startError'));
        }
    };

    const handleDeleteAgendamento = async () => {
        if (!selectedEvent) return;
        setShowDeleteConfirm(false);

        try {
            await excluirAgendamento(selectedEvent.id, { email: user?.email, role: user?.role });
            toast.success(t('calendarioGeral.toasts.deleted'));
            setSelectedEvent(null);
            setReloadTick((n) => n + 1);
        } catch (err) {
            console.error(err);
            toast.error(t('calendarioGeral.toasts.deleteError'));
        }
    };

    const handleEventDrop = async ({ event, start, end }: DragArgs) => {
        const previousStart = event.start;
        const previousEnd = event.end;
        const nextStart = new Date(start);
        const nextEnd = new Date(end);

        // Optimistic update
        setEvents((prevEvents) =>
            prevEvents.map((ev) =>
                ev.id === event.id ? { ...ev, start: nextStart, end: nextEnd } : ev
            )
        );

        try {
            await atualizarAgendamento(
                event.id,
                { start: nextStart.toISOString(), end: nextEnd.toISOString() },
                { email: user?.email, role: user?.role }
            );
            setReloadTick((n) => n + 1);
        } catch (err) {
            console.error(err);
            toast.error(t('calendarioGeral.toasts.rescheduleFail'));
            setEvents((prevEvents) =>
                prevEvents.map((ev) =>
                    ev.id === event.id
                        ? { ...ev, start: previousStart, end: previousEnd }
                        : ev
                )
            );
        }
    };

    const eventPropGetter = (event: CalendarEvent) => {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const inicio = event.start;
        const s = event.resource.status;
        let bg = '#e2e8f0'; // default cinza claro
        let borderColor = 'transparent';

        if (s === 'iniciado') {
            bg = '#059669'; // verde esmeralda
            borderColor = '#047857';
        } else if (s === 'agendado' && inicio < hoje) {
            bg = '#ef4444'; // vermelho - atrasado
            borderColor = '#dc2626';
        } else if (
            s === 'agendado' &&
            inicio.toDateString() === hoje.toDateString()
        ) {
            bg = '#f59e0b'; // laranja - hoje
            borderColor = '#d97706';
        } else if (s === 'agendado') {
            bg = '#22c55e'; // verde claro - futuro
            borderColor = '#16a34a';
        } else if (s === 'concluido') {
            bg = '#3b82f6'; // azul
            borderColor = '#2563eb';
        }

        return {
            style: {
                backgroundColor: bg,
                color: getContrastColor(bg),
                borderRadius: 6,
                border: `2px solid ${borderColor}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                fontWeight: 500
            }
        };
    };

    return (
        <>
            <PageHeader
                title={t('calendarioGeral.title')}
                subtitle={t('calendarioGeral.subtitle')}
            />

            <div className={styles.calendarContainer}>
                {/* Legenda de cores */}
                <div className={styles.legendContainer}>
                    <div className={styles.legendItem}>
                        <div className={`${styles.legendColorBox} ${styles.legendAgendado}`} />
                        <span>{t('calendarioGeral.legend.scheduled')}</span>
                    </div>
                    <div className={styles.legendItem}>
                        <div className={`${styles.legendColorBox} ${styles.legendHoje}`} />
                        <span>{t('calendarioGeral.legend.today')}</span>
                    </div>
                    <div className={styles.legendItem}>
                        <div className={`${styles.legendColorBox} ${styles.legendAtrasado}`} />
                        <span>{t('calendarioGeral.legend.overdue')}</span>
                    </div>
                    <div className={styles.legendItem}>
                        <div className={`${styles.legendColorBox} ${styles.legendIniciado}`} />
                        <span>{t('calendarioGeral.legend.inProgress')}</span>
                    </div>
                    <div className={styles.legendItem}>
                        <div className={`${styles.legendColorBox} ${styles.legendConcluido}`} />
                        <span>{t('calendarioGeral.legend.completed')}</span>
                    </div>
                </div>

                <div className={styles.calendarWrapper}>
                    {loading ? (
                        <>
                            {/* Skeleton da barra de navegaÃ§Ã£o do calendÃ¡rio */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                <Skeleton variant="rectangular" width={120} height={36} sx={{ borderRadius: 1 }} />
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <Skeleton variant="rectangular" width={80} height={36} sx={{ borderRadius: 1 }} />
                                    <Skeleton variant="rectangular" width={200} height={36} sx={{ borderRadius: 1 }} />
                                    <Skeleton variant="rectangular" width={80} height={36} sx={{ borderRadius: 1 }} />
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <Skeleton variant="rectangular" width={60} height={36} sx={{ borderRadius: 1 }} />
                                    <Skeleton variant="rectangular" width={60} height={36} sx={{ borderRadius: 1 }} />
                                    <Skeleton variant="rectangular" width={60} height={36} sx={{ borderRadius: 1 }} />
                                </div>
                            </div>
                            {/* Skeleton do grid do calendÃ¡rio */}
                            <Skeleton variant="rectangular" width="100%" height={500} sx={{ borderRadius: 2 }} />
                        </>
                    ) : (
                        <CalendarGrid
                            events={events.map(ev => {
                                const hoje = new Date();
                                hoje.setHours(0, 0, 0, 0);
                                return {
                                    id: ev.id,
                                    title: toPlainText(ev.title),
                                    start: ev.start,
                                    end: ev.end,
                                    status: ev.resource.status as 'agendado' | 'iniciado' | 'concluido',
                                    isOverdue: ev.resource.status === 'agendado' && ev.start < hoje,
                                    isToday: ev.start.toDateString() === hoje.toDateString(),
                                };
                            })}
                            onDayClick={(date: Date) => {
                                if (perm.canEdit('calendario')) {
                                    handleSelectSlot({ start: date, end: date });
                                }
                            }}
                            onEventClick={(event: GridCalendarEvent) => {
                                const found = events.find(e => e.id === event.id);
                                if (found) setSelectedEvent(found);
                            }}
                            onEventDrop={(eventId: string, newDate: Date) => {
                                const found = events.find(e => e.id === eventId);
                                if (found && perm.canEdit('calendario')) {
                                    handleEventDrop({
                                        event: found,
                                        start: newDate,
                                        end: newDate,
                                    });
                                }
                            }}
                            canEdit={perm.canEdit('calendario')}
                        />
                    )}
                </div>
            </div>

            {/* Modal de detalhes do evento */}
            <Modal
                isOpen={!!selectedEvent}
                onClose={() => setSelectedEvent(null)}
                title={toPlainText(selectedEvent?.title)}
            >
                {selectedEvent && (
                    <div className={styles.modalDetails}>
                        <p>
                            <strong>{t('calendarioGeral.details.machine')}</strong>{' '}
                            {toPlainText(selectedEvent.resource.maquinaNome)}
                        </p>
                        <p>
                            <strong>{t('calendarioGeral.details.description')}</strong>{' '}
                            {toPlainText(selectedEvent.resource.descricao)}
                        </p>

                        <p>
                            <strong>{t('calendarioGeral.details.currentDate')}</strong>{' '}
                            {fmtDate.format(selectedEvent.start)}
                        </p>
                        {selectedEvent.resource.originalStart && (
                            <p>
                                <strong>{t('calendarioGeral.details.originalDate')}</strong>{' '}
                                {fmtDate.format(selectedEvent.resource.originalStart)}
                            </p>
                        )}

                        <p>
                            <strong>{t('calendarioGeral.details.status')}</strong>{' '}
                            {toPlainText(selectedEvent.resource.status)}
                        </p>
                        {selectedEvent.resource.concluidoEm && (
                            <p>
                                <strong>{t('calendarioGeral.details.finishedAt')}</strong>{' '}
                                {fmtDate.format(selectedEvent.resource.concluidoEm)}
                            </p>
                        )}

                        {Array.isArray(selectedEvent.resource.itensChecklist) &&
                            selectedEvent.resource.itensChecklist.length > 0 && (
                                <>
                                    <h4>{t('calendarioGeral.details.checklistTitle')}</h4>
                                    <ul>
                                        {selectedEvent.resource.itensChecklist.map((item, i) => (
                                            <li key={i}>{toPlainText(item)}</li>
                                        ))}
                                    </ul>
                                </>
                            )}

                        {selectedEvent.resource.status !== 'iniciado' &&
                            selectedEvent.resource.status !== 'concluido' &&
                            perm.canEdit('calendario') && (
                                <button
                                    className={styles.modalButton}
                                    onClick={() => handleIniciarManutencao(selectedEvent)}
                                >
                                    {t('calendarioGeral.actions.startNow')}
                                </button>
                            )}

                        {perm.canEdit('calendario') && (
                            <button
                                className={`${styles.modalButton} ${styles.dangerButton}`}
                                onClick={() => setShowDeleteConfirm(true)}
                            >
                                {t('calendarioGeral.actions.delete')}
                            </button>
                        )}
                    </div>
                )}
            </Modal>

            {/* Modal de novo agendamento */}
            <Modal
                isOpen={showNew}
                onClose={() => setShowNew(false)}
                title={t('calendarioGeral.new.title')}
            >
                <form onSubmit={handleSubmitNew}>
                    <div className={styles.formGroup}>
                        <label>{t('calendarioGeral.new.machine')}</label>
                        <select
                            value={selMachine}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelMachine(e.target.value)}
                            className={styles.select}
                            required
                        >
                            <option value="" disabled>
                                {t('calendarioGeral.new.selectPlaceholder')}
                            </option>
                            {machines.map(m => (
                                <option key={m.id} value={m.id}>
                                    {toPlainText(m.nome)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className={styles.formGroup}>
                        <label>{t('calendarioGeral.new.description')}</label>
                        <input
                            value={descAgendamento}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setDescAgendamento(e.target.value)}
                            className={styles.input}
                            required
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label>{t('calendarioGeral.new.importTemplate')}</label>
                        <select
                            value={selTemplate}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                                const id = e.target.value;
                                setSelTemplate(id);
                                const tpl = historyTemplates.find(t => t.id === id);
                                const linhas = (tpl ? (tpl.itens || []) : [])
                                    .map(toPlainText)
                                    .filter(Boolean);
                                setChecklistTxt(linhas.join('\n'));
                            }}
                            className={styles.select}
                        >
                            <option value="">{t('calendarioGeral.new.none')}</option>
                            {historyTemplates.map(tpl => (
                                <option key={tpl.id} value={tpl.id}>
                                    {`${tpl.maquinaNome} — ${fmtDate.format(tpl.date)}`}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className={styles.formGroup}>
                        <label>{t('calendarioGeral.new.itemsLabel')}</label>
                        <textarea
                            value={checklistTxt}
                            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setChecklistTxt(e.target.value)}
                            className={styles.textarea}
                            rows={5}
                            required
                        />
                    </div>
                    <button type="submit" className={styles.button}>
                        {t('calendarioGeral.new.save')}
                    </button>
                </form>
            </Modal>

            {/* Modal de confirmaÃ§Ã£o de exclusÃ£o */}
            <Modal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                title={t('calendarioGeral.confirm.title')}
            >
                <div className={styles.confirmModal}>
                    <p className={styles.confirmText}>
                        {t('calendarioGeral.confirm.message')}
                    </p>
                    <p className={styles.confirmEventName}>
                        {toPlainText(selectedEvent?.title)}
                    </p>
                    <div className={styles.confirmButtons}>
                        <button
                            className={styles.cancelButton}
                            onClick={() => setShowDeleteConfirm(false)}
                        >
                            {t('calendarioGeral.confirm.cancel')}
                        </button>
                        <button
                            className={`${styles.modalButton} ${styles.dangerButton}`}
                            onClick={handleDeleteAgendamento}
                        >
                            {t('calendarioGeral.confirm.confirm')}
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
}
