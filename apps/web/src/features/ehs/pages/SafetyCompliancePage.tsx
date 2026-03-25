import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FiTrendingUp, FiAward, FiAlertCircle, FiUsers, FiActivity } from 'react-icons/fi';
import PageHeader from '../../../shared/components/PageHeader';
import { ehsComplianceMensal, listDepartamentos } from '../../../services/apiClient';
import type { SafetyComplianceMensal, Departamento } from '@spiraview/shared';
import DepartmentFilter from '../components/DepartmentFilter';
import styles from './SafetyCompliancePage.module.css';

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function SafetyCompliancePage() {
    const { t } = useTranslation();
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-indexed

    const [data, setData] = useState<SafetyComplianceMensal[]>([]);
    const [loading, setLoading] = useState(true);
    const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
    const [selectedDepartamentos, setSelectedDepartamentos] = useState<string[]>([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [complianceRes, deptsRes] = await Promise.all([
                ehsComplianceMensal(currentYear),
                listDepartamentos(),
            ]);
            setData(complianceRes.items || []);
            setDepartamentos(deptsRes.items || []);
        } catch {
            setData([]);
            setDepartamentos([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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
                        {/* Summary bar */}
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

                        {/* Filter section */}
                        <DepartmentFilter
                            departamentos={departamentos}
                            selectedDepartamentos={selectedDepartamentos}
                            onChange={setSelectedDepartamentos}
                        />

                        {/* Compliance table */}
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
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ flex: 1, height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)' }}>
                                                            <div style={{ height: '100%', width: `${Math.min(complianceRate, 100)}%`, background: rateColor, borderRadius: '4px', transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                                                        </div>
                                                        <span style={{ fontSize: '12px', fontWeight: 700, color: rateColor, minWidth: '35px', textAlign: 'right' }}>
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
                    </>
                )}
            </div>
        </>
    );
}
