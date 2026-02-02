import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { startOfYear, endOfYear, startOfMonth, endOfMonth, startOfWeek, endOfWeek, format, subMonths } from 'date-fns';
import styles from './DashboardFilter.module.css';

export type Period = 'current_year' | 'current_month' | 'last_month' | 'current_week' | 'custom';

interface Props {
    onChange: (period: Period, start?: string, end?: string) => void;
}

export default function DashboardFilter({ onChange }: Props) {
    const { t } = useTranslation();
    const [period, setPeriod] = useState<Period>('current_month');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    useEffect(() => {
        applyFilter(period);
    }, []); // Run once on mount

    const applyFilter = (p: Period, cStart?: string, cEnd?: string) => {
        const now = new Date();
        let start = '';
        let end = '';

        switch (p) {
            case 'current_year':
                start = format(startOfYear(now), 'yyyy-MM-dd');
                end = format(endOfYear(now), 'yyyy-MM-dd');
                break;
            case 'current_month':
                start = format(startOfMonth(now), 'yyyy-MM-dd');
                end = format(endOfMonth(now), 'yyyy-MM-dd');
                break;
            case 'last_month':
                const last = subMonths(now, 1);
                start = format(startOfMonth(last), 'yyyy-MM-dd');
                end = format(endOfMonth(last), 'yyyy-MM-dd');
                break;
            case 'current_week':
                start = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'); // Monday start
                end = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
                break;
            case 'custom':
                if (cStart && cEnd) {
                    start = cStart;
                    end = cEnd;
                }
                break;
        }

        if (p !== 'custom' || (start && end)) {
            onChange(p, start, end);
        }
    };

    const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const p = e.target.value as Period;
        setPeriod(p);
        if (p !== 'custom') {
            applyFilter(p);
        }
    };

    return (
        <div className={styles.filterContainer}>
            <div className={styles.filterGroup}>
                <label>{t('common.period', 'Período')}:</label>
                <select value={period} onChange={handlePeriodChange} className={styles.select}>
                    <option value="current_month">{t('common.thisMonth', 'Mês Atual')}</option>
                    <option value="last_month">{t('common.lastMonth', 'Mês Passado')}</option>
                    <option value="current_year">{t('common.thisYear', 'Ano Atual')}</option>
                    <option value="current_week">{t('common.thisWeek', 'Semana Atual')}</option>
                    <option value="custom">{t('common.custom', 'Personalizado')}</option>
                </select>
            </div>

            {period === 'custom' && (
                <div className={styles.customDates}>
                    <input
                        type="date"
                        value={customStart}
                        onChange={(e) => {
                            setCustomStart(e.target.value);
                            if (e.target.value && customEnd) applyFilter('custom', e.target.value, customEnd);
                        }}
                        className={styles.input}
                    />
                    <span>{t('common.to', 'até')}</span>
                    <input
                        type="date"
                        value={customEnd}
                        onChange={(e) => {
                            setCustomEnd(e.target.value);
                            if (customStart && e.target.value) applyFilter('custom', customStart, e.target.value);
                        }}
                        className={styles.input}
                    />
                </div>
            )}
        </div>
    );
}
