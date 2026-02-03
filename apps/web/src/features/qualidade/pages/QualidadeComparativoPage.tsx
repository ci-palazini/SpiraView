import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format, startOfMonth, endOfMonth, subMonths, subYears } from 'date-fns';
import { FiArrowUp, FiArrowDown, FiMinus, FiBarChart2 } from 'react-icons/fi';
import { TrendingDown, TrendingUp } from 'lucide-react';
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

import PageHeader from '../../../shared/components/PageHeader';
import {
    getQualityComparison,
    listarOrigens,
    listarResponsaveis,
    QualityComparisonResponse,
    QualidadeOpcao
} from '../../../services/apiClient';
import { usePermissions } from '../../../hooks/usePermissions';
import styles from './QualidadeComparativoPage.module.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type CompareMode = 'periods' | 'origins' | 'responsibles';

export default function QualidadeComparativoPage() {
    const { t } = useTranslation();
    const user = JSON.parse(localStorage.getItem('usuario') || 'null');
    const { canView } = usePermissions(user);

    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<CompareMode>('periods');

    // Period filters
    const now = new Date();
    const [dataInicioA, setDataInicioA] = useState(format(startOfMonth(now), 'yyyy-MM-dd'));
    const [dataFimA, setDataFimA] = useState(format(endOfMonth(now), 'yyyy-MM-dd'));
    const [dataInicioB, setDataInicioB] = useState(format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd'));
    const [dataFimB, setDataFimB] = useState(format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd'));

    // Common filters
    const [tipo, setTipo] = useState('');
    const [tipoLancamento, setTipoLancamento] = useState('');
    const [origem, setOrigem] = useState('');
    const [responsavel, setResponsavel] = useState('');

    // Options
    const [origemOpts, setOrigemOpts] = useState<QualidadeOpcao[]>([]);
    const [responsavelOpts, setResponsavelOpts] = useState<string[]>([]);

    // Data
    const [result, setResult] = useState<QualityComparisonResponse | null>(null);

    useEffect(() => {
        loadOptions();
        // Reset dependent filters when type changes
        setOrigem('');
        setResponsavel('');
    }, [tipo]);

    const loadOptions = async () => {
        try {
            const [origens, responsaveis] = await Promise.all([
                listarOrigens(false, tipo || undefined),
                listarResponsaveis({ tipo: tipo || undefined })
            ]);
            setOrigemOpts(origens);
            setResponsavelOpts(responsaveis);
        } catch (err) {
            console.error(err);
        }
    };

    const handleCompare = async () => {
        setLoading(true);
        try {
            const data = await getQualityComparison({
                dataInicioA,
                dataFimA,
                dataInicioB,
                dataFimB,
                tipo: tipo || undefined,
                tipoLancamento: tipoLancamento || undefined,
                origem: origem || undefined,
                responsavel: responsavel || undefined
            });
            setResult(data);
        } catch (err) {
            console.error(err);
            toast.error(t('common.error', 'Erro ao carregar dados'));
        } finally {
            setLoading(false);
        }
    };

    // Auto-compare on mount
    useEffect(() => {
        handleCompare();
    }, []);

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    const getDeltaClass = (pct: number) => {
        if (pct > 0) return 'positive';
        if (pct < 0) return 'negative';
        return 'neutral';
    };

    // Quick Presets
    const setPreset = (preset: 'thisMonth_lastMonth' | 'thisMonth_lastYear' | 'thisYear_lastYear') => {
        const now = new Date();
        switch (preset) {
            case 'thisMonth_lastMonth':
                setDataInicioA(format(startOfMonth(now), 'yyyy-MM-dd'));
                setDataFimA(format(endOfMonth(now), 'yyyy-MM-dd'));
                setDataInicioB(format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd'));
                setDataFimB(format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd'));
                break;
            case 'thisMonth_lastYear':
                setDataInicioA(format(startOfMonth(now), 'yyyy-MM-dd'));
                setDataFimA(format(endOfMonth(now), 'yyyy-MM-dd'));
                setDataInicioB(format(startOfMonth(subYears(now, 1)), 'yyyy-MM-dd'));
                setDataFimB(format(endOfMonth(subYears(now, 1)), 'yyyy-MM-dd'));
                break;
            case 'thisYear_lastYear':
                setDataInicioA(format(new Date(now.getFullYear(), 0, 1), 'yyyy-MM-dd'));
                setDataFimA(format(new Date(now.getFullYear(), 11, 31), 'yyyy-MM-dd'));
                setDataInicioB(format(new Date(now.getFullYear() - 1, 0, 1), 'yyyy-MM-dd'));
                setDataFimB(format(new Date(now.getFullYear() - 1, 11, 31), 'yyyy-MM-dd'));
                break;
        }
    };

    // Chart data for side-by-side comparison
    const barChartData = useMemo(() => {
        if (!result) return { labels: [], datasets: [] };

        return {
            labels: [t('qualityComparative.totalCost', 'Custo Total')],
            datasets: [
                {
                    label: t('qualityComparative.periodA', 'Período A'),
                    data: [result.periodA.totalCost],
                    backgroundColor: 'rgba(59, 130, 246, 0.7)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1
                },
                {
                    label: t('qualityComparative.periodB', 'Período B'),
                    data: [result.periodB.totalCost],
                    backgroundColor: 'rgba(139, 92, 246, 0.7)',
                    borderColor: 'rgba(139, 92, 246, 1)',
                    borderWidth: 1
                }
            ]
        };
    }, [result, t]);

    const defectsChartData = useMemo(() => {
        if (!result) return { labels: [], datasets: [] };

        const allDefects = new Set([
            ...result.periodA.topDefects.map(d => d.motivo),
            ...result.periodB.topDefects.map(d => d.motivo)
        ]);
        const labels = Array.from(allDefects).slice(0, 5);

        const dataA = labels.map(l => {
            const item = result.periodA.topDefects.find(d => d.motivo === l);
            return item?.custo || 0;
        });
        const dataB = labels.map(l => {
            const item = result.periodB.topDefects.find(d => d.motivo === l);
            return item?.custo || 0;
        });

        return {
            labels,
            datasets: [
                {
                    label: t('qualityComparative.periodA', 'Período A'),
                    data: dataA,
                    backgroundColor: 'rgba(59, 130, 246, 0.7)',
                    borderRadius: 4
                },
                {
                    label: t('qualityComparative.periodB', 'Período B'),
                    data: dataB,
                    backgroundColor: 'rgba(139, 92, 246, 0.7)',
                    borderRadius: 4
                }
            ]
        };
    }, [result, t]);

    const barOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top' as const }
        },
        scales: {
            y: { beginAtZero: true }
        }
    }), []);

    const horizontalBarOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y' as const,
        plugins: {
            legend: { position: 'top' as const }
        }
    }), []);

    if (!canView('qualidade_analitico')) {
        return (
            <div className={styles.container}>
                <div className={styles.emptyState}>
                    <p>{t('common.accessDenied', 'Acesso negado')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <PageHeader
                title={t('qualityComparative.title', 'Comparativos')}
                subtitle={t('qualityComparative.subtitle', 'Compare métricas entre períodos, origens e responsáveis')}
            />

            <div className={styles.content}>
                {/* Quick Presets */}
                <div className={styles.modeTabs}>
                    <button
                        className={`${styles.modeTab} ${dataInicioB === format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd') &&
                            dataFimB === format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd')
                            ? styles.modeTabActive
                            : ''
                            }`}
                        onClick={() => setPreset('thisMonth_lastMonth')}
                    >
                        {t('qualityComparative.thisVsLastMonth', 'Este Mês vs Mês Passado')}
                    </button>
                    <button
                        className={`${styles.modeTab} ${dataInicioB === format(startOfMonth(subYears(now, 1)), 'yyyy-MM-dd') &&
                            dataFimB === format(endOfMonth(subYears(now, 1)), 'yyyy-MM-dd')
                            ? styles.modeTabActive
                            : ''
                            }`}
                        onClick={() => setPreset('thisMonth_lastYear')}
                    >
                        {t('qualityComparative.thisVsLastYear', 'Este Mês vs Ano Passado')}
                    </button>
                    <button
                        className={`${styles.modeTab} ${dataInicioA === format(new Date(now.getFullYear(), 0, 1), 'yyyy-MM-dd') &&
                            dataInicioB === format(new Date(now.getFullYear() - 1, 0, 1), 'yyyy-MM-dd')
                            ? styles.modeTabActive
                            : ''
                            }`}
                        onClick={() => setPreset('thisYear_lastYear')}
                    >
                        {t('qualityComparative.yearVsYear', 'Este Ano vs Ano Passado')}
                    </button>
                </div>

                {/* Common Filters */}
                <div className={styles.commonFilters}>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>{t('qualityAnalytics.filterOriginType', 'Tipo de Origem')}</label>
                        <select
                            className={styles.filterSelect}
                            value={tipo}
                            onChange={(e) => setTipo(e.target.value)}
                        >
                            <option value="">{t('qualityAnalytics.allTypes', 'Todos')}</option>
                            <option value="INTERNO">{t('qualityAnalytics.internal', 'Interno')}</option>
                            <option value="EXTERNO">{t('qualityAnalytics.external', 'Externo')}</option>
                        </select>
                    </div>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>{t('nav.tipoLancamento', 'Tipo de Dados')}</label>
                        <select
                            className={styles.filterSelect}
                            value={tipoLancamento}
                            onChange={(e) => setTipoLancamento(e.target.value)}
                        >
                            <option value="">{t('nav.todos', 'Todos')}</option>
                            <option value="REFUGO">{t('nav.refugo', 'Refugo')}</option>
                            <option value="QUARENTENA">{t('nav.quarentena', 'Quarentena')}</option>
                        </select>
                    </div>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>{t('qualityComparative.origins', 'Origem')}</label>
                        <select
                            className={styles.filterSelect}
                            value={origem}
                            onChange={(e) => setOrigem(e.target.value)}
                        >
                            <option value="">{t('nav.todos', 'Todas')}</option>
                            {origemOpts.map((opt) => (
                                <option key={opt.id} value={opt.nome}>
                                    {opt.nome}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>{t('qualityComparative.responsibles', 'Responsável')}</label>
                        <select
                            className={styles.filterSelect}
                            value={responsavel}
                            onChange={(e) => setResponsavel(e.target.value)}
                        >
                            <option value="">{t('nav.todos', 'Todos')}</option>
                            {responsavelOpts.map((resp) => (
                                <option key={resp} value={resp}>
                                    {resp}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        className={styles.compareButton}
                        onClick={handleCompare}
                        disabled={loading}
                    >
                        {loading ? t('common.loading', 'Carregando...') : t('qualityComparative.compare', 'Comparar')}
                    </button>
                </div>

                {/* Comparison Grid */}
                <div className={styles.comparisonGrid}>
                    {/* Period A */}
                    <div className={`${styles.periodCard} ${styles.periodCardA}`}>
                        <div className={`${styles.periodLabel} ${styles.periodLabelA}`}>
                            <span className={`${styles.periodBadge} ${styles.periodBadgeA}`}>A</span>
                            {t('qualityComparative.periodA', 'Período A')}
                        </div>
                        <div className={styles.filterRow}>
                            <input
                                type="date"
                                className={styles.filterInput}
                                value={dataInicioA}
                                onChange={(e) => setDataInicioA(e.target.value)}
                            />
                            <input
                                type="date"
                                className={styles.filterInput}
                                value={dataFimA}
                                onChange={(e) => setDataFimA(e.target.value)}
                            />
                        </div>
                        {result && (
                            <>
                                <div className={styles.costValue}>{formatCurrency(result.periodA.totalCost)}</div>
                                <div className={styles.countValue}>{result.periodA.count} {t('qualityComparative.occurrences', 'ocorrências')}</div>
                            </>
                        )}
                    </div>

                    {/* Delta Card */}
                    <div className={styles.deltaCard}>
                        {result ? (
                            <>
                                <div className={`${styles.deltaIcon} ${styles[`delta${getDeltaClass(result.delta.costPctChange).charAt(0).toUpperCase() + getDeltaClass(result.delta.costPctChange).slice(1)}`]}`}>
                                    {result.delta.costPctChange > 0 ? <TrendingUp size={40} /> :
                                        result.delta.costPctChange < 0 ? <TrendingDown size={40} /> :
                                            <FiMinus size={40} />}
                                </div>
                                <div className={`${styles.deltaValue} ${styles[`delta${getDeltaClass(result.delta.costPctChange).charAt(0).toUpperCase() + getDeltaClass(result.delta.costPctChange).slice(1)}`]}`}>
                                    {result.delta.costPctChange > 0 ? '+' : ''}{formatCurrency(result.delta.costDiff)}
                                </div>
                                <div className={`${styles.deltaPercent} ${styles[`deltaPercent${getDeltaClass(result.delta.costPctChange).charAt(0).toUpperCase() + getDeltaClass(result.delta.costPctChange).slice(1)}`]}`}>
                                    {result.delta.costPctChange > 0 ? '+' : ''}{result.delta.costPctChange.toFixed(1)}%
                                </div>
                            </>
                        ) : (
                            <FiBarChart2 size={40} className={styles.deltaNeutral} />
                        )}
                    </div>

                    {/* Period B */}
                    <div className={`${styles.periodCard} ${styles.periodCardB}`}>
                        <div className={`${styles.periodLabel} ${styles.periodLabelB}`}>
                            <span className={`${styles.periodBadge} ${styles.periodBadgeB}`}>B</span>
                            {t('qualityComparative.periodB', 'Período B')}
                        </div>
                        <div className={styles.filterRow}>
                            <input
                                type="date"
                                className={styles.filterInput}
                                value={dataInicioB}
                                onChange={(e) => setDataInicioB(e.target.value)}
                            />
                            <input
                                type="date"
                                className={styles.filterInput}
                                value={dataFimB}
                                onChange={(e) => setDataFimB(e.target.value)}
                            />
                        </div>
                        {result && (
                            <>
                                <div className={styles.costValue}>{formatCurrency(result.periodB.totalCost)}</div>
                                <div className={styles.countValue}>{result.periodB.count} {t('qualityComparative.occurrences', 'ocorrências')}</div>
                            </>
                        )}
                    </div>
                </div>

                {/* Charts */}
                {loading ? (
                    <div className={styles.loading}>{t('common.loading', 'Carregando...')}</div>
                ) : result && (
                    <div className={styles.chartsSection}>
                        <div className={styles.chartCard}>
                            <div className={styles.chartTitle}>
                                {t('qualityComparative.costComparison', 'Comparação de Custos')}
                            </div>
                            <div className={styles.chartWrapper}>
                                <Bar options={barOptions} data={barChartData} />
                            </div>
                        </div>
                        <div className={styles.chartCard}>
                            <div className={styles.chartTitle}>
                                {t('qualityComparative.defectsComparison', 'Top Defeitos')}
                            </div>
                            <div className={styles.chartWrapper}>
                                <Bar options={horizontalBarOptions} data={defectsChartData} />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

