import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import PageHeader from '../../../shared/components/PageHeader';
import { ehsComplianceMensal } from '../../../services/apiClient';
import type { SafetyComplianceMensal } from '@spiraview/shared';
import styles from './SafetyCompliancePage.module.css';

const MONTH_KEYS = [
    'common.months.jan', 'common.months.feb', 'common.months.mar',
    'common.months.apr', 'common.months.may', 'common.months.jun',
    'common.months.jul', 'common.months.aug', 'common.months.sep',
    'common.months.oct', 'common.months.nov', 'common.months.dec',
];

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function SafetyCompliancePage() {
    const { t } = useTranslation();
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-indexed

    const [ano, setAno] = useState(currentYear);
    const [data, setData] = useState<SafetyComplianceMensal[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await ehsComplianceMensal(ano);
            setData(res.items || []);
        } catch {
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [ano]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Compute summary stats
    const totalUsers = data.length;
    const monthCounts = Array.from({ length: 12 }, (_, m) =>
        data.filter((u) => u.meses[m] > 0).length
    );
    const complianceRates = monthCounts.map((c) => (totalUsers > 0 ? (c / totalUsers) * 100 : 0));
    
    // Only consider past/current months for the selected year
    const maxMonth = ano === currentYear ? currentMonth : 11;
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

    const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

    return (
        <>
            <PageHeader
                title={t('ehs.compliance.title', 'Compliance BBS Mensal')}
                subtitle={t('ehs.compliance.subtitle', 'Acompanhe a conformidade mensal de observações BBS por utilizador')}
            />

            <div className={styles.container}>
                {/* Year selector */}
                <div className={styles.yearSelector}>
                    <label>{t('ehs.compliance.year', 'Ano')}:</label>
                    <select value={ano} onChange={(e) => setAno(Number(e.target.value))}>
                        {yearOptions.map((y) => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>

                {loading ? (
                    <div className={styles.loading}>{t('common.loading', 'Carregando...')}</div>
                ) : data.length === 0 ? (
                    <div className={styles.emptyState}>{t('ehs.compliance.empty', 'Nenhum utilizador ativo encontrado.')}</div>
                ) : (
                    <>
                        {/* Summary bar */}
                        <div className={styles.summaryBar}>
                            <div className={styles.summaryCard}>
                                <p className={styles.summaryValue} style={{ color: '#334155' }}>
                                    {overallCompliance.toFixed(1)}%
                                </p>
                                <p className={styles.summaryLabel}>
                                    {t('ehs.compliance.overall', 'Compliance Geral')}
                                </p>
                            </div>
                            {bestMonthIdx >= 0 && (
                                <div className={styles.summaryCard}>
                                    <p className={styles.summaryValue} style={{ color: '#16a34a' }}>
                                        {MONTH_SHORT[bestMonthIdx]}
                                    </p>
                                    <p className={styles.summaryLabel}>
                                        {t('ehs.compliance.best_month', 'Melhor Mês')} ({complianceRates[bestMonthIdx].toFixed(0)}%)
                                    </p>
                                </div>
                            )}
                            {worstMonthIdx >= 0 && (
                                <div className={styles.summaryCard}>
                                    <p className={styles.summaryValue} style={{ color: '#dc2626' }}>
                                        {MONTH_SHORT[worstMonthIdx]}
                                    </p>
                                    <p className={styles.summaryLabel}>
                                        {t('ehs.compliance.worst_month', 'Pior Mês')} ({complianceRates[worstMonthIdx].toFixed(0)}%)
                                    </p>
                                </div>
                            )}
                            <div className={styles.summaryCard}>
                                <p className={styles.summaryValue} style={{ color: '#334155' }}>
                                    {totalUsers}
                                </p>
                                <p className={styles.summaryLabel}>
                                    {t('ehs.compliance.active_users', 'Utilizadores Ativos')}
                                </p>
                            </div>
                        </div>

                        {/* Compliance table */}
                        <div className={styles.tableWrapper}>
                            <table className={styles.complianceTable}>
                                <thead>
                                    <tr>
                                        <th>{t('ehs.compliance.col_name', 'Nome')}</th>
                                        <th>{t('ehs.compliance.col_function', 'Função')}</th>
                                        {MONTH_SHORT.map((m, i) => (
                                            <th key={i}>{m}</th>
                                        ))}
                                        <th>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map((user) => {
                                        const total = user.meses.reduce((a, b) => a + b, 0);
                                        return (
                                            <tr key={user.usuarioId}>
                                                <td className={styles.nameCol}>{user.nome}</td>
                                                <td className={styles.funcaoCol}>{user.funcao || '—'}</td>
                                                {user.meses.map((count, m) => {
                                                    const isFuture = ano === currentYear && m > currentMonth;
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
