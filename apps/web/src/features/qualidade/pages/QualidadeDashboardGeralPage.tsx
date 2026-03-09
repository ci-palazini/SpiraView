import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { http } from '../../../services/apiClient';
import PageHeader from '../../../shared/components/PageHeader';
import styles from './QualidadeDashboardGeralPage.module.css';
import DashboardFilter, { Period } from '../components/DashboardFilter';
import StatCard from '../components/StatCard';
import { Banknote, TrendingDown, TrendingUp, Hash, Clock, AlertTriangle, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend);

interface DashboardGeralData {
    kpis: {
        refugo: {
            custoTotal: number;
            ocorrencias: number;
            pecas: number;
        };
        retrabalho: {
            ocorrencias: number;
            horasTotais: number;
        };
    };
    topDefeitos: { nome: string; custo: number; qtd: number }[];
    topOrigens: { nome: string; custo: number }[];
    topNcs: { nome: string; qtd: number; horas: number }[];
    trends: {
        period: string;
        custo_refugo: number;
        qtd_refugo: number;
        qtd_retrabalho: number;
        horas_retrabalho: number;
    }[];
}

export default function QualidadeDashboardGeralPage() {
    const { t } = useTranslation();
    const [data, setData] = useState<DashboardGeralData | null>(null);
    const [loading, setLoading] = useState(true);

    const [filter, setFilter] = useState<{ period: Period, start?: string, end?: string, tipo?: string, tipoLancamento?: string }>(() => {
        const now = new Date();
        return {
            period: 'current_month',
            start: format(startOfMonth(now), 'yyyy-MM-dd'),
            end: format(endOfMonth(now), 'yyyy-MM-dd'),
            tipo: '',
            tipoLancamento: ''
        };
    });

    useEffect(() => {
        loadData(filter.start, filter.end, filter.tipo, filter.tipoLancamento);
    }, [filter]);

    const loadData = async (start?: string, end?: string, tipo?: string, tipoLancamento?: string) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (start) params.append('dataInicio', start);
            if (end) params.append('dataFim', end);
            if (tipo) params.append('tipo', tipo);
            if (tipoLancamento) params.append('tipoLancamento', tipoLancamento);

            const res = await http.get<DashboardGeralData>(`/qualidade/dashboard-geral?${params.toString()}`);
            setData(res);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (period: Period, start?: string, end?: string, tipo?: string, tipoLancamento?: string) => {
        if (filter.period === period && filter.start === start && filter.end === end && filter.tipo === tipo && filter.tipoLancamento === tipoLancamento) return;
        setFilter({ period, start, end, tipo, tipoLancamento });
    };

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    const getScrapLabel = () => {
        if (filter.tipoLancamento === 'REFUGO') return t('nav.refugo', 'Refugo');
        if (filter.tipoLancamento === 'QUARENTENA') return t('nav.quarentena', 'Quarentena');
        return t('quality.scrapQuarantine', 'Refugo / Quarentena');
    };

    const getPartsLabel = () => {
        if (filter.tipoLancamento === 'REFUGO') return t('quality.scrapPartsOnly', 'Peças Refugadas');
        if (filter.tipoLancamento === 'QUARENTENA') return t('quality.quarantinePartsOnly', 'Peças em Quarentena');
        return t('quality.scrapQuarantineParts', 'Peças Refugadas / Quarentenadas');
    };

    const barOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
        },
        indexAxis: 'y' as const,
    }), []);

    const lineOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top' as const,
                align: 'end' as const,
            },
            tooltip: {
                mode: 'index' as const,
                intersect: false,
            }
        },
        scales: {
            y: {
                type: 'linear' as const,
                display: true,
                position: 'left' as const,
                title: { display: true, text: t('quality.cost', 'Custo') },
                grid: { color: '#f0f0f0' }
            },
            y1: {
                type: 'linear' as const,
                display: true,
                position: 'right' as const,
                title: { display: true, text: t('quality.occurrences', 'Ocorrências') },
                grid: { drawOnChartArea: false },
            },
            x: {
                grid: { display: false }
            }
        }
    }), [t]);

    // Chart Data Configs
    const topDefeitosData = useMemo(() => {
        if (!data?.topDefeitos) return { labels: [], datasets: [] };
        return {
            labels: data.topDefeitos.map(d => d.nome),
            datasets: [{
                label: t('quality.cost', 'Custo (R$)'),
                data: data.topDefeitos.map(d => d.custo),
                backgroundColor: 'rgba(59, 130, 246, 0.6)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1,
            }]
        };
    }, [data, t]);

    const topOrigensData = useMemo(() => {
        if (!data?.topOrigens) return { labels: [], datasets: [] };
        return {
            labels: data.topOrigens.map(o => o.nome),
            datasets: [{
                label: t('quality.cost', 'Custo (R$)'),
                data: data.topOrigens.map(o => o.custo),
                backgroundColor: 'rgba(16, 185, 129, 0.6)',
                borderColor: 'rgba(16, 185, 129, 1)',
                borderWidth: 1,
            }]
        };
    }, [data, t]);

    const topNcsData = useMemo(() => {
        if (!data?.topNcs) return { labels: [], datasets: [] };
        return {
            labels: data.topNcs.map(nc => nc.nome),
            datasets: [{
                label: t('quality.occurrences', 'Ocorrências'),
                data: data.topNcs.map(nc => nc.qtd),
                backgroundColor: 'rgba(139, 92, 246, 0.6)',
                borderColor: 'rgba(139, 92, 246, 1)',
                borderWidth: 1,
            }]
        };
    }, [data, t]);

    const trendsData = useMemo(() => {
        if (!data?.trends) return { labels: [], datasets: [] };

        const scrapLabel = filter.tipoLancamento === 'REFUGO' ? t('nav.refugo', 'Refugo') : filter.tipoLancamento === 'QUARENTENA' ? t('nav.quarentena', 'Quarentena') : t('quality.scrapQuarantine', 'Refugo / Quarentena');

        return {
            labels: data.trends.map(t => t.period),
            datasets: [
                {
                    label: `${t('quality.cost', 'Custo')} ${scrapLabel}`,
                    data: data.trends.map(t => t.custo_refugo),
                    borderColor: '#3b82f6',
                    backgroundColor: '#3b82f6',
                    yAxisID: 'y',
                    tension: 0.3
                },
                {
                    label: `${t('quality.occurrences', 'Ocorrências')} ${scrapLabel}`,
                    data: data.trends.map(t => t.qtd_refugo),
                    borderColor: '#94a3b8',
                    backgroundColor: '#94a3b8',
                    borderDash: [5, 5],
                    yAxisID: 'y1',
                    tension: 0.3
                },
                {
                    label: t('quality.reworkOccurrences', 'Ocorrências Retrabalho'),
                    data: data.trends.map(t => t.qtd_retrabalho),
                    borderColor: '#8b5cf6',
                    backgroundColor: '#8b5cf6',
                    yAxisID: 'y1',
                    tension: 0.3
                }
            ]
        };
    }, [data, t]);

    return (
        <div className={styles.container}>
            <PageHeader
                title={t('quality.overviewDashboardTitle', 'Visão Geral de Qualidade')}
                subtitle={t('quality.overviewSubtitle', 'Indicadores consolidados de Refugo e Retrabalho.')}
            />

            <div className={styles.content}>
                <DashboardFilter
                    onChange={handleFilterChange}
                    hideEntityFilters={true} // Only show date filters for the general dashboard
                />

                {loading ? (
                    <div className={styles.loading}>{t('common.loading', 'Carregando...')}</div>
                ) : (
                    <>
                        {/* KPIs - 4 columns */}
                        <div className={styles.kpiContainer}>
                            <StatCard
                                title={`${t('quality.cost', 'Custo')} ${getScrapLabel()}`}
                                value={formatCurrency(data?.kpis?.refugo?.custoTotal || 0)}
                                icon={<Banknote size={24} />}
                                color="blue"
                                subtitle={t('quality.scrapOccurrencesDesc', '{{count}} ocorrências registradas', { count: data?.kpis?.refugo?.ocorrencias || 0 })}
                            />
                            <StatCard
                                title={getPartsLabel()}
                                value={String(data?.kpis?.refugo?.pecas || 0)}
                                icon={<AlertTriangle size={24} />}
                                color="yellow"
                                subtitle={t('quality.periodTotal', 'Total no período')}
                            />
                            <StatCard
                                title={t('quality.reworkOccurrencesTotal', 'Total Retrabalhos')}
                                value={String(data?.kpis?.retrabalho?.ocorrencias || 0)}
                                icon={<RefreshCw size={24} />}
                                color="purple"
                                subtitle={t('quality.periodTotal', 'Total no período')}
                            />
                            <StatCard
                                title={t('quality.reworkHours', 'Horas de Retrabalho')}
                                value={`${data?.kpis?.retrabalho?.horasTotais || 0}h`}
                                icon={<Clock size={24} />}
                                color="purple"
                                subtitle={t('quality.periodTotal', 'Total no período')}
                            />
                        </div>

                        {/* Combined Trend Chart */}
                        <div className={styles.chartsGrid}>
                            <div className={`${styles.chartCard} ${styles.fullWidth}`}>
                                <div className={styles.chartTitle}>
                                    {t('quality.combinedTrendDynamic', `Evolução ${getScrapLabel()} vs Retrabalho (Últimos 6 Meses)`)}
                                    <TrendingUp size={20} className="text-gray-400" />
                                </div>
                                <div className={styles.trendWrapper}>
                                    <Line options={lineOptions} data={trendsData} />
                                </div>
                            </div>

                            {/* Refugo: Top Defeitos */}
                            <div className={styles.chartCard}>
                                <div className={styles.chartTitle}>
                                    {t('quality.topDefectsDynamic', `Top Defeitos - ${getScrapLabel()} (Custo)`)}
                                </div>
                                <div className={styles.chartWrapper}>
                                    <Bar options={barOptions} data={topDefeitosData} />
                                </div>
                            </div>

                            {/* Retrabalho: Top NCs */}
                            <div className={styles.chartCard}>
                                <div className={styles.chartTitle}>
                                    {t('quality.topNcsRework', 'Top Não-Conformidades - Retrabalho')}
                                </div>
                                <div className={styles.chartWrapper}>
                                    <Bar options={barOptions} data={topNcsData} />
                                </div>
                            </div>

                            {/* Refugo: Top Origens */}
                            <div className={`${styles.chartCard} ${styles.fullWidth}`}>
                                <div className={styles.chartTitle}>
                                    {t('quality.topOriginsDynamic', `Principais Ofensores por Origem (${getScrapLabel()} - Custo)`)}
                                </div>
                                <div className={styles.chartWrapper} style={{ height: '250px' }}>
                                    <Bar options={barOptions} data={topOrigensData} />
                                </div>
                            </div>
                        </div>

                        {/* Navigation Links */}
                        <div className={styles.quickLinksContainer}>
                            <Link to="/qualidade/dashboard" className={styles.quickLinkCard}>
                                <div className={styles.quickLinkIcon}>
                                    <ShieldCheck size={24} />
                                </div>
                                <div className={styles.quickLinkContent}>
                                    <div className={styles.quickLinkTitle}>{t('quality.goToScrapDashboard', 'Dashboard Detalhado de Refugo')}</div>
                                    <div className={styles.quickLinkDescription}>{t('quality.goToScrapDesc', 'Análise profunda, ofensores por responsável e ferramentas de drill-down.')}</div>
                                </div>
                                <ArrowRight className={styles.quickLinkArrow} size={20} />
                            </Link>

                            <Link to="/qualidade/analise-retrabalho" className={styles.quickLinkCard}>
                                <div className={styles.quickLinkIcon}>
                                    <RefreshCw size={24} />
                                </div>
                                <div className={styles.quickLinkContent}>
                                    <div className={styles.quickLinkTitle}>{t('quality.goToReworkAnalytics', 'Análise de Retrabalho')}</div>
                                    <div className={styles.quickLinkDescription}>{t('quality.goToReworkDesc', 'Distribuição de solicitações, análise de PDCA e ofensores específicos.')}</div>
                                </div>
                                <ArrowRight className={styles.quickLinkArrow} size={20} />
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
