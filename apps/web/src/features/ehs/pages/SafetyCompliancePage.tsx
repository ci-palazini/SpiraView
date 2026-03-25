import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FiTrendingUp, FiAward, FiAlertCircle, FiUsers, FiActivity, FiEye, FiBarChart2, FiTable } from 'react-icons/fi';
import PageHeader from '../../../shared/components/PageHeader';
import { ehsComplianceMensal, ehsStatsAvancadas, listDepartamentos } from '../../../services/apiClient';
import type { SafetyComplianceMensal, Departamento, StatsAvancadas } from '@spiraview/shared';
import DepartmentFilter from '../components/DepartmentFilter';
import EvolucaoTemporalChart from '../components/EvolucaoTemporalChart';
import RankingDepartamentosTable from '../components/RankingDepartamentosTable';
import ComparacaoPeriodosCards from '../components/ComparacaoPeriodosCards';
import styles from './SafetyCompliancePage.module.css';

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

type TabType = 'overview' | 'evolution' | 'departments';

export default function SafetyCompliancePage() {
    const { t } = useTranslation();
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-indexed

    const [data, setData] = useState<SafetyComplianceMensal[]>([]);
    const [stats, setStats] = useState<StatsAvancadas | null>(null);
    const [loading, setLoading] = useState(true);
    const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
    const [selectedDepartamentos, setSelectedDepartamentos] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<TabType>('overview');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [complianceRes, statsRes, deptsRes] = await Promise.all([
                ehsComplianceMensal(currentYear),
                ehsStatsAvancadas(currentYear),
                listDepartamentos(),
            ]);
            setData(complianceRes.items || []);
            setStats(statsRes.items?.[0] || null);
            setDepartamentos(deptsRes.items || []);
        } catch {
            setData([]);
            setStats(null);
            setDepartamentos([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleDepartmentClick = (departamentoId: string) => {
        setSelectedDepartamentos([departamentoId]);
        setActiveTab('overview');
    };

    // Filter data by selected departamentos
    const filteredData = selectedDepartamentos.length > 0
        ? data.filter((u) => selectedDepartamentos.includes(u.departamentoId || ''))
        : data;

    // Compute summary stats
    const totalUsers = filteredData.length;
    const monthCounts = Array.from({ length: 12 }, (_, m) =>
        filteredData.filter((u) => u.meses[m] > 0).length
    );
    const complianceRates = monthCounts.map((c) => (totalUsers > 0 ? (c / totalUsers) * 100 : 0));

    // Only consider past/current months for the selected year
    const maxMonth = currentMonth;
    const validRates = complianceRates.slice(0, maxMonth + 1);
    const overallCompliance = validRates.length > 0
        ? validRates.reduce((a, b) => a + b, 0) / validRates.length
        : 0;
    
    const bestMonthIdx = validRates.length > 0
        ? validRates.indexOf(Math.max(...validRates))
        : -1;
    const worstMonthIdx = validRates.length > 0
        ? validRates.indexOf(Math.min(...validRates))
        : -1;

    // Current month compliance count
    const currentMonthCompliance = filteredData.filter(u => u.meses[currentMonth] > 0).length;

    return (
        <>
            <PageHeader
                title={t('ehs.compliance.title', 'Compliance BBS Mensal')}
                subtitle={t('ehs.compliance.subtitle', 'Acompanhe a conformidade mensal de observações BBS por utilizador')}
            />

            <div className={styles.container}>
                {loading ? (
                    <div className={styles.loading}>{t('common.loading', 'Carregando...')}</div>
                ) : data.length === 0 ? (
                    <div className={styles.emptyState}>{t('ehs.compliance.empty', 'Nenhum utilizador ativo encontrado.')}</div>
                ) : (
                    <>
                        {/* Tab Navigation */}
                        <div className={styles.tabsContainer}>
                            <nav className={styles.tabsList}>
                                <button
                                    className={`${styles.tabButton} ${activeTab === 'overview' ? styles.tabActive : ''}`}
                                    onClick={() => setActiveTab('overview')}
                                >
                                    <FiEye size={18} />
                                    <span>Visão Geral</span>
                                </button>
                                <button
                                    className={`${styles.tabButton} ${activeTab === 'evolution' ? styles.tabActive : ''}`}
                                    onClick={() => setActiveTab('evolution')}
                                >
                                    <FiTrendingUp size={18} />
                                    <span>Evolução</span>
                                </button>
                                <button
                                    className={`${styles.tabButton} ${activeTab === 'departments' ? styles.tabActive : ''}`}
                                    onClick={() => setActiveTab('departments')}
                                >
                                    <FiBarChart2 size={18} />
                                    <span>Departamentos</span>
                                </button>
                            </nav>
                        </div>

                        {/* Tab Content */}
                        <div className={styles.tabContent}>
                            {/* VISÃO GERAL TAB (Overview + Details) */}
                            {activeTab === 'overview' && (
                                <div className={`${styles.tabPane} ${styles.fadeIn}`}>
                                    <div className={styles.summaryBar}>
                                        <div className={styles.summaryCard}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                                                <FiTrendingUp size={24} style={{ color: '#1e40af' }} />
                                            </div>
                                            <p className={styles.summaryValue} style={{ color: '#1e40af' }}>
                                                {overallCompliance.toFixed(1)}%
                                            </p>
                                            <p className={styles.summaryLabel}>
                                                {t('ehs.compliance.overall', 'Compliance Geral')}
                                            </p>
                                        </div>
                                        {bestMonthIdx >= 0 && (
                                            <div className={styles.summaryCard}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                                                    <FiAward size={24} style={{ color: '#10b981' }} />
                                                </div>
                                                <p className={styles.summaryValue} style={{ color: '#10b981' }}>
                                                    {MONTH_SHORT[bestMonthIdx]}
                                                </p>
                                                <p className={styles.summaryLabel}>
                                                    {t('ehs.compliance.best_month', 'Melhor Mês')} ({complianceRates[bestMonthIdx].toFixed(0)}%)
                                                </p>
                                            </div>
                                        )}
                                        {worstMonthIdx >= 0 && (
                                            <div className={styles.summaryCard}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                                                    <FiAlertCircle size={24} style={{ color: '#ef4444' }} />
                                                </div>
                                                <p className={styles.summaryValue} style={{ color: '#ef4444' }}>
                                                    {MONTH_SHORT[worstMonthIdx]}
                                                </p>
                                                <p className={styles.summaryLabel}>
                                                    {t('ehs.compliance.worst_month', 'Pior Mês')} ({complianceRates[worstMonthIdx].toFixed(0)}%)
                                                </p>
                                            </div>
                                        )}
                                        <div className={styles.summaryCard}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                                                <FiUsers size={24} style={{ color: '#64748b' }} />
                                            </div>
                                            <p className={styles.summaryValue} style={{ color: '#1e293b' }}>
                                                {totalUsers}
                                            </p>
                                            <p className={styles.summaryLabel}>
                                                {t('ehs.compliance.active_users', 'Utilizadores Ativos')}
                                            </p>
                                        </div>
                                        <div className={styles.summaryCard}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                                                <FiActivity size={24} style={{ color: '#0ea5e9' }} />
                                            </div>
                                            <p className={styles.summaryValue} style={{ color: '#0ea5e9' }}>
                                                {currentMonthCompliance}
                                            </p>
                                            <p className={styles.summaryLabel}>
                                                {t('ehs.compliance.current_month', 'Mês Atual')} ({totalUsers > 0 ? ((currentMonthCompliance / totalUsers) * 100).toFixed(0) : 0}%)
                                            </p>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '32px' }}>
                                        <DepartmentFilter
                                            departamentos={departamentos}
                                            selectedDepartamentos={selectedDepartamentos}
                                            onChange={setSelectedDepartamentos}
                                        />

                                        <div className={styles.tableWrapper}>
                                            <table className={styles.complianceTable}>
                                                <thead>
                                                    <tr>
                                                        <th>{t('ehs.compliance.col_name', 'Nome')}</th>
                                                        <th>{t('ehs.compliance.col_function', 'Função')}</th>
                                                        <th>{t('departamento', 'Departamento')}</th>
                                                        {MONTH_SHORT.map((m, i) => (
                                                            <th key={i}>{m}</th>
                                                        ))}
                                                        <th>Total</th>
                                                        <th style={{ minWidth: '120px' }}>Taxa</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredData.map((user) => {
                                                        const total = user.meses.reduce((a, b) => a + b, 0);
                                                        const observedMonths = user.meses.slice(0, maxMonth + 1).filter(m => m > 0).length;
                                                        const complianceRate = maxMonth + 1 > 0 ? (observedMonths / (maxMonth + 1)) * 100 : 0;
                                                        const rateColor = complianceRate >= 80 ? '#10b981' : complianceRate >= 60 ? '#f59e0b' : '#ef4444';
                                                        return (
                                                            <tr key={user.usuarioId}>
                                                                <td className={styles.nameCol}>{user.nome}</td>
                                                                <td className={styles.funcaoCol}>{user.funcao || '—'}</td>
                                                                <td className={styles.funcaoCol}>{user.departamentoNome || '—'}</td>
                                                                {user.meses.map((count, m) => {
                                                                    const isFuture = m > currentMonth;
                                                                    const cls = isFuture
                                                                        ? styles.cellFuture
                                                                        : count > 0
                                                                            ? styles.cellGood
                                                                            : styles.cellBad;
                                                                    return (
                                                                        <td key={m} className={cls}>
                                                                            {isFuture ? '—' : count}
                                                                        </td>
                                                                    );
                                                                })}
                                                                <td className={styles.cellTotal}>{total}</td>
                                                                <td style={{ padding: '8px 12px' }}>
                                                                    <div className={styles.progressContainer}>
                                                                        <div className={styles.progressTrack}>
                                                                            <div 
                                                                                className={styles.progressFill} 
                                                                                style={{ 
                                                                                    width: `${Math.min(complianceRate, 100)}%`, 
                                                                                    background: rateColor 
                                                                                }} 
                                                                            />
                                                                        </div>
                                                                        <span className={styles.progressLabel} style={{ color: rateColor }}>
                                                                            {complianceRate.toFixed(0)}%
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* EVOLUTION TAB */}
                            {activeTab === 'evolution' && stats && (
                                <div className={`${styles.tabPane} ${styles.fadeIn}`}>
                                    <EvolucaoTemporalChart data={stats.evolucaoMensal} />
                                </div>
                            )}

                            {/* DEPARTMENTS TAB */}
                            {activeTab === 'departments' && stats && (
                                <div className={`${styles.tabPane} ${styles.fadeIn}`}>
                                    <RankingDepartamentosTable
                                        data={stats.rankingDepartamentos}
                                        onDepartmentClick={handleDepartmentClick}
                                    />
                                </div>
                            )}

                        </div>
                    </>
                )}
            </div>
        </>
    );
}
