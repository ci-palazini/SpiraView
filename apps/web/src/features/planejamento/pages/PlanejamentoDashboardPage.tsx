// apps/web/src/features/planejamento/pages/PlanejamentoDashboardPage.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FiCalendar, FiUploadCloud, FiAlertTriangle, FiCheckCircle, FiActivity, FiLayers } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    Cell,
    LabelList,
} from 'recharts';

import { listarResumoCapacidade, type ResumoCapacidade } from '../../../services/apiClient';
import PageHeader from '../../../shared/components/PageHeader';
import styles from './PlanejamentoDashboardPage.module.css';

interface User {
    role?: string;
    email?: string;
}

interface PlanejamentoDashboardPageProps {
    user?: User;
}

export default function PlanejamentoDashboardPage({ user }: PlanejamentoDashboardPageProps) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ResumoCapacidade[]>([]);
    const [uploadId, setUploadId] = useState<string | undefined>(undefined);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const result = await listarResumoCapacidade({ role: user?.role, email: user?.email });
            setData(result.items || []);
            setUploadId(result.uploadId);
        } catch (err) {
            console.error('Erro ao buscar resumo:', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Estatísticas
    // Estatísticas (Segundo Gráfico - Geral)
    const totalCentros = data.length;
    const totalCargaHoras = data.reduce((sum, d) => sum + d.cargaHoras, 0);
    const totalCapacidade = data.reduce((sum, d) => sum + d.capacidade, 0);
    const centrosSobrecarga = data.filter(d => d.sobrecarga).length;

    // Estatísticas (Primeiro Gráfico - Mensal)
    const totalCargaOP = data.reduce((sum, d) => sum + d.cargaOP, 0);
    const totalCapacidadeRestante = data.reduce((sum, d) => sum + d.capacidadeRestante, 0);
    const totalSobrecarga = data.reduce((sum, d) => sum + Math.max(0, d.cargaOP - d.capacidadeRestante), 0);
    const centrosDeficitMensal = data.filter(d => d.cargaOP > d.capacidadeRestante).length;

    // Formatar dados para o gráfico
    const chartData = useMemo(() => {
        return data.map((d) => ({
            name: d.centroTrabalho,
            cargaOP: Math.round(d.cargaOP * 10) / 10,
            cargaHoras: Math.round(d.cargaHoras * 10) / 10,
            cargaResto: Math.max(0, Math.round((d.cargaHoras - d.cargaOP) * 10) / 10),
            capacidade: Math.round(d.capacidade * 10) / 10,
            capacidadeRestante: Math.round(d.capacidadeRestante * 10) / 10,
            sobrecarga: d.sobrecarga,
        }));
    }, [data]);

    // Custom tooltip
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const item = data.find(d => d.centroTrabalho === label);
            // Payload 0 = Carga OP
            // Payload 1 = Carga Resto (mas queremos mostrar o Total Horas)
            // Payload 2 = Capacidade

            return (
                <div style={{
                    background: 'white',
                    padding: '12px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}>
                    <p style={{ fontWeight: 600, marginBottom: 8, color: '#1e293b' }}>{label}</p>
                    <p style={{ color: '#3b82f6', margin: '4px 0' }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, background: '#3b82f6', borderRadius: 2, marginRight: 8 }}></span>
                        Carga OP: <strong>{item?.cargaOP.toFixed(1)}h</strong>
                    </p>
                    <p style={{ color: '#94a3b8', margin: '4px 0' }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, background: '#94a3b8', borderRadius: 2, marginRight: 8 }}></span>
                        Carga Horas: <strong>{item?.cargaHoras.toFixed(1)}h</strong>
                    </p>
                    <p style={{ color: '#22c55e', margin: '4px 0' }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, background: '#22c55e', borderRadius: 2, marginRight: 8 }}></span>
                        Capacidade: <strong>{item?.capacidade.toFixed(1)}h</strong>
                    </p>
                    {item?.sobrecarga && (
                        <p style={{ color: '#dc2626', fontWeight: 500, marginTop: 8, fontSize: '0.85rem' }}>
                            ⚠️ Centro em sobrecarga!
                        </p>
                    )}
                </div>
            );
        }
        return null;
    };

    // Tooltip for Chart 1 (Monthly)
    const MonthlyTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const item = data.find(d => d.centroTrabalho === label);
            const overloaded = item && item.cargaOP > item.capacidadeRestante && item.capacidadeRestante > 0;
            return (
                <div style={{
                    background: 'white',
                    padding: '12px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}>
                    <p style={{ fontWeight: 600, marginBottom: 8, color: '#1e293b' }}>{label}</p>
                    <p style={{ color: '#3b82f6', margin: '4px 0' }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, background: '#3b82f6', borderRadius: 2, marginRight: 8 }}></span>
                        Carga OP: <strong>{item?.cargaOP.toFixed(1)}h</strong>
                    </p>
                    <p style={{ color: '#22c55e', margin: '4px 0' }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, background: '#22c55e', borderRadius: 2, marginRight: 8 }}></span>
                        Cap. Restante: <strong>{item?.capacidadeRestante.toFixed(1)}h</strong>
                    </p>
                    {overloaded && (
                        <p style={{ color: '#dc2626', fontWeight: 500, marginTop: 8, fontSize: '0.85rem' }}>
                            ⚠️ Carga OP excede capacidade restante!
                        </p>
                    )}
                </div>
            );
        }
        return null;
    };



    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingContainer}>
                    <div className={styles.spinner}></div>
                </div>
            </div>
        );
    }

    /* PageHeader handles layout consistency */
    return (
        <>
            <PageHeader
                title={t('planejamento.title', 'Planejamento')}
                subtitle={t('planejamento.dashboardSubtitle', 'Painel de Carga e Capacidade')}
            />
            <div className={styles.container}>

                {data.length === 0 ? (
                    <div className={styles.chartCard}>
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}>
                                <FiCalendar />
                            </div>
                            <h2>{t('planejamento.emConstrucao', 'Sem Dados de Capacidade')}</h2>
                            <p>
                                {t('planejamento.emConstrucaoDesc', 'Faça o upload de um arquivo Excel com as reservas de capacidade para visualizar o painel.')}
                            </p>
                            <Link to="/planejamento/upload" className={styles.uploadLink}>
                                <FiUploadCloud />
                                {t('planejamento.goToUpload', 'Fazer Upload')}
                            </Link>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Stats */}
                        {/* New Stats for First Chart */}
                        <div className={styles.statsGrid}>
                            <div className={styles.statCard}>
                                <div className={`${styles.statIcon} ${styles.statIconBlue}`}>
                                    <FiLayers />
                                </div>
                                <div className={styles.statContent}>
                                    <h3>{totalCargaOP.toFixed(0)}h</h3>
                                    <p>{t('planejamento.stats.totalOpLoad', 'Carga OP Total')}</p>
                                </div>
                            </div>
                            <div className={styles.statCard}>
                                <div className={`${styles.statIcon} ${styles.statIconGreen}`}>
                                    <FiCheckCircle />
                                </div>
                                <div className={styles.statContent}>
                                    <h3>{totalCapacidadeRestante.toFixed(0)}h</h3>
                                    <p>{t('planejamento.stats.totalRemainingCapacity', 'Capacidade Restante')}</p>
                                </div>
                            </div>
                            <div className={styles.statCard}>
                                <div className={`${styles.statIcon} ${styles.statIconRed}`}>
                                    <FiAlertTriangle />
                                </div>
                                <div className={styles.statContent}>
                                    <h3>{totalSobrecarga.toFixed(0)}h</h3>
                                    <p>{t('planejamento.stats.totalOverload', 'Sobrecarga Total')}</p>
                                </div>
                            </div>
                            <div className={styles.statCard}>
                                <div className={`${styles.statIcon} ${styles.statIconOrange}`}>
                                    <FiActivity />
                                </div>
                                <div className={styles.statContent}>
                                    <h3>{centrosDeficitMensal}</h3>
                                    <p>{t('planejamento.stats.deficitCenters', 'Centros com Déficit')}</p>
                                </div>
                            </div>
                        </div>


                        {/* Chart 1: Análise da Capacidade Mensal vs Plano do Mês */}
                        <div className={styles.chartCard}>
                            <div className={styles.chartHeader}>
                                <div>
                                    <h2 className={styles.chartTitle}>
                                        {t('planejamento.chart.monthlyTitle', 'Análise da Capacidade Mensal vs Plano do Mês')}
                                    </h2>
                                    <p className={styles.chartSubtitle}>
                                        {t('planejamento.chart.monthlySubtitle', 'Carga OP vs Capacidade Restante (proporcional aos dias úteis)')}
                                    </p>
                                </div>
                                <div className={styles.legendContainer}>
                                    <div className={styles.legendItem}>
                                        <span className={`${styles.legendDot} ${styles.dotOP}`}></span>
                                        Carga OP
                                    </div>
                                    <div className={styles.legendItem}>
                                        <span className={`${styles.legendDot} ${styles.dotCapacidade}`}></span>
                                        Cap. Restante
                                    </div>
                                </div>
                            </div>

                            <ResponsiveContainer width="100%" height={400}>
                                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fill: '#64748b', fontSize: 12 }}
                                        angle={-45}
                                        textAnchor="end"
                                        height={80}
                                    />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                                    <Tooltip content={<MonthlyTooltip />} />
                                    <Bar dataKey="cargaOP" name="Carga OP" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                                        <LabelList
                                            dataKey="cargaOP"
                                            position="top"
                                            style={{ fill: '#1e3a8a', fontSize: 11, fontWeight: 600 }}
                                            formatter={(v: any) => v > 0 ? Number(v).toFixed(0) : ''}
                                        />
                                    </Bar>
                                    <Bar dataKey="capacidadeRestante" name="Cap. Restante" fill="#22c55e" radius={[4, 4, 0, 0]}>
                                        <LabelList
                                            dataKey="capacidadeRestante"
                                            position="top"
                                            style={{ fill: '#14532d', fontSize: 11, fontWeight: 600 }}
                                            formatter={(v: any) => v > 0 ? Number(v).toFixed(0) : ''}
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Existing Stats (Moved Below First Chart) */}
                        <div className={styles.statsGrid}>
                            <div className={styles.statCard}>
                                <div className={`${styles.statIcon} ${styles.statIconBlue}`}>
                                    <FiLayers />
                                </div>
                                <div className={styles.statContent}>
                                    <h3>{totalCentros}</h3>
                                    <p>{t('planejamento.stats.workCenters', 'Centros de Trabalho')}</p>
                                </div>
                            </div>
                            <div className={styles.statCard}>
                                <div className={`${styles.statIcon} ${styles.statIconOrange}`}>
                                    <FiActivity />
                                </div>
                                <div className={styles.statContent}>
                                    <h3>{totalCargaHoras.toFixed(0)}h</h3>
                                    <p>{t('planejamento.stats.totalLoad', 'Carga Total')}</p>
                                </div>
                            </div>
                            <div className={styles.statCard}>
                                <div className={`${styles.statIcon} ${styles.statIconGreen}`}>
                                    <FiCheckCircle />
                                </div>
                                <div className={styles.statContent}>
                                    <h3>{totalCapacidade.toFixed(0)}h</h3>
                                    <p>{t('planejamento.stats.totalCapacity', 'Capacidade Total')}</p>
                                </div>
                            </div>
                            <div className={styles.statCard}>
                                <div className={`${styles.statIcon} ${styles.statIconRed}`}>
                                    <FiAlertTriangle />
                                </div>
                                <div className={styles.statContent}>
                                    <h3>{centrosSobrecarga}</h3>
                                    <p>{t('planejamento.stats.overloaded', 'Em Sobrecarga')}</p>
                                </div>
                            </div>
                        </div>

                        {/* Chart 2: Análise da Capacidade (30 dias) vs Necessidade Total */}
                        <div className={styles.chartCard}>
                            <div className={styles.chartHeader}>
                                <div>
                                    <h2 className={styles.chartTitle}>
                                        {t('planejamento.chart.thirtyDayTitle', 'Análise da Capacidade (30 dias) vs Necessidade Total')}
                                    </h2>
                                    <p className={styles.chartSubtitle}>
                                        {t('planejamento.chart.thirtyDaySubtitle', 'Ordem de Venda + IQM')}
                                    </p>
                                </div>
                                <div className={styles.legendContainer}>
                                    <div className={styles.legendItem}>
                                        <span className={`${styles.legendDot} ${styles.dotOP}`}></span>
                                        Carga OP
                                    </div>
                                    <div className={styles.legendItem}>
                                        <span className={`${styles.legendDot} ${styles.dotHoras}`}></span>
                                        Carga Horas
                                    </div>
                                    <div className={styles.legendItem}>
                                        <span className={`${styles.legendDot} ${styles.dotCapacidade}`}></span>
                                        Capacidade
                                    </div>
                                </div>
                            </div>

                            <ResponsiveContainer width="100%" height={500}>
                                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fill: '#64748b', fontSize: 12 }}
                                        angle={-45}
                                        textAnchor="end"
                                        height={80}
                                    />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    {/* Carga OP (Base - Azul) */}
                                    <Bar dataKey="cargaOP" name="Carga OP" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]}>
                                        <LabelList
                                            dataKey="cargaOP"
                                            position="insideTop"
                                            style={{ fill: '#fff', fontSize: 11, fontWeight: 700 }}
                                            formatter={(v: any) => v > 0 ? Number(v).toFixed(0) : ''}
                                        />
                                    </Bar>

                                    {/* Carga Resto (Topo - Cinza) -> Representa o Total (Horas) visualmente */}
                                    <Bar dataKey="cargaResto" name="Carga Horas" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]}>
                                        <LabelList
                                            dataKey="cargaHoras"
                                            position="top"
                                            style={{ fill: '#475569', fontSize: 11, fontWeight: 600 }}
                                            formatter={(v: any) => v > 0 ? Number(v).toFixed(0) : ''}
                                        />
                                    </Bar>
                                    {/* Capacidade (Separada) */}
                                    <Bar dataKey="capacidade" name="Capacidade" fill="#22c55e" radius={[4, 4, 0, 0]}>
                                        <LabelList dataKey="capacidade" position="top" style={{ fill: '#14532d', fontSize: 11, fontWeight: 600 }} formatter={(v: any) => v > 0 ? Number(v).toFixed(0) : ''} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Table */}
                        <div className={styles.chartCard}>
                            <h2 className={styles.chartTitle} style={{ marginBottom: '1rem' }}>
                                {t('planejamento.table.title', 'Detalhes por Centro de Trabalho')}
                            </h2>
                            <div className={styles.tableContainer}>
                                <table className={styles.dataTable}>
                                    <thead>
                                        <tr>
                                            <th>{t('planejamento.table.workCenter', 'Centro de Trabalho')}</th>
                                            <th>{t('planejamento.table.loadOP', 'Carga OP')}</th>
                                            <th>{t('planejamento.table.loadHours', 'Carga Horas')}</th>
                                            <th>{t('planejamento.table.capacity', 'Capacidade')}</th>
                                            <th>{t('planejamento.table.occupation', '% Ocupação')}</th>
                                            <th>{t('planejamento.table.status', 'Status')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.map((item) => (
                                            <tr key={item.centroTrabalho}>
                                                <td>{item.centroTrabalho}</td>
                                                <td>{item.cargaOP.toFixed(1)}h</td>
                                                <td>{item.cargaHoras.toFixed(1)}h</td>
                                                <td>{item.capacidade > 0 ? `${item.capacidade.toFixed(0)}h` : '—'}</td>
                                                <td>
                                                    {item.capacidade > 0 ? (
                                                        <span style={{
                                                            color: item.percentualOcupacao > 100 ? '#dc2626' :
                                                                item.percentualOcupacao > 80 ? '#f59e0b' : '#16a34a',
                                                            fontWeight: 500
                                                        }}>
                                                            {item.percentualOcupacao}%
                                                        </span>
                                                    ) : '—'}
                                                </td>
                                                <td>
                                                    {item.capacidade === 0 ? (
                                                        <span className={`${styles.badge} ${styles.badgeGray}`}>
                                                            {t('planejamento.table.noCapacity', 'Sem meta')}
                                                        </span>
                                                    ) : item.sobrecarga ? (
                                                        <span className={`${styles.badge} ${styles.badgeRed}`}>
                                                            {t('planejamento.table.overloaded', 'Sobrecarga')}
                                                        </span>
                                                    ) : (
                                                        <span className={`${styles.badge} ${styles.badgeGreen}`}>
                                                            {t('planejamento.table.ok', 'OK')}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
