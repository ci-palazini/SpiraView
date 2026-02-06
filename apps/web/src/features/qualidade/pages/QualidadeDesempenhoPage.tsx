import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { http } from '../../../services/apiClient';
import PageHeader from '../../../shared/components/PageHeader';
import styles from './QualidadeDesempenhoPage.module.css'; // Dedicated styles
import DashboardFilter, { Period } from '../components/DashboardFilter';
import StatCard from '../components/StatCard';
import QualityDrillDownModal from '../components/QualityDrillDownModal'; // Import modal
import { User, DollarSign, Package, PieChart } from 'lucide-react';

interface CollaboratorMetric {
    name: string;
    totalCost: number;
    totalItems: number;
    totalCount: number;
    shareTotal: number;
    shareCell: number;
}

interface MetricsResponse {
    items: CollaboratorMetric[];
}

export default function QualidadeDesempenhoPage() {
    const { t } = useTranslation();
    const [data, setData] = useState<CollaboratorMetric[]>([]);
    const [loading, setLoading] = useState(true);

    const [filter, setFilter] = useState<{ period: Period, start?: string, end?: string, tipo?: string, origem?: string | string[] }>(() => {
        const now = new Date();
        return {
            period: 'current_month',
            start: format(startOfMonth(now), 'yyyy-MM-dd'),
            end: format(endOfMonth(now), 'yyyy-MM-dd'),
            tipo: 'INTERNO', // FORCE INTERNAL by default
            origem: []
        };
    });

    const [modalOpen, setModalOpen] = useState(false);
    const [selectedResponsible, setSelectedResponsible] = useState<string | null>(null);

    const requestId = useRef(0);

    useEffect(() => {
        loadData(filter.start, filter.end, filter.tipo, filter.origem);
    }, [filter]);

    const loadData = async (start?: string, end?: string, tipo?: string, origem?: string | string[]) => {
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

            const res = await http.get<MetricsResponse>(`/qualidade/individual/metrics?${params.toString()}`);

            if (currentId === requestId.current) {
                setData(res.items);
            }
        } catch (err) {
            console.error(err);
        } finally {
            if (currentId === requestId.current) {
                setLoading(false);
            }
        }
    };

    const handleFilterChange = (period: Period, start?: string, end?: string, tipo?: string, origem?: string | string[]) => {
        // Force INTERNO type, ignoring what comes from the filter component
        const forcedTipo = 'INTERNO';

        if (filter.period === period && filter.start === start && filter.end === end && filter.tipo === forcedTipo &&
            JSON.stringify(filter.origem) === JSON.stringify(origem)) return;

        setFilter({ period, start, end, tipo: forcedTipo, origem });
    };

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    const formatPercent = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(val / 100);

    const totalCost = data.reduce((acc, curr) => acc + curr.totalCost, 0);
    const totalItems = data.reduce((acc, curr) => acc + curr.totalItems, 0);
    const totalOccurrences = data.reduce((acc, curr) => acc + curr.totalCount, 0);
    const averageTicket = totalOccurrences > 0 ? totalCost / totalOccurrences : 0;

    return (
        <div className={styles.container}>
            <PageHeader
                title={t('qualityIndividual.title', 'Desempenho Individual')}
                subtitle={t('qualityIndividual.desc', 'Performance detalhada por colaborador.')}
            />

            <div className={styles.content}>
                <DashboardFilter
                    onChange={handleFilterChange}
                    hideOriginType={true} // Hide the selector
                />

                {loading ? (
                    <div className={styles.loading}>{t('common.loading', 'Carregando...')}</div>
                ) : (
                    <>
                        <div className={styles.kpiContainer}>
                            <StatCard
                                title={t('quality.totalCostInternal', 'Custo Total (Interno)')}
                                value={formatCurrency(totalCost)}
                                icon={<DollarSign size={24} />}
                                color="blue"
                            />
                            <StatCard
                                title={t('quality.totalItems', 'Quantidade Total')}
                                value={String(totalItems)}
                                icon={<Package size={24} />}
                                color="purple"
                            />
                            <StatCard
                                title={t('quality.totalCount', 'Ocorrências')}
                                value={String(totalOccurrences)}
                                icon={<PieChart size={24} />}
                                color="yellow"
                            />
                            <StatCard
                                title={t('quality.averageTicket', 'Ticket Médio')}
                                value={formatCurrency(averageTicket)}
                                icon={<DollarSign size={24} />}
                                color="green"
                            />
                        </div>

                        <div className={styles.tableCard}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th scope="col">
                                            {t('qualityAnalytics.responsible', 'Responsável')}
                                        </th>
                                        <th scope="col" className={styles.right}>
                                            {t('quality.cost', 'Custo')}
                                        </th>
                                        <th scope="col" className={styles.right}>
                                            {t('quality.totalOccurrences', 'Qtd. Itens')}
                                        </th>
                                        <th scope="col">
                                            % {t('quality.shareTotal', 'Part. Global')}
                                        </th>
                                        <th scope="col">
                                            % {t('quality.shareCell', 'Part. na Célula')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map((item, idx) => (
                                        <tr
                                            key={idx}
                                            onClick={() => {
                                                setSelectedResponsible(item.name);
                                                setModalOpen(true);
                                            }}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <td>
                                                <div className={styles.userCell}>
                                                    <div className={styles.avatar}>
                                                        {item.name.slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className={styles.userName}>{item.name}</div>
                                                </div>
                                            </td>
                                            <td className={styles.right}>
                                                {formatCurrency(item.totalCost)}
                                            </td>
                                            <td className={`${styles.right} ${styles.subtle}`}>
                                                {item.totalItems}
                                            </td>
                                            <td>
                                                <div className={styles.progressWrapper}>
                                                    <div className={styles.progressLabel}>
                                                        <span>{formatPercent(item.shareTotal)}</span>
                                                    </div>
                                                    <div className={styles.progressTrack}>
                                                        <div
                                                            className={`${styles.progressBar} ${styles.barBlue}`}
                                                            style={{ width: `${Math.min(item.shareTotal, 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className={styles.progressWrapper}>
                                                    <div className={styles.progressLabel}>
                                                        <span>{formatPercent(item.shareCell)}</span>
                                                    </div>
                                                    <div className={styles.progressTrack}>
                                                        <div
                                                            className={`${styles.progressBar} ${styles.barOrange}`}
                                                            style={{ width: `${Math.min(item.shareCell, 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {data.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className={styles.emptyState}>
                                                {t('common.noData', 'Nenhum dado encontrado para o período.')}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {/* Drill Down Modal */}
            <QualityDrillDownModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={selectedResponsible || ''}
                filters={{
                    dataInicio: filter.start,
                    dataFim: filter.end,
                    tipo: 'INTERNO', // Always internal for this view
                    origem: filter.origem,
                    responsavel: selectedResponsible || undefined
                }}
            />
        </div >
    );
}
