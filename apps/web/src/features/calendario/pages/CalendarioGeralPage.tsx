// src/features/calendario/pages/CalendarioGeralPage.tsx
import React, { useState, useEffect, useMemo, FormEvent, ChangeEvent } from 'react';
import { Calendar, momentLocalizer, View } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import moment from 'moment';
import 'moment/locale/pt-br';
import 'moment/locale/es';
import toast from 'react-hot-toast';
import Modal from '../../../shared/components/Modal';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import styles from './CalendarioGeralPage.module.css';
import PageHeader from '../../../shared/components/PageHeader';
import { useTranslation } from 'react-i18next';
import Skeleton from '@mui/material/Skeleton';
import { df } from '../../../i18n/format';
import usePermissions from '../../../hooks/usePermissions';

import {
    listarAgendamentos,
    criarAgendamento,
    atualizarAgendamento,
    excluirAgendamento,
    iniciarAgendamento
} from '../../../services/apiClient';
import { getMaquinas } from '../../../services/apiClient';
import { subscribeSSE } from '../../../services/sseClient';

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
    data_agendada?: string;
    start?: string;
    end?: string;
    status?: string;
    itens_checklist?: unknown[];
    itensChecklist?: unknown[];
    concluido_em?: string;
    concluidoEm?: string;
    data_original?: string;
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
const localizer = momentLocalizer(moment);
const DnDCalendar = withDragAndDrop<CalendarEvent>(Calendar);

// Helper para garantir que tudo que vai para o JSX é string legível
function toPlainText(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'string') return v;

    if (Array.isArray(v)) {
        return v
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
            .join(' • ');
    }

    if (typeof v === 'object') {
        const obj = v as Record<string, unknown>;
        return String(obj.texto ?? obj.item ?? obj.nome ?? obj.label ?? obj.key ?? '');
    }

    try {
        return String(v);
    } catch {
        return '';
    }
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
    const [view, setView] = useState<View>('month');
    const [reloadTick, setReloadTick] = useState(0);
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [showNew, setShowNew] = useState(false);
    const [slotInfo, setSlotInfo] = useState<SlotInfo | null>(null);

    const [machines, setMachines] = useState<Maquina[]>([]);
    const [selMachine, setSelMachine] = useState('');
    const [descAgendamento, setDescAgendamento] = useState('');
    const [checklistTxt, setChecklistTxt] = useState('');

    // Templates (para importar checklist)
    const [templates, setTemplates] = useState<Template[]>([]);
    const [selTemplate, setSelTemplate] = useState('');

    const intervalDays = 90;

    // aplica locale do moment conforme idioma atual
    useEffect(() => {
        moment.locale(i18n.language?.startsWith('es') ? 'es' : 'pt-br');
    }, [i18n.language]);

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
                    const startStr = ag.date || ag.data_agendada || ag.start || '';
                    const endStr = ag.end || startStr;
                    const start = new Date(startStr);
                    const end = new Date(endStr);

                    const originalStr = ag.data_original || ag.originalStart;
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

                // Templates = últimos 5 agendamentos concluídos
                const concluidos = mapped
                    .filter((e) => e.resource.status === 'concluido')
                    .sort((a, b) => b.start.getTime() - a.start.getTime())
                    .slice(0, 5);
                setTemplates(
                    concluidos.map((e) => ({
                        id: e.id,
                        maquinaNome: e.resource.maquinaNome,
                        date: e.start,
                        itens: e.resource.itensChecklist,
                    }))
                );
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
            await criarAgendamento(
                {
                    maquinaId: selMachine,
                    descricao: descAgendamento,
                    date: (slotInfo?.start || new Date()).toISOString(),
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
        if (!window.confirm(t('calendarioGeral.confirm.delete'))) return;

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
        let bg = '#FFFFFF';
        if (s === 'iniciado') {
            bg = '#006400';
        } else if (s === 'agendado' && inicio < hoje) {
            bg = '#8B0000';
        } else if (
            s === 'agendado' &&
            inicio.toDateString() === hoje.toDateString()
        ) {
            bg = '#FFA500';
        } else if (s === 'agendado') {
            bg = '#90EE90';
        } else if (event.resource.atrasado) {
            bg = '#8B008B';
        } else if (s === 'concluido') {
            bg = '#00008B';
        }
        return {
            style: {
                backgroundColor: bg,
                color: getContrastColor(bg),
                borderRadius: 4,
                border: '1px solid #aaa'
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
                <div className={styles.calendarWrapper}>
                    {loading ? (
                        <>
                            {/* Skeleton da barra de navegação do calendário */}
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
                            {/* Skeleton do grid do calendário */}
                            <Skeleton variant="rectangular" width="100%" height={500} sx={{ borderRadius: 2 }} />
                        </>
                    ) : (
                        <DnDCalendar
                            localizer={localizer}
                            events={events}
                            startAccessor="start"
                            endAccessor="end"
                            style={{ height: '100%' }}
                            date={currentDate}
                            view={view}
                            onNavigate={(date) => setCurrentDate(date)}
                            onView={(newView) => setView(newView)}
                            onSelectEvent={(event) => setSelectedEvent(event)}
                            onSelectSlot={perm.canEdit('calendario') ? handleSelectSlot : undefined}
                            selectable={perm.canEdit('calendario')}
                            onEventDrop={perm.canEdit('calendario') ? handleEventDrop : undefined}
                            eventPropGetter={eventPropGetter}
                            components={{
                                event: ({ event }: { event: CalendarEvent }) => (
                                    <div className={styles.eventoNoCalendario}>
                                        {toPlainText(event.title)}
                                    </div>
                                ),
                                agenda: { time: () => null }
                            }}
                            className={styles.calendarRoot}
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
                                onClick={handleDeleteAgendamento}
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
                                const tpl = templates.find(t => t.id === id);
                                const linhas = (tpl ? (tpl.itens || []) : [])
                                    .map(toPlainText)
                                    .filter(Boolean);
                                setChecklistTxt(linhas.join('\n'));
                            }}
                            className={styles.select}
                        >
                            <option value="">{t('calendarioGeral.new.none')}</option>
                            {templates.map(tpl => (
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
        </>
    );
}
