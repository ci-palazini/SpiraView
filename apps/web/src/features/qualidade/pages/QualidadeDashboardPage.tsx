import { useRef, useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { http } from '../../../services/apiClient';
import PageHeader from '../../../shared/components/PageHeader';
import styles from './QualidadeDashboardPage.module.css';
import DashboardFilter, { Period } from '../components/DashboardFilter';
import StatCard from '../components/StatCard';
import { Banknote, TrendingDown } from 'lucide-react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

export default function QualidadeDashboardPage() {
    const { t } = useTranslation();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Initialize with correct dates for "Current Month" to avoid loading "All Time" data first
    const [filter, setFilter] = useState<{ period: Period, start?: string, end?: string }>(() => {
        const now = new Date();
        return {
            period: 'current_month',
            start: format(startOfMonth(now), 'yyyy-MM-dd'),
            end: format(endOfMonth(now), 'yyyy-MM-dd')
        };
    });

    const requestId = useRef(0);

    useEffect(() => {
        loadData(filter.start, filter.end);
    }, [filter]);

    const loadData = async (start?: string, end?: string) => {
        const currentId = ++requestId.current;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (start) params.append('dataInicio', start);
            if (end) params.append('dataFim', end);

            const res = await http.get<any>(`/qualidade/dashboard?${params.toString()}`);

            // Only update if this is still the most recent request
            if (currentId === requestId.current) {
                setData(res);
            }
        } catch (err) {
            console.error(err);
        } finally {
            if (currentId === requestId.current) {
                setLoading(false);
            }
        }
    };

    const handleFilterChange = (period: Period, start?: string, end?: string) => {
        // Avoid double fetch if values are fundamentally the same
        if (filter.period === period && filter.start === start && filter.end === end) return;
        setFilter({ period, start, end });
    };

    const barOptions = useMemo(() => ({
        responsive: true,
        plugins: {
            legend: { position: 'top' as const },
            title: { display: false },
        },
        indexAxis: 'y' as const,
    }), []);

    const pieOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'right' as const },
        }
    }), []);

    const barChartData = useMemo(() => {
        if (!data?.defeitos) return { labels: [], datasets: [] };
        return {
            labels: data.defeitos.map((d: any) => d.motivo_defeito),
            datasets: [{
                label: t('quality.cost', 'Custo (R$)'),
                data: data.defeitos.map((d: any) => d.custo),
                backgroundColor: 'rgba(59, 130, 246, 0.6)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1,
            }]
        };
    }, [data, t]);

    const pieChartData = useMemo(() => {
        if (!data?.origens) return { labels: [], datasets: [] };
        return {
            labels: data.origens.map((s: any) => s.origem),
            datasets: [{
                data: data.origens.map((s: any) => s.custo),
                backgroundColor: [
                    '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
                    '#8b5cf6', '#ec4899', '#6366f1'
                ],
                borderWidth: 1,
            }]
        };
    }, [data]);

    return (
        <div className={styles.container}>
            <PageHeader
                title={t('quality.dashboard', 'Dashboard de Qualidade')}
                subtitle={t('quality.dashSubtitle', 'Visão geral dos custos e principais ofensores de qualidade.')}
            />

            <DashboardFilter onChange={handleFilterChange} />

            {loading ? (
                <div className={styles.loading}>{t('common.loading', 'Carregando...')}</div>
            ) : (
                <>
                    {/* KPIs */}
                    <div className={styles.kpiContainer}>
                        <StatCard
                            title={t('quality.totalCost', 'Custo Total de Refugo')}
                            value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data?.kpis?.custoTotal || 0)}
                            icon={<Banknote size={24} />}
                            color="blue"
                            subtitle={t('quality.periodTotal', 'Total do período selecionado')}
                        />
                    </div>

                    {/* Gráficos */}
                    <div className={styles.chartsGrid}>
                        <div className={styles.chartCard}>
                            <div className={styles.chartTitle}>
                                {t('quality.topDefects', 'Top Defeitos (Custo)')}
                                <TrendingDown size={20} className="text-gray-400" />
                            </div>
                            <div className={styles.chartWrapper}>
                                <Bar options={barOptions} data={barChartData} />
                            </div>
                        </div>

                        <div className={styles.chartCard}>
                            <div className={styles.chartTitle}>{t('quality.costByOrigin', 'Custo por Origem')}</div>
                            <div className={styles.chartWrapper}>
                                <Pie options={pieOptions} data={pieChartData} />
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
