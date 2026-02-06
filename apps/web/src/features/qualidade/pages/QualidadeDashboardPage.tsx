import { useRef, useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { http } from '../../../services/apiClient';
import PageHeader from '../../../shared/components/PageHeader';
import styles from './QualidadeDashboardPage.module.css';
import DashboardFilter, { Period } from '../components/DashboardFilter';
import StatCard from '../components/StatCard';
import QualityDrillDownModal from '../components/QualityDrillDownModal';
import { Banknote, TrendingDown, TrendingUp, Hash, Calendar, History } from 'lucide-react';
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
    ArcElement
} from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

interface DashboardData {
    kpis: {
        custoTotal: number;
        totalOcorrencias: number;
        custoMesAnterior: number;
        custoAnoAnterior: number;
        variacaoMes: number;
        variacaoAno: number;
    };
    defeitos: { motivo_defeito: string; qtd: number; custo: number }[];
    origens: { origem: string; custo: number }[];
    responsaveis: { responsavel_nome: string; custo: number }[];
    trends: { period: string; cost: number; count: number }[];
}

export default function QualidadeDashboardPage() {
    const { t } = useTranslation();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);

    // Drill-down modal state
    const [drillDownOpen, setDrillDownOpen] = useState(false);
    const [drillDownTitle, setDrillDownTitle] = useState('');
    const [drillDownFilters, setDrillDownFilters] = useState<{
        responsavel?: string | string[];
        origem?: string | string[];
        tipo?: string;
    }>({});

    // Current filter state for drill-down context
    const [currentFilter, setCurrentFilter] = useState<{
        tipo?: string;
        origem?: string | string[];
        responsavel?: string | string[];
    }>({});

    // Initialize with correct dates for "Current Month" to avoid loading "All Time" data first
    const [filter, setFilter] = useState<{ period: Period, start?: string, end?: string, tipo?: string, origem?: string | string[], responsavel?: string | string[] }>(() => {
        const now = new Date();
        return {
            period: 'current_month',
            start: format(startOfMonth(now), 'yyyy-MM-dd'),
            end: format(endOfMonth(now), 'yyyy-MM-dd'),
            tipo: '',
            origem: [],
            responsavel: []
        };
    });

    const requestId = useRef(0);

    useEffect(() => {
        loadData(filter.start, filter.end, filter.tipo, filter.origem, filter.responsavel);
    }, [filter]);

    const loadData = async (start?: string, end?: string, tipo?: string, origem?: string | string[], responsavel?: string | string[]) => {
        const currentId = ++requestId.current;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (start) params.append('dataInicio', start);
            if (end) params.append('dataFim', end);
            if (tipo) params.append('tipo', tipo);
            if (origem) {
                if (Array.isArray(origem)) {
                    origem.forEach(o => params.append('origem', o));
                } else {
                    params.append('origem', origem);
                }
            }
            if (responsavel) {
                if (Array.isArray(responsavel)) {
                    responsavel.forEach(r => params.append('responsavel', r));
                } else {
                    params.append('responsavel', responsavel);
                }
            }

            const res = await http.get<DashboardData>(`/qualidade/dashboard?${params.toString()}`);

            // Only update if this is still the most recent request
            if (currentId === requestId.current) {
                setData(res);
                setCurrentFilter({ tipo, origem, responsavel });
            }
        } catch (err) {
            console.error(err);
        } finally {
            if (currentId === requestId.current) {
                setLoading(false);
            }
        }
    };

    const handleFilterChange = (period: Period, start?: string, end?: string, tipo?: string, origem?: string | string[], responsavel?: string | string[]) => {
        // Avoid double fetch if values are fundamentally the same
        if (filter.period === period && filter.start === start && filter.end === end && filter.tipo === tipo &&
            JSON.stringify(filter.origem) === JSON.stringify(origem) &&
            JSON.stringify(filter.responsavel) === JSON.stringify(responsavel)) return;
        setFilter({ period, start, end, tipo, origem, responsavel });
    };

    // Drill-down handlers
    const handleResponsavelClick = (responsavelNome: string) => {
        setDrillDownTitle(`${t('qualityAnalytics.responsible', 'Responsável')}: ${responsavelNome}`);
        setDrillDownFilters({
            tipo: currentFilter.tipo,
            origem: currentFilter.origem,
            responsavel: responsavelNome
        });
        setDrillDownOpen(true);
    };

    const handleOrigemClick = (origemNome: string) => {
        setDrillDownTitle(`${t('qualityAnalytics.filterOrigin', 'Origem')}: ${origemNome}`);
        setDrillDownFilters({
            origem: origemNome,
            tipo: currentFilter.tipo,
            responsavel: currentFilter.responsavel
        });
        setDrillDownOpen(true);
    };

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    const getVariationBadge = (variation: number) => {
        if (variation > 0) {
            return (
                <span className={styles.variationBadgePositive}>
                    <TrendingUp size={14} /> +{variation}%
                </span>
            );
        } else if (variation < 0) {
            return (
                <span className={styles.variationBadgeNegative}>
                    <TrendingDown size={14} /> {variation}%
                </span>
            );
        }
        return (
            <span className={styles.variationBadgeNeutral}>
                0%
            </span>
        );
    };

    const barOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: false },
        },
        indexAxis: 'y' as const,
        onClick: (_event: any, elements: any[]) => {
            if (elements.length > 0 && data?.responsaveis) {
                const index = elements[0].index;
                const responsavel = data.responsaveis[index];
                if (responsavel) {
                    handleResponsavelClick(responsavel.responsavel_nome || 'N/A');
                }
            }
        }
    }), [data]);

    const pieOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'right' as const },
        },
        onClick: (_event: any, elements: any[]) => {
            if (elements.length > 0 && data?.origens) {
                const index = elements[0].index;
                const origem = data.origens[index];
                if (origem) {
                    handleOrigemClick(origem.origem);
                }
            }
        }
    }), [data]);

    const lineOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: { color: '#f0f0f0' }
            },
            x: {
                grid: { display: false }
            }
        }
    }), []);

    const barChartData = useMemo(() => {
        if (!data?.defeitos) return { labels: [], datasets: [] };
        return {
            labels: data.defeitos.map((d) => d.motivo_defeito),
            datasets: [{
                label: t('quality.cost', 'Custo (R$)'),
                data: data.defeitos.map((d) => d.custo),
                backgroundColor: 'rgba(59, 130, 246, 0.6)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1,
            }]
        };
    }, [data, t]);

    const pieChartData = useMemo(() => {
        if (!data?.origens) return { labels: [], datasets: [] };
        return {
            labels: data.origens.map((s) => s.origem),
            datasets: [{
                data: data.origens.map((s) => s.custo),
                backgroundColor: [
                    '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
                    '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'
                ],
                borderWidth: 1,
            }]
        };
    }, [data]);

    const responsaveisChartData = useMemo(() => {
        if (!data?.responsaveis) return { labels: [], datasets: [] };
        return {
            labels: data.responsaveis.map((r) => r.responsavel_nome || 'N/A'),
            datasets: [{
                label: t('quality.cost', 'Custo (R$)'),
                data: data.responsaveis.map((r) => r.custo),
                backgroundColor: 'rgba(249, 115, 22, 0.6)',
                borderColor: 'rgba(249, 115, 22, 1)',
                borderWidth: 1,
            }]
        };
    }, [data, t]);

    const trendChartData = useMemo(() => {
        if (!data?.trends) return { labels: [], datasets: [] };
        return {
            labels: data.trends.map((t) => t.period),
            datasets: [{
                label: t('quality.cost', 'Custo (R$)'),
                data: data.trends.map((t) => t.cost),
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
            }]
        };
    }, [data]);

    return (
        <div className={styles.container}>
            <PageHeader
                title={t('quality.dashboard', 'Dashboard de Qualidade')}
                subtitle={t('quality.dashSubtitle', 'Visão geral dos custos e principais ofensores de qualidade.')}
            />

            <div className={styles.content}>
                <DashboardFilter onChange={handleFilterChange} />

                {loading ? (
                    <div className={styles.loading}>{t('common.loading', 'Carregando...')}</div>
                ) : (
                    <>
                        {/* KPIs - 4 columns */}
                        <div className={styles.kpiContainer}>
                            <StatCard
                                title={t('quality.totalCost', 'Custo Total de Refugo')}
                                value={formatCurrency(data?.kpis?.custoTotal || 0)}
                                icon={<Banknote size={24} />}
                                color="blue"
                                subtitle={t('quality.periodTotal', 'Total do período selecionado')}
                            />
                            <StatCard
                                title={t('quality.totalOccurrences', 'Total de Ocorrências')}
                                value={String(data?.kpis?.totalOcorrencias || 0)}
                                icon={<Hash size={24} />}
                                color="purple"
                                subtitle={t('quality.periodTotal', 'Total do período selecionado')}
                            />
                            <StatCard
                                title={t('quality.vsLastMonth', 'vs Mês Anterior')}
                                value={formatCurrency(data?.kpis?.custoMesAnterior || 0)}
                                icon={<Calendar size={24} />}
                                color={data?.kpis?.variacaoMes && data.kpis.variacaoMes < 0 ? 'green' : 'yellow'}
                                subtitle={getVariationBadge(data?.kpis?.variacaoMes || 0)}
                            />
                            <StatCard
                                title={t('quality.vsLastYear', 'vs Ano Anterior')}
                                value={formatCurrency(data?.kpis?.custoAnoAnterior || 0)}
                                icon={<History size={24} />}
                                color={data?.kpis?.variacaoAno && data.kpis.variacaoAno < 0 ? 'green' : 'yellow'}
                                subtitle={getVariationBadge(data?.kpis?.variacaoAno || 0)}
                            />
                        </div>

                        {/* Trend Chart - Full Width */}
                        <div className={styles.chartsGrid}>
                            <div className={`${styles.chartCard} ${styles.fullWidth}`}>
                                <div className={styles.chartTitle}>
                                    {t('quality.monthlyTrend', 'Evolução Mensal (Últimos 12 meses)')}
                                    <TrendingUp size={20} className="text-blue-500" />
                                </div>
                                <div className={styles.trendWrapper}>
                                    <Line options={lineOptions} data={trendChartData} />
                                </div>
                            </div>

                            {/* Top Defeitos */}
                            <div className={styles.chartCard}>
                                <div className={styles.chartTitle}>
                                    {t('quality.topDefects', 'Top Defeitos (Custo)')}
                                    <TrendingDown size={20} className="text-gray-400" />
                                </div>
                                <div className={styles.chartWrapper}>
                                    <Bar options={{ ...barOptions, onClick: undefined }} data={barChartData} />
                                </div>
                            </div>

                            {/* Responsáveis - Clicável */}
                            <div className={`${styles.chartCard} ${styles.chartCardClickable}`}>
                                <div className={styles.chartTitle}>
                                    {t('quality.costByResponsible', 'Custo por Responsável')}
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                        {t('common.clickToDetails', 'Clique para detalhes')}
                                    </span>
                                </div>
                                <div className={styles.chartWrapper}>
                                    <Bar options={barOptions} data={responsaveisChartData} />
                                </div>
                            </div>

                            {/* Origem - Full width, Clicável */}
                            <div className={`${styles.chartCard} ${styles.fullWidth} ${styles.chartCardClickable}`}>
                                <div className={styles.chartTitle}>
                                    {t('quality.costByOrigin', 'Custo por Origem')}
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                        {t('common.clickToDetails', 'Clique para detalhes')}
                                    </span>
                                </div>
                                <div className={styles.chartWrapper}>
                                    <Pie options={pieOptions} data={pieChartData} />
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Drill-Down Modal */}
            <QualityDrillDownModal
                open={drillDownOpen}
                onClose={() => setDrillDownOpen(false)}
                filters={drillDownFilters}
                title={drillDownTitle}
            />
        </div>
    );
}