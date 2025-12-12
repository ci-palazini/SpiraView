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

import { listarMaquinas, getMaquina } from '../../../services/apiClient';
import { df } from '../../../i18n/format';
import PageHeader from '../../../shared/components/PageHeader';
import styles from './ChecklistOverviewPage.module.css';

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
                const maquinas = await listarMaquinas();
                const detalhes = await Promise.all(
                    (maquinas || []).map(async (m: { id: string; nome?: string }) => {
                        const det: MaquinaDetalhe = await getMaquina(m.id);

                        const historicoDias = Array.isArray(
                            det.historicoChecklist ?? det.historicoDiario
                        )
                            ? det.historicoChecklist ?? det.historicoDiario ?? []
                            : [];

                        const submissoes = Array.isArray(det.checklistHistorico)
                            ? det.checklistHistorico
                            : [];

                        const rowDia =
                            historicoDias.find((r) => r.dia === dateFilter) || null;

                        const turno1Ok = rowDia ? !!rowDia.turno1_ok : false;
                        const turno2Ok = rowDia ? !!rowDia.turno2_ok : false;

                        const turno1Nomes = String(rowDia?.turno1_operadores || '')
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean);

                        const turno2Nomes = String(rowDia?.turno2_operadores || '')
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean);

                        let ultimaSub: Submissao | null = null;
                        for (const s of submissoes) {
                            if (!s.criado_em) continue;
                            if (
                                !ultimaSub ||
                                String(s.criado_em) > String(ultimaSub.criado_em)
                            ) {
                                ultimaSub = s;
                            }
                        }

                        return {
                            id: m.id,
                            nome: m.nome || '',
                            rowDia,
                            turno1Ok,
                            turno2Ok,
                            turno1Nomes,
                            turno2Nomes,
                            ultimaSub,
                        };
                    })
                );

                if (!alive) return;

                setItems(
                    detalhes.sort((a, b) =>
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
        const total = items.length;
        const t1ok = items.filter((i) => i.turno1Ok).length;
        const t2ok = items.filter((i) => i.turno2Ok).length;
        return { total, t1ok, t2ok };
    }, [items]);

    const todayIso = new Date().toISOString().slice(0, 10);
    const isToday = dateFilter === todayIso;

    const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => setDateFilter(e.target.value);

    const renderStatusBadge = (ok: boolean, nomes: string[]): ReactNode => (
        <span
            className={`${styles.statusBadge} ${ok ? styles.statusOk : styles.statusPending
                }`}
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
                </div>

                {/* Cards de resumo */}
                <div className={styles.summaryRow}>
                    <div className={styles.summaryCard}>
                        <span className={styles.summaryLabel}>
                            {t(
                                'checklistOverview.totalMachines',
                                'Total de máquinas'
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
                            {!loading && visibleItems.length === 0 && (
                                <tr>
                                    <td colSpan={5} className={styles.emptyCell}>
                                        {t(
                                            'checklistOverview.empty',
                                            'Nenhuma máquina encontrada para o filtro atual.'
                                        )}
                                    </td>
                                </tr>
                            )}

                            {visibleItems.map((m) => {
                                const lastSent = m.ultimaSub?.criado_em
                                    ? fmtDateTime.format(new Date(m.ultimaSub.criado_em))
                                    : '—';

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
                                        <td>{renderStatusBadge(m.turno1Ok, m.turno1Nomes)}</td>
                                        <td>{renderStatusBadge(m.turno2Ok, m.turno2Nomes)}</td>
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
