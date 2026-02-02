import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { startOfYear, endOfYear, startOfMonth, endOfMonth, startOfWeek, endOfWeek, format, subMonths } from 'date-fns';
import { listarOrigens, QualidadeOpcao } from '../../../services/apiClient';
import styles from './DashboardFilter.module.css';

export type Period = 'current_year' | 'current_month' | 'last_month' | 'current_week' | 'custom';

interface Props {
    onChange: (period: Period, start?: string, end?: string, tipo?: string, origem?: string) => void;
}

export default function DashboardFilter({ onChange }: Props) {
    const { t } = useTranslation();
    const [period, setPeriod] = useState<Period>('current_month');
    const [tipo, setTipo] = useState('');
    const [origem, setOrigem] = useState('');
    const [origensList, setOrigensList] = useState<QualidadeOpcao[]>([]);
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    useEffect(() => {
        applyFilter(period, tipo, origem);
    }, []); // Run once on mount

    useEffect(() => {
        fetchOrigens(tipo);
    }, [tipo]);

    const fetchOrigens = async (t?: string) => {
        try {
            const data = await listarOrigens(false, t || undefined);
            setOrigensList(data);

            // If current selected origin is not in the new list, reset it
            if (origem && !data.find((o: QualidadeOpcao) => o.nome === origem)) {
                setOrigem('');
                applyFilter(period, tipo, '', customStart, customEnd);
            }
        } catch (err) {
            console.error('Failed to fetch origins', err);
        }
    };

    const applyFilter = (p: Period, tOrigem?: string, oEspecifica?: string, cStart?: string, cEnd?: string) => {
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
            onChange(p, start, end, tOrigem, oEspecifica);
        }
    };

    const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const p = e.target.value as Period;
        setPeriod(p);
        if (p !== 'custom') {
            applyFilter(p, tipo, origem);
        }
    };

    const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const tVal = e.target.value;
        setTipo(tVal);
        // Origem filtering is handled by the useEffect and fetchOrigens
        applyFilter(period, tVal, origem, customStart, customEnd);
    };

    const handleOrigemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const oVal = e.target.value;
        setOrigem(oVal);
        applyFilter(period, tipo, oVal, customStart, customEnd);
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

            <div className={styles.filterGroup}>
                <label>{t('qualityAnalytics.filterOriginType', 'Tipo de Origem')}:</label>
                <select value={tipo} onChange={handleTypeChange} className={styles.select}>
                    <option value="">{t('qualityAnalytics.allTypes', 'Todos os Tipos')}</option>
                    <option value="INTERNO">{t('qualityAnalytics.internal', 'Interno')}</option>
                    <option value="EXTERNO">{t('qualityAnalytics.external', 'Externo')}</option>
                </select>
            </div>

            <div className={styles.filterGroup}>
                <label>{t('qualityAnalytics.filterOrigin', 'Origem')}:</label>
                <select value={origem} onChange={handleOrigemChange} className={styles.select}>
                    <option value="">{t('qualityAnalytics.all', 'Todas')}</option>
                    {origensList.map(opt => (
                        <option key={opt.id} value={opt.nome}>{opt.nome}</option>
                    ))}
                </select>
            </div>

            {period === 'custom' && (
                <div className={styles.customDates}>
                    <input
                        type="date"
                        value={customStart}
                        onChange={(e) => {
                            setCustomStart(e.target.value);
                            if (e.target.value && customEnd) applyFilter('custom', tipo, origem, e.target.value, customEnd);
                        }}
                        className={styles.input}
                    />
                    <span>{t('common.to', 'até')}</span>
                    <input
                        type="date"
                        value={customEnd}
                        onChange={(e) => {
                            setCustomEnd(e.target.value);
                            if (customStart && e.target.value) applyFilter('custom', tipo, origem, customStart, e.target.value);
                        }}
                        className={styles.input}
                    />
                </div>
            )}
        </div>
    );
}
