import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { http } from '../../../services/apiClient';
import PageHeader from '../../../shared/components/PageHeader';
import styles from './QualidadeDashboardPage.module.css';

// Usar charts.js para manter padrão do projeto (como em AnaliseFalhasPage)
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

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await http.get<any>('/qualidade/dashboard');
            setData(res);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const barOptions = useMemo(() => ({
        responsive: true,
        plugins: {
            legend: { position: 'top' as const },
            title: { display: false },
        },
        indexAxis: 'y' as const, // Horizontal styling often better for text labels
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

    if (loading) {
        return (
            <>
                <PageHeader title={t('quality.dashboard', 'Dashboard de Qualidade')} />
                <div className={styles.listContainer}>
                    <div className={styles.loading}>{t('common.loading', 'Carregando...')}</div>
                </div>
            </>
        );
    }

    return (
        <>
            <PageHeader
                title={t('quality.dashboard', 'Dashboard de Qualidade')}
                subtitle={t('quality.dashSubtitle', 'Visão geral dos custos e principais ofensores de qualidade.')}
            />

            <div className={styles.listContainer}>
                {/* KPIs */}
                <div className={styles.kpiContainer}>
                    <div className={styles.kpiCard}>
                        <div className={styles.kpiLabel}>{t('quality.totalCost', 'Custo Total de Refugo')}</div>
                        <div className={styles.kpiValue}>
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data?.kpis?.custoTotal || 0)}
                        </div>
                    </div>
                </div>

                {/* Gráficos */}
                <div className={styles.chartsGrid}>
                    <div className={styles.chartCard}>
                        <div className={styles.chartTitle}>{t('quality.topDefects', 'Top Defeitos (Custo)')}</div>
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
            </div>
        </>
    );
}
