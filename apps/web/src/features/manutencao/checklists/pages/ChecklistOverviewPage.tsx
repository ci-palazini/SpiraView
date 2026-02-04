// src/features/checklists/pages/ChecklistOverviewPage.tsx
import React, { useEffect, useMemo, useState, ChangeEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    FiCheckCircle,
    FiAlertTriangle,
    FiInfo,
    FiRefreshCw,
} from 'react-icons/fi';

import { exportEngajamentoTPMExcel } from '../../../../utils/exportEngajamentoTPMExcel';

import { listarMaquinas, getMaquina, getChecklistOverview, getChecklistOverviewRange } from '../../../../services/apiClient';
import { df } from '../../../../i18n/format';
import PageHeader from '../../../../shared/components/PageHeader';
import ExportButtons from '../../../../shared/components/ExportButtons';
import styles from './ChecklistOverviewPage.module.css';
import Skeleton from '@mui/material/Skeleton';

// ---------- Types ----------
interface User {
    role?: string;
    email?: string;
}

export interface ChecklistOverviewPageProps {
    user: User;
}

interface HistoricoDia {
    dia: string;
    turno1_ok?: boolean;
    turno2_ok?: boolean;
    turno1_operadores?: string;
    turno2_operadores?: string;
}

interface Submissao {
    criado_em?: string;
}

interface MaquinaDetalhe {
    id: string;
    nome?: string;
    historicoChecklist?: HistoricoDia[];
    historicoDiario?: HistoricoDia[];
    checklistHistorico?: Submissao[];
    checklist_diario?: string[];
    checklistDiario?: string[];
}

interface ItemMaquina {
    id: string;
    nome: string;
    rowDia: HistoricoDia | null;
    turno1Ok: boolean;
    turno2Ok: boolean;
    turno1Nomes: string[];
    turno2Nomes: string[];
    ultimaSub: Submissao | null;
    hasChecklist: boolean;
}

// ---------- Component ----------
const ChecklistOverviewPage = ({ user }: ChecklistOverviewPageProps) => {
    const { t, i18n } = useTranslation();

    const [dateFilter, setDateFilter] = useState(
        () => new Date().toISOString().slice(0, 10)
    );
    const [items, setItems] = useState<ItemMaquina[]>([]);
    const [onlyPending, setOnlyPending] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [exporting, setExporting] = useState(false);

    const fmtDateTime = useMemo(
        () => df({ dateStyle: 'short', timeStyle: 'short' }),
        [i18n.language]
    );

    useEffect(() => {
        let alive = true;

        (async () => {
            setLoading(true);
            setError('');
            try {
                // Fetch OTIMIZADO: pega tudo de uma vez do backend
                // usando o novo endpoint /checklists/overview
                const overviewItems = await getChecklistOverview(dateFilter);

                if (!alive) return;

                // Mapeia para o formato interno do componente
                const mappedItems: ItemMaquina[] = overviewItems.map(item => ({
                    id: item.id,
                    nome: item.nome,
                    rowDia: null, // nÃ£o usado mais diretamente na renderizaÃ§Ã£o simplificada, ou podemos adaptar se precisar
                    turno1Ok: item.turno1Ok,
                    turno2Ok: item.turno2Ok,
                    turno1Nomes: item.turno1Nomes,
                    turno2Nomes: item.turno2Nomes,
                    ultimaSub: item.lastSubmissionAt ? { criado_em: item.lastSubmissionAt } : null,
                    hasChecklist: item.hasChecklist
                }));

                setItems(
                    mappedItems.sort((a, b) =>
                        String(a.nome || '').localeCompare(
                            String(b.nome || ''),
                            'pt-BR'
                        )
                    )
                );
            } catch (e) {
                console.error(e);
                if (alive) {
                    setError(
                        t(
                            'checklistOverview.errorLoad',
                            'Erro ao carregar dados. Tente novamente.'
                        )
                    );
                }
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [dateFilter, t]);

    const visibleItems = useMemo(
        () =>
            onlyPending
                ? items.filter((it) => !(it.turno1Ok && it.turno2Ok))
                : items,
        [items, onlyPending]
    );

    const totals = useMemo(() => {
        const withChecklist = items.filter((i) => i.hasChecklist);
        const noChecklist = items.filter((i) => !i.hasChecklist).length;
        const total = withChecklist.length;
        const t1ok = withChecklist.filter((i) => i.turno1Ok).length;
        const t2ok = withChecklist.filter((i) => i.turno2Ok).length;
        return { total, t1ok, t2ok, noChecklist };
    }, [items]);

    const todayIso = new Date().toISOString().slice(0, 10);
    const isToday = dateFilter === todayIso;

    const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => setDateFilter(e.target.value);

    // ---------- Helpers e Handler de ExportaÃ§Ã£o Excel ----------
    const toIsoLocal = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const weekDayNamePt = (d: Date) => {
        const n = d.getDay();
        if (n === 6) return t('checklistOverview.weekend.saturday', 'Sábado');
        if (n === 0) return t('checklistOverview.weekend.sunday', 'Domingo');
        return '';
    };

    const handleExportExcel = async () => {
        try {
            setExporting(true);

            const end = new Date(`${dateFilter}T00:00:00`);
            const start = new Date(end);
            start.setDate(1);

            const startIso = toIsoLocal(start);
            const endIso = toIsoLocal(end);

            // Fetch otimizado do intervalo (substitui N+1)
            const rangeItems = await getChecklistOverviewRange(startIso, endIso);

            // Separar mÃ¡quinas com e sem checklist
            const comChecklist = rangeItems.filter((m) => m.hasChecklist);
            const semChecklist = rangeItems.filter((m) => !m.hasChecklist);
            const maquinasSemChecklist = semChecklist.map((m) => m.nome);
            const total = comChecklist.length;

            const linhas: Array<{
                dateIso: string;
                enviadoT1: string;
                enviadoT2: string;
                semEnvioT1: string;
                semEnvioT2: string;
                isWeekend?: boolean;
            }> = [];

            const dtLoop = new Date(start);
            while (dtLoop <= end) {
                const iso = toIsoLocal(dtLoop);
                const weekendLabel = weekDayNamePt(dtLoop);

                if (weekendLabel) {
                    linhas.push({
                        dateIso: iso,
                        enviadoT1: weekendLabel,
                        enviadoT2: weekendLabel,
                        semEnvioT1: weekendLabel,
                        semEnvioT2: weekendLabel,
                        isWeekend: true,
                    });
                    dtLoop.setDate(dtLoop.getDate() + 1);
                    continue;
                }

                let ok1 = 0;
                let ok2 = 0;
                const pend1: string[] = [];
                const pend2: string[] = [];

                // Contabilizar apenas mÃ¡quinas COM checklist
                for (const maq of comChecklist) {
                    const rowDia = maq.days ? maq.days.find(d => d.date === iso) : null;

                    const t1 = rowDia ? !!rowDia.t1Ok : false;
                    const t2 = rowDia ? !!rowDia.t2Ok : false;

                    if (t1) ok1++;
                    else pend1.push(maq.nome);

                    if (t2) ok2++;
                    else pend2.push(maq.nome);
                }

                // Se quiser o "-" do 2Âº turno no "hoje", simples: se Ã© hoje e ainda nÃ£o Ã© hora do 2Âº turno, mostra "-"
                const now = new Date();
                const TURN2_START_HOUR = 14; // ajuste conforme sua operaÃ§Ã£o
                const turn2NotExpectedYet = iso === todayIso && now.getHours() < TURN2_START_HOUR;

                const sem1 =
                    pend1.length === 0 ? '-' : pend1.length === total ? 'Todas' : pend1.join(', ');
                const sem2 =
                    turn2NotExpectedYet
                        ? '-'
                        : pend2.length === 0 ? '-' : pend2.length === total ? 'Todas' : pend2.join(', ');

                linhas.push({
                    dateIso: iso,
                    enviadoT1: `${ok1}/${total}`,
                    enviadoT2: turn2NotExpectedYet ? '-' : `${ok2}/${total}`,
                    semEnvioT1: sem1,
                    semEnvioT2: sem2,
                });

                dtLoop.setDate(dtLoop.getDate() + 1);
            }

            // Aba opcional de detalhes do dia (usa o que jÃ¡ renderiza)
            const detalhesDoDia = items.map((m) => ({
                maquina: m.nome,
                turno1: (m.turno1Ok ? 'Enviado' : 'Pendente') as 'Enviado' | 'Pendente',
                operadores1: m.turno1Nomes.join(', '),
                turno2: (m.turno2Ok ? 'Enviado' : 'Pendente') as 'Enviado' | 'Pendente',
                operadores2: m.turno2Nomes.join(', '),
                ultimoChecklist: m.ultimaSub?.criado_em
                    ? fmtDateTime.format(new Date(m.ultimaSub.criado_em))
                    : '-',
            }));

            await exportEngajamentoTPMExcel({
                linhas,
                detalhesDoDia,
                maquinasSemChecklist,
                fileName: `Engajamento_TPM_${dateFilter}`,
            });
        } catch (e) {
            console.error(e);
            setError(t('checklistOverview.exportError', 'Erro ao exportar Excel.'));
        } finally {
            setExporting(false);
        }
    };

    const renderStatusBadge = (ok: boolean, nomes: string[], hasChecklist: boolean): ReactNode => {
        // Se a mÃ¡quina nÃ£o tem checklist configurado
        if (!hasChecklist) {
            return (
                <span className={`${styles.statusBadge} ${styles.statusNoChecklist}`}>
                    <FiInfo />
                    <span>{t('checklistOverview.noChecklist', 'Sem checklist')}</span>
                </span>
            );
        }

        return (
            <span
                className={`${styles.statusBadge} ${ok ? styles.statusOk : styles.statusPending}`}
            >
                {ok ? (
                    <>
                        <FiCheckCircle />
                        <span>{t('checklistOverview.sent', 'Enviado')}</span>
                    </>
                ) : (
                    <>
                        <FiAlertTriangle />
                        <span>{t('checklistOverview.missing', 'Pendente')}</span>
                    </>
                )}
                {ok && nomes?.length > 0 && (
                    <span className={styles.statusNames}>{nomes.join(', ')}</span>
                )}
            </span>
        );
    };

    return (
        <>
            <PageHeader
                title={t('checklistOverview.title', 'Checklists diários por máquina')}
                subtitle={t('checklistOverview.subtitle', 'Veja rapidamente se os checklists do 1º e 2º turno foram enviados.')}
            />

            {/* Card branco principal */}
            <div className={styles.listContainer}>
                {/* Filtros */}
                <div className={styles.filters}>
                    <div className={styles.filterBlock}>
                        <span className={styles.filterLabel}>
                            {t('checklistOverview.date', 'Dia')}
                        </span>
                        <input
                            type="date"
                            value={dateFilter}
                            onChange={handleDateChange}
                            className={styles.dateInput}
                        />
                    </div>

                    <label className={styles.onlyPendingWrapper}>
                        <input
                            type="checkbox"
                            checked={onlyPending}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setOnlyPending(e.target.checked)}
                        />
                        <span className={styles.checkboxText}>
                            {t(
                                'checklistOverview.onlyPending',
                                'Apenas pendentes'
                            )}
                        </span>
                    </label>

                    <button
                        type="button"
                        onClick={() => setDateFilter(todayIso)}
                        className={styles.todayButton}
                        disabled={isToday}
                    >
                        {t('checklistOverview.today', 'Hoje')}
                    </button>

                    <ExportButtons
                        onExportExcel={handleExportExcel}
                        showPdf={false}
                    />
                </div>

                {/* Cards de resumo */}
                <div className={styles.summaryRow}>
                    {loading ? (
                        <>
                            {[1, 2, 3].map((i) => (
                                <div key={i} className={styles.summaryCard}>
                                    <Skeleton variant="text" width={100} height={18} />
                                    <Skeleton variant="text" width={40} height={32} />
                                </div>
                            ))}
                        </>
                    ) : (
                        <>
                            <div className={styles.summaryCard}>
                                <span className={styles.summaryLabel}>
                                    {t(
                                        'checklistOverview.machinesWithChecklist',
                                        'Máquinas com checklist'
                                    )}
                                </span>
                                <strong className={styles.summaryValue}>{totals.total}</strong>
                            </div>
                            <div className={styles.summaryCard}>
                                <span className={styles.summaryLabel}>
                                    {t('checklistOverview.turn1', '1º turno')}
                                </span>
                                <strong className={styles.summaryValue}>
                                    {totals.t1ok}/{totals.total}
                                </strong>
                            </div>
                            <div className={styles.summaryCard}>
                                <span className={styles.summaryLabel}>
                                    {t('checklistOverview.turn2', '2º turno')}
                                </span>
                                <strong className={styles.summaryValue}>
                                    {totals.t2ok}/{totals.total}
                                </strong>
                            </div>
                            {totals.noChecklist > 0 && (
                                <div className={`${styles.summaryCard} ${styles.summaryCardMuted}`}>
                                    <span className={styles.summaryLabel}>
                                        {t('checklistOverview.noChecklistCount', 'Sem checklist')}
                                    </span>
                                    <strong className={styles.summaryValue}>{totals.noChecklist}</strong>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {error && <div className={styles.errorBox}>{error}</div>}

                {/* Tabela */}
                <div className={styles.tableHeader}>
                    <span className={styles.tableTitle}>
                        {t(
                            'checklistOverview.tableTitle',
                            'Status por máquina'
                        )}
                    </span>
                    {loading && (
                        <span className={styles.loadingInfo}>
                            <FiRefreshCw className={styles.spin} />{' '}
                            {t('common.loading', 'Carregando...')}
                        </span>
                    )}
                </div>

                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>
                                    {t('checklistOverview.machine', 'Máquina')}
                                </th>
                                <th>
                                    {t('checklistOverview.turn1Short', '1º turno')}
                                </th>
                                <th>
                                    {t('checklistOverview.turn2Short', '2º turno')}
                                </th>
                                <th>
                                    {t('checklistOverview.lastSent', 'Último checklist')}
                                </th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <>
                                    {[1, 2, 3, 4, 5, 6].map((i) => (
                                        <tr key={i}>
                                            <td><Skeleton variant="text" width="80%" height={20} /></td>
                                            <td><Skeleton variant="rectangular" width={90} height={28} sx={{ borderRadius: 1 }} /></td>
                                            <td><Skeleton variant="rectangular" width={90} height={28} sx={{ borderRadius: 1 }} /></td>
                                            <td><Skeleton variant="text" width={120} height={20} /></td>
                                            <td><Skeleton variant="rectangular" width={100} height={28} sx={{ borderRadius: 1 }} /></td>
                                        </tr>
                                    ))}
                                </>
                            ) : visibleItems.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className={styles.emptyCell}>
                                        {t(
                                            'checklistOverview.empty',
                                            'Nenhuma máquina encontrada para o filtro atual.'
                                        )}
                                    </td>
                                </tr>
                            ) : null}

                            {!loading && visibleItems.map((m) => {
                                const lastSent = m.ultimaSub?.criado_em
                                    ? fmtDateTime.format(new Date(m.ultimaSub.criado_em))
                                    : '-';

                                return (
                                    <tr key={m.id}>
                                        <td>
                                            <Link
                                                to={`/maquinas/${m.id}?tab=checklist`}
                                                className={styles.machineLink}
                                            >
                                                {m.nome}
                                            </Link>
                                        </td>
                                        <td>{renderStatusBadge(m.turno1Ok, m.turno1Nomes, m.hasChecklist)}</td>
                                        <td>{renderStatusBadge(m.turno2Ok, m.turno2Nomes, m.hasChecklist)}</td>
                                        <td>{lastSent}</td>
                                        <td className={styles.actionCell}>
                                            <Link
                                                to={`/maquinas/${m.id}?tab=checklist`}
                                                className={styles.detailsLink}
                                            >
                                                <FiInfo />
                                                <span>
                                                    {t(
                                                        'checklistOverview.details',
                                                        'Ver detalhes'
                                                    )}
                                                </span>
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
};

export default ChecklistOverviewPage;
