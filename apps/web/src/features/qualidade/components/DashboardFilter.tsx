import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { startOfYear, endOfYear, startOfMonth, endOfMonth, startOfWeek, endOfWeek, format, subMonths } from 'date-fns';
import { listarOrigens, listarResponsaveisSettings, QualidadeOpcao } from '../../../services/apiClient';
import styles from './DashboardFilter.module.css';

import { MultiSelect } from '../../../shared/components';

export type Period = 'current_year' | 'current_month' | 'last_month' | 'current_week' | 'custom';

interface Props {
    onChange: (period: Period, start?: string, end?: string, tipo?: string, tipoLancamento?: string, origem?: string | string[], responsavel?: string | string[]) => void;
    hideOriginType?: boolean;
    hideEntityFilters?: boolean;
}

export default function DashboardFilter({ onChange, hideOriginType = false, hideEntityFilters = false }: Props) {
    const { t } = useTranslation();
    const [period, setPeriod] = useState<Period>('current_month');
    const [tipo, setTipo] = useState('');
    const [tipoLancamento, setTipoLancamento] = useState('');
    const [origem, setOrigem] = useState<string[]>([]);
    const [responsavel, setResponsavel] = useState<string[]>([]);
    const [origensList, setOrigensList] = useState<QualidadeOpcao[]>([]);
    const [responsaveisList, setResponsaveisList] = useState<QualidadeOpcao[]>([]);
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    useEffect(() => {
        applyFilter(period, tipo, tipoLancamento, origem, responsavel);
        fetchResponsaveis();
    }, []); // Run once on mount

    useEffect(() => {
        fetchOrigens(tipo);
    }, [tipo]);

    const fetchOrigens = async (t?: string) => {
        try {
            const data = await listarOrigens(false, t || undefined);
            setOrigensList(data);

            // If current selected origin is not in the new list, reset it
            if (origem.length > 0) {
                const validOrigens = origem.filter(o => data.find((d: QualidadeOpcao) => d.nome === o));
                if (validOrigens.length !== origem.length) {
                    setOrigem(validOrigens);
                    applyFilter(period, tipo, tipoLancamento, validOrigens, responsavel, customStart, customEnd);
                }
            }
        } catch (err) {
            console.error('Failed to fetch origins', err);
        }
    };

    const fetchResponsaveis = async () => {
        try {
            const data = await listarResponsaveisSettings(false);
            setResponsaveisList(data);
        } catch (err) {
            console.error('Failed to fetch responsibles', err);
        }
    };

    const applyFilter = (p: Period, tOrigem?: string, tLancamento?: string, oEspecifica?: string | string[], respEspecifico?: string | string[], cStart?: string, cEnd?: string) => {
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
            onChange(p, start, end, tOrigem, tLancamento, oEspecifica, respEspecifico);
        }
    };

    const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const p = e.target.value as Period;
        setPeriod(p);
        if (p !== 'custom') {
            applyFilter(p, tipo, tipoLancamento, origem, responsavel);
        }
    };

    const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const tVal = e.target.value;
        setTipo(tVal);
        // Origem filtering is handled by the useEffect and fetchOrigens
        applyFilter(period, tVal, tipoLancamento, origem, responsavel, customStart, customEnd);
    };

    const handleTipoLancamentoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const tVal = e.target.value;
        setTipoLancamento(tVal);
        applyFilter(period, tipo, tVal, origem, responsavel, customStart, customEnd);
    };

    const handleOrigemChange = (val: (string | number)[]) => {
        const newOrigem = val as string[];
        setOrigem(newOrigem);
        applyFilter(period, tipo, tipoLancamento, newOrigem, responsavel, customStart, customEnd);
    };

    const handleResponsavelChange = (val: (string | number)[]) => {
        const newResponsavel = val as string[];
        setResponsavel(newResponsavel);
        applyFilter(period, tipo, tipoLancamento, origem, newResponsavel, customStart, customEnd);
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

            {!hideOriginType && (
                <div className={styles.filterGroup}>
                    <label>{t('qualityAnalytics.filterOriginType', 'Tipo de Origem')}:</label>
                    <select value={tipo} onChange={handleTypeChange} className={styles.select}>
                        <option value="">{t('qualityAnalytics.allTypes', 'Todos os Tipos')}</option>
                        <option value="INTERNO">{t('qualityAnalytics.internal', 'Interno')}</option>
                        <option value="EXTERNO">{t('qualityAnalytics.external', 'Externo')}</option>
                    </select>
                </div>
            )}

            <div className={styles.filterGroup}>
                <label>{t('nav.tipoLancamento', 'Tipo de Dados')}:</label>
                <select value={tipoLancamento} onChange={handleTipoLancamentoChange} className={styles.select}>
                    <option value="">{t('nav.todos', 'Todos')}</option>
                    <option value="REFUGO">{t('nav.refugo', 'Refugo')}</option>
                    <option value="QUARENTENA">{t('nav.quarentena', 'Quarentena')}</option>
                </select>
            </div>

            {!hideEntityFilters && (
                <>
                    <div className={styles.filterGroup}>
                        <label>{t('qualityAnalytics.filterOrigin', 'Origem')}:</label>
                        <div style={{ width: '250px' }}>
                            <MultiSelect
                                options={origensList.map(o => ({ label: o.nome, value: o.nome }))}
                                value={origem}
                                onChange={handleOrigemChange}
                                placeholder={t('qualityAnalytics.all', 'Todas')}
                            />
                        </div>
                    </div>

                    <div className={styles.filterGroup}>
                        <label>{t('qualityAnalytics.responsible', 'Responsável')}:</label>
                        <div style={{ width: '250px' }}>
                            <MultiSelect
                                options={responsaveisList.map(r => ({ label: r.nome, value: r.nome }))}
                                value={responsavel}
                                onChange={handleResponsavelChange}
                                placeholder={t('qualityAnalytics.all', 'Todos')}
                            />
                        </div>
                    </div>
                </>
            )}

            {period === 'custom' && (
                <div className={styles.customDates}>
                    <input
                        type="date"
                        value={customStart}
                        onChange={(e) => {
                            setCustomStart(e.target.value);
                            if (e.target.value && customEnd) applyFilter('custom', tipo, tipoLancamento, origem, responsavel, e.target.value, customEnd);
                        }}
                        className={styles.input}
                    />
                    <span>{t('common.to', 'até')}</span>
                    <input
                        type="date"
                        value={customEnd}
                        onChange={(e) => {
                            setCustomEnd(e.target.value);
                            if (customStart && e.target.value) applyFilter('custom', tipo, tipoLancamento, origem, responsavel, customStart, e.target.value);
                        }}
                        className={styles.input}
                    />
                </div>
            )}
        </div>
    );
}
