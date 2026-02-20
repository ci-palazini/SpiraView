import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { pt, enUS } from 'date-fns/locale';
import {
    FiChevronLeft,
    FiChevronRight,
    FiCalendar,
    FiClock,
    FiUser,
    FiBarChart2,
    FiList,
    FiFilter
} from 'react-icons/fi';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import toast from 'react-hot-toast';

import { http } from '../../../services/apiClient';
import PageHeader from '../../../shared/components/PageHeader';
import usePermissions from '../../../hooks/usePermissions';
import { useUsuario } from '../../../contexts/UserContext';
import styles from './RetrabalhoAnalisePage.module.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// ── Types ─────────────────────────────────────────────────────────────────────

interface CausaItem {
    causa: string;
    totalHoras: number;
    totalRegistros: number;
}

interface AnaliseResponse {
    items: CausaItem[];
    totalHoras: number;
    totalRegistros: number;
    periodo: { inicio: string; fim: string };
}

interface SolicitanteOption {
    id: string;
    nome: string;
}

// ── Color palette for 4M1D causes ─────────────────────────────────────────────

const CAUSA_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
    MAN: { bg: 'rgba(59, 130, 246, 0.75)', border: '#3b82f6', dot: '#3b82f6' },
    METHOD: { bg: 'rgba(16, 185, 129, 0.75)', border: '#10b981', dot: '#10b981' },
    MACHINE: { bg: 'rgba(245, 158, 11, 0.75)', border: '#f59e0b', dot: '#f59e0b' },
    MATERIAL: { bg: 'rgba(139, 92, 246, 0.75)', border: '#8b5cf6', dot: '#8b5cf6' },
    DESIGN: { bg: 'rgba(239, 68, 68, 0.75)', border: '#ef4444', dot: '#ef4444' },
    'N/A': { bg: 'rgba(148, 163, 184, 0.75)', border: '#94a3b8', dot: '#94a3b8' },
};

function getCausaColor(causa: string) {
    return CAUSA_COLORS[causa.toUpperCase()] || CAUSA_COLORS['N/A'];
}

function formatHours(h: number): string {
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return `${hrs}h${mins > 0 ? ` ${mins}min` : ''}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RetrabalhoAnalisePage() {
    const { t, i18n } = useTranslation();
    const user = useUsuario();
    const { canView } = usePermissions(user);
    const dateFnsLocale = i18n.language.startsWith('pt') ? pt : enUS;

    // ── State ──────────────────────────────────────────────────────────────────

    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<AnaliseResponse | null>(null);

    // Month navigation
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [customMode, setCustomMode] = useState(false);
    const [customInicio, setCustomInicio] = useState('');
    const [customFim, setCustomFim] = useState('');

    // Solicitante filter
    const [solicitanteList, setSolicitanteList] = useState<SolicitanteOption[]>([]);
    const [selectedSolicitantes, setSelectedSolicitantes] = useState<string[]>([]);
    const [solicitanteOpen, setSolicitanteOpen] = useState(false);
    const solicitanteRef = useRef<HTMLDivElement>(null);

    // ── Computed dates ─────────────────────────────────────────────────────────

    const dataInicio = useMemo(() => {
        if (customMode && customInicio) return customInicio;
        return format(startOfMonth(currentMonth), 'yyyy-MM-dd');
    }, [customMode, customInicio, currentMonth]);

    const dataFim = useMemo(() => {
        if (customMode && customFim) return customFim;
        return format(endOfMonth(currentMonth), 'yyyy-MM-dd');
    }, [customMode, customFim, currentMonth]);

    const monthLabel = useMemo(() => {
        return format(currentMonth, 'MMMM yyyy', { locale: dateFnsLocale });
    }, [currentMonth, dateFnsLocale]);

    // ── Fetch solicitantes on mount ────────────────────────────────────────────

    useEffect(() => {
        const loadSolicitantes = async () => {
            try {
                const sols = await http.get<SolicitanteOption[]>('/qualidade/solicitantes');
                setSolicitanteList(Array.isArray(sols) ? sols : []);
            } catch (err) {
                console.error('Failed to load solicitantes', err);
            }
        };
        loadSolicitantes();
    }, []);

    // Close solicitante dropdown on outside click
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (solicitanteRef.current && !solicitanteRef.current.contains(e.target as Node)) {
                setSolicitanteOpen(false);
            }
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    // ── Fetch analysis data ────────────────────────────────────────────────────

    const fetchAnalise = useCallback(async () => {
        if (!dataInicio || !dataFim) return;
        setLoading(true);
        try {
            let url = `/qualidade/retrabalho/analise?dataInicio=${dataInicio}&dataFim=${dataFim}`;
            if (selectedSolicitantes.length > 0) {
                selectedSolicitantes.forEach(s => {
                    url += `&solicitante=${encodeURIComponent(s)}`;
                });
            }
            const res = await http.get<AnaliseResponse>(url);
            setData(res);
        } catch (err) {
            console.error('Failed to fetch analysis', err);
            toast.error(t('quality.retrabalho.analise.loadError', 'Erro ao carregar análise.'));
        } finally {
            setLoading(false);
        }
    }, [dataInicio, dataFim, selectedSolicitantes, t]);

    useEffect(() => {
        fetchAnalise();
    }, [fetchAnalise]);

    // ── Chart configuration ────────────────────────────────────────────────────

    const chartData = useMemo(() => {
        if (!data?.items.length) return null;

        const labels = data.items.map(i => i.causa);
        const values = data.items.map(i => i.totalHoras);
        const backgrounds = data.items.map(i => getCausaColor(i.causa).bg);
        const borders = data.items.map(i => getCausaColor(i.causa).border);

        return {
            labels,
            datasets: [{
                label: t('quality.retrabalho.analise.horasLabel', 'Horas de Retrabalho'),
                data: values,
                backgroundColor: backgrounds,
                borderColor: borders,
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false,
            }],
        };
    }, [data, t]);

    const chartOptions = useMemo(() => ({
        indexAxis: 'y' as const,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (ctx: any) => {
                        return ` ${formatHours(ctx.parsed.x)}`;
                    },
                },
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                titleFont: { size: 13, weight: 'bold' as const },
                bodyFont: { size: 12 },
                padding: 12,
                cornerRadius: 10,
            },
        },
        scales: {
            x: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(226, 232, 240, 0.5)',
                },
                ticks: {
                    callback: (val: any) => `${val}h`,
                    font: { size: 12, weight: 'bold' as const },
                    color: '#64748b',
                },
            },
            y: {
                grid: { display: false },
                ticks: {
                    font: { size: 13, weight: 'bold' as const },
                    color: '#1e293b',
                },
            },
        },
    }), []);

    // ── Month nav handlers ─────────────────────────────────────────────────────

    const prevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
    const nextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

    const toggleSolicitante = (nome: string) => {
        setSelectedSolicitantes(prev =>
            prev.includes(nome) ? prev.filter(s => s !== nome) : [...prev, nome]
        );
    };

    // ── Top causa ──────────────────────────────────────────────────────────────

    const topCausa = useMemo(() => {
        if (!data?.items.length) return '—';
        return data.items[0].causa;
    }, [data]);

    // ── Access guard ───────────────────────────────────────────────────────────

    if (!canView('qualidade_retrabalho')) {
        return (
            <div className={styles.container}>
                <div className={styles.emptyState}>
                    <p>{t('common.accessDenied', 'Acesso negado')}</p>
                </div>
            </div>
        );
    }

    // ── Render ──────────────────────────────────────────────────────────────────

    return (
        <>
            <PageHeader
                title={t('quality.retrabalho.analise.title', 'Análise de Retrabalho')}
                subtitle={t('quality.retrabalho.analise.subtitle', 'Horas de retrabalho agrupadas por causa (4M1D)')}
            />

            <div className={styles.container}>
                {/* ── Filter Bar ──────────────────────────────────────────── */}
                <div className={styles.filterBar}>
                    {/* Month Navigation */}
                    {!customMode && (
                        <div className={styles.monthNav}>
                            <button className={styles.navBtn} onClick={prevMonth} title={t('common.previous', 'Anterior')}>
                                <FiChevronLeft />
                            </button>
                            <span className={styles.monthLabel}>{monthLabel}</span>
                            <button className={styles.navBtn} onClick={nextMonth} title={t('common.next', 'Próximo')}>
                                <FiChevronRight />
                            </button>
                        </div>
                    )}

                    <div className={styles.filterSeparator} />

                    {/* Custom date toggle */}
                    <button
                        className={`${styles.toggleBtn} ${customMode ? styles.toggleBtnActive : ''}`}
                        onClick={() => setCustomMode(!customMode)}
                    >
                        <FiCalendar />
                        {t('quality.retrabalho.analise.customRange', 'Período customizado')}
                    </button>

                    {/* Custom date inputs */}
                    {customMode && (
                        <div className={styles.dateInputs}>
                            <span className={styles.dateInputLabel}>{t('common.from', 'De')}</span>
                            <input
                                type="date"
                                className={styles.dateInput}
                                value={customInicio}
                                onChange={e => setCustomInicio(e.target.value)}
                            />
                            <span className={styles.dateInputLabel}>{t('common.to', 'Até')}</span>
                            <input
                                type="date"
                                className={styles.dateInput}
                                value={customFim}
                                onChange={e => setCustomFim(e.target.value)}
                            />
                        </div>
                    )}

                    <div className={styles.filterSeparator} />

                    {/* Solicitante multi-select */}
                    <div className={styles.solicitanteWrapper} ref={solicitanteRef}>
                        <button
                            className={`${styles.solicitanteBtn} ${selectedSolicitantes.length > 0 ? styles.solicitanteBtnActive : ''}`}
                            onClick={() => setSolicitanteOpen(!solicitanteOpen)}
                        >
                            <FiFilter />
                            {t('quality.retrabalho.analise.solicitante', 'Solicitante')}
                            {selectedSolicitantes.length > 0 && (
                                <span className={styles.solicitanteCount}>{selectedSolicitantes.length}</span>
                            )}
                        </button>

                        {solicitanteOpen && (
                            <div className={styles.solicitanteDropdown}>
                                {selectedSolicitantes.length > 0 && (
                                    <button
                                        className={styles.clearFilterBtn}
                                        onClick={() => setSelectedSolicitantes([])}
                                    >
                                        {t('common.clearAll', 'Limpar todos')}
                                    </button>
                                )}
                                {solicitanteList.map(sol => (
                                    <label key={sol.id} className={styles.solicitanteItem}>
                                        <input
                                            type="checkbox"
                                            checked={selectedSolicitantes.includes(sol.nome)}
                                            onChange={() => toggleSolicitante(sol.nome)}
                                        />
                                        {sol.nome}
                                    </label>
                                ))}
                                {solicitanteList.length === 0 && (
                                    <div style={{ padding: '12px', color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center' }}>
                                        {t('common.noOptions', 'Nenhuma opção')}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Summary Cards ───────────────────────────────────────── */}
                <div className={styles.summaryGrid}>
                    <div className={styles.summaryCard}>
                        <div className={styles.summaryIcon}><FiClock /></div>
                        <div className={styles.summaryLabel}>
                            {t('quality.retrabalho.analise.totalHoras', 'Total de Horas')}
                        </div>
                        <div className={styles.summaryValue}>
                            {loading ? '—' : formatHours(data?.totalHoras || 0)}
                        </div>
                        <div className={styles.summarySubtext}>
                            {t('quality.retrabalho.analise.periodo', 'no período selecionado')}
                        </div>
                    </div>

                    <div className={styles.summaryCard}>
                        <div className={styles.summaryIcon}><FiBarChart2 /></div>
                        <div className={styles.summaryLabel}>
                            {t('quality.retrabalho.analise.topCausa', 'Causa Principal')}
                        </div>
                        <div className={styles.summaryValue}>{loading ? '—' : topCausa}</div>
                        <div className={styles.summarySubtext}>
                            {t('quality.retrabalho.analise.maiorHoras', 'maior volume de horas')}
                        </div>
                    </div>

                    <div className={styles.summaryCard}>
                        <div className={styles.summaryIcon}><FiList /></div>
                        <div className={styles.summaryLabel}>
                            {t('quality.retrabalho.analise.totalRegistros', 'Total de Registros')}
                        </div>
                        <div className={styles.summaryValue}>
                            {loading ? '—' : (data?.totalRegistros || 0)}
                        </div>
                        <div className={styles.summarySubtext}>
                            {t('quality.retrabalho.analise.ocorrencias', 'ocorrências registradas')}
                        </div>
                    </div>
                </div>

                {/* ── Chart ──────────────────────────────────────────────── */}
                {loading ? (
                    <div className={styles.chartCard}>
                        <div className={styles.chartHeader}>
                            <span className={styles.chartTitle}>
                                <FiBarChart2 />
                                {t('quality.retrabalho.analise.chartTitle', 'Horas por Causa (4M1D)')}
                            </span>
                        </div>
                        <div className={styles.chartContainer} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: '#94a3b8' }}>{t('common.loading', 'Carregando...')}</span>
                        </div>
                    </div>
                ) : data && data.items.length > 0 ? (
                    <>
                        <div className={styles.chartCard}>
                            <div className={styles.chartHeader}>
                                <span className={styles.chartTitle}>
                                    <FiBarChart2 />
                                    {t('quality.retrabalho.analise.chartTitle', 'Horas por Causa (4M1D)')}
                                </span>
                            </div>
                            <div className={styles.chartContainer}>
                                {chartData && <Bar data={chartData} options={chartOptions} />}
                            </div>
                        </div>

                        {/* ── Detail Table ──────────────────────────────────── */}
                        <div className={styles.detailCard}>
                            <div className={styles.detailTitle}>
                                <FiList />
                                {t('quality.retrabalho.analise.detailTitle', 'Detalhamento por Causa')}
                            </div>
                            <table className={styles.detailTable}>
                                <thead>
                                    <tr>
                                        <th>{t('quality.retrabalho.analise.causa', 'Causa')}</th>
                                        <th>{t('quality.retrabalho.analise.registros', 'Registros')}</th>
                                        <th>{t('quality.retrabalho.analise.horas', 'Horas')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.items.map(item => (
                                        <tr key={item.causa}>
                                            <td>
                                                <span className={styles.causaBadge}>
                                                    <span
                                                        className={styles.causaDot}
                                                        style={{ background: getCausaColor(item.causa).dot }}
                                                    />
                                                    {item.causa}
                                                </span>
                                            </td>
                                            <td>{item.totalRegistros}</td>
                                            <td>
                                                <span className={styles.horasValue}>
                                                    {formatHours(item.totalHoras)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className={styles.totalRow}>
                                        <td><strong>{t('common.total', 'Total')}</strong></td>
                                        <td><strong>{data.totalRegistros}</strong></td>
                                        <td>
                                            <span className={styles.horasValue}>
                                                {formatHours(data.totalHoras)}
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}><FiBarChart2 /></div>
                        <p>
                            {t(
                                'quality.retrabalho.analise.emptyState',
                                'Nenhum dado de retrabalho encontrado para o período selecionado.'
                            )}
                        </p>
                    </div>
                )}
            </div>
        </>
    );
}
