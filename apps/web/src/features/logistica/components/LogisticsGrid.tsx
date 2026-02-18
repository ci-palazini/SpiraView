import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CircularProgress } from '@mui/material';
import {
    FiChevronLeft, FiChevronRight, FiRefreshCw,
    FiTrendingUp, FiMaximize2, FiX, FiEdit3, FiDollarSign, FiPackage, FiTruck, FiZap, FiDownload
} from 'react-icons/fi';
import html2canvas from 'html2canvas';
import {
    getLogisticaKpis, saveLogisticaKpi, saveLogisticaMeta
} from '../../../services/apiClient';
import { LogisticaKpi, LogisticaDashboardData } from '../../../types/api';
import styles from './LogisticsGrid.module.css';
import { format, subMonths, addMonths, getDaysInMonth, isWeekend } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import logoSpirax from '../../../assets/logo-spirax.png';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, LabelList } from 'recharts';

interface LogisticsGridProps { }

type PeriodView = '1H' | '2H' | 'FULL';

// Format number with thousand separators (Brazilian format)
const formatNumber = (v: number | null | undefined): string => {
    if (v === null || v === undefined || isNaN(v) || v === 0) return '-';
    return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
};

const formatPercent = (v: number | null | undefined): string => {
    if (v === null || v === undefined || isNaN(v)) return '-';
    return `${(v * 100).toFixed(0)}%`;
};

interface DayModalData {
    day: number;
    faturado_acumulado: number;
    exportacao_acumulado: number;
    devolucoes_dia: number;
    total_linhas: number;
    linhas_atraso: number;
    backlog_atraso: number;
    ottr_ytd: number;
    is_dia_util: boolean;
}

interface SuggestedFields {
    faturado_acumulado: boolean;
    exportacao_acumulado: boolean;
    devolucoes_dia: boolean;
    total_linhas: boolean;
    linhas_atraso: boolean;
    backlog_atraso: boolean;
    ottr_ytd: boolean;
}

export const LogisticsGrid: React.FC<LogisticsGridProps> = () => {
    const { t } = useTranslation();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<LogisticaDashboardData | null>(null);
    const [metaMensal, setMetaMensal] = useState<number>(0);
    const [saving, setSaving] = useState(false);
    const [periodView, setPeriodView] = useState<PeriodView>('1H');
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalData, setModalData] = useState<DayModalData | null>(null);
    const [suggestedFields, setSuggestedFields] = useState<SuggestedFields>({
        faturado_acumulado: false,
        exportacao_acumulado: false,
        devolucoes_dia: false,
        total_linhas: false,
        linhas_atraso: false,
        backlog_atraso: false,
        ottr_ytd: false
    });

    const mes = currentDate.getMonth() + 1;
    const ano = currentDate.getFullYear();
    const daysInMonth = getDaysInMonth(currentDate);

    // Refs for download functionality
    const tableRef = useRef<HTMLDivElement>(null);
    const lineChartRef = useRef<HTMLDivElement>(null);
    const barChartRef = useRef<HTMLDivElement>(null);

    // Calculate visible days based on period
    const visibleDays = useMemo(() => {
        const allDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

        if (isFullscreen || periodView === 'FULL') {
            return allDays;
        }

        const midPoint = 15;
        if (periodView === '1H') {
            return allDays.filter(d => d <= midPoint);
        } else {
            return allDays.filter(d => d > midPoint);
        }
    }, [daysInMonth, periodView, isFullscreen]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getLogisticaKpis(mes, ano);
            setData(res);
            setMetaMensal(Number(res.meta?.meta_financeira || 0));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [mes, ano]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Auto-select period based on current day
    useEffect(() => {
        const today = new Date();
        if (today.getMonth() + 1 === mes && today.getFullYear() === ano) {
            setPeriodView(today.getDate() <= 15 ? '1H' : '2H');
        } else {
            setPeriodView('1H');
        }
    }, [mes, ano]);

    // --- Helpers ---
    const kpiMap = useMemo(() => {
        const map = new Map<number, LogisticaKpi>();
        if (!data?.items) return map;
        data.items.forEach(item => {
            const day = parseInt(item.data.split('-')[2], 10);
            map.set(day, item);
        });
        return map;
    }, [data?.items]);

    const prevKpiMap = useMemo(() => {
        const map = new Map<number, LogisticaKpi>();
        if (!data?.previousItems) return map;
        data.previousItems.forEach(item => {
            const day = parseInt(item.data.split('-')[2], 10);
            map.set(day, item);
        });
        return map;
    }, [data?.previousItems]);

    const baselinePrevMonth = useMemo(() => {
        if (!data?.previousItems || data.previousItems.length === 0) return 0;
        const last = data.previousItems[data.previousItems.length - 1];
        return Number(last.faturado_acumulado || 0) + Number(last.exportacao_acumulado || 0);
    }, [data?.previousItems]);

    const workingDays = useMemo(() => {
        let count = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const kpi = kpiMap.get(d);
            if (kpi && kpi.is_dia_util === false) continue;
            if (!kpi) {
                const date = new Date(ano, mes - 1, d);
                if (!isWeekend(date)) count++;
            } else {
                count++;
            }
        }
        return count || 1;
    }, [daysInMonth, kpiMap, ano, mes]);

    const handleMetaSave = async (val: string) => {
        const num = parseFloat(val);
        setMetaMensal(num);
        try {
            await saveLogisticaMeta(mes, ano, num);
        } catch (e) { console.error(e); }
    };

    // Calculations per Day
    const getValues = (d: number) => {
        const kpi = kpiMap.get(d);
        const prevDayKpi = kpiMap.get(d - 1);
        const faturado = Number(kpi?.faturado_acumulado || 0);
        const exportacao = Number(kpi?.exportacao_acumulado || 0);
        const total = faturado + exportacao;

        let prevTotal = 0;
        if (d === 1) prevTotal = baselinePrevMonth;
        else if (prevDayKpi) prevTotal = Number(prevDayKpi.faturado_acumulado || 0) + Number(prevDayKpi.exportacao_acumulado || 0);

        const realizadoDia = total > 0 ? total - prevTotal : 0;
        return { kpi, faturado, exportacao, total, realizadoDia };
    };

    const metaAcumMap = useMemo(() => {
        const map = new Map<number, number>();
        let acc = 0;
        const dailyTarget = metaMensal / (workingDays || 1);
        for (let d = 1; d <= daysInMonth; d++) {
            const kpi = kpiMap.get(d);
            const isUtil = kpi ? kpi.is_dia_util : !isWeekend(new Date(ano, mes - 1, d));
            if (isUtil) acc += dailyTarget;
            map.set(d, acc);
        }
        return map;
    }, [metaMensal, workingDays, daysInMonth, kpiMap, ano, mes]);

    // Totals for each row
    const totals = useMemo(() => {
        let faturado = 0, exportacao = 0, devolucoes = 0, totalLinhas = 0, linhasAtraso = 0, backlog = 0, ottr_ytd = 0;
        let lastPrevOttrYtd = 0;
        let lastPrevTotal = 0;

        // For accumulated values (faturado, exportacao), get the highest value
        for (let d = daysInMonth; d >= 1; d--) {
            const kpi = kpiMap.get(d);
            if (kpi) {
                faturado = Math.max(faturado, Number(kpi.faturado_acumulado || 0));
                exportacao = Math.max(exportacao, Number(kpi.exportacao_acumulado || 0));
            }
        }

        // For ALL accumulated metrics (devoluções, OTTR-related), get the last value from the last day with data
        for (let d = daysInMonth; d >= 1; d--) {
            const kpi = kpiMap.get(d);
            const prevKpi = prevKpiMap.get(d);

            if (kpi) {
                // Get the last values for accumulated metrics
                if (devolucoes === 0 && Number(kpi.devolucoes_dia || 0) > 0) {
                    devolucoes = Number(kpi.devolucoes_dia || 0);
                }
                if (totalLinhas === 0 && Number(kpi.total_linhas || 0) > 0) {
                    totalLinhas = Number(kpi.total_linhas || 0);
                }
                if (linhasAtraso === 0 && Number(kpi.linhas_atraso || 0) > 0) {
                    linhasAtraso = Number(kpi.linhas_atraso || 0);
                }
                if (backlog === 0 && Number(kpi.backlog_atraso || 0) > 0) {
                    backlog = Number(kpi.backlog_atraso || 0);
                }
                if (ottr_ytd === 0 && Number(kpi.ottr_ytd || 0) > 0) {
                    ottr_ytd = Number(kpi.ottr_ytd || 0);
                }
            }

            // Also get last previous month OTTR YTD
            if (prevKpi && lastPrevOttrYtd === 0 && Number(prevKpi.ottr_ytd || 0) > 0) {
                lastPrevOttrYtd = Number(prevKpi.ottr_ytd || 0);
            }

            // Get last previous month total (financial)
            if (prevKpi && lastPrevTotal === 0) {
                const total = Number(prevKpi.faturado_acumulado || 0) + Number(prevKpi.exportacao_acumulado || 0);
                if (total > 0) lastPrevTotal = total;
            }
        }

        return { faturado, exportacao, total: faturado + exportacao, devolucoes, totalLinhas, linhasAtraso, backlog, ottr_ytd, lastPrevOttrYtd, lastPrevTotal };
    }, [kpiMap, prevKpiMap, daysInMonth]);

    const summary = useMemo(() => {
        let lastDayWithData = 0;
        for (let d = daysInMonth; d >= 1; d--) {
            const kpi = kpiMap.get(d);
            if (kpi && (Number(kpi.faturado_acumulado) > 0 || Number(kpi.exportacao_acumulado) > 0)) {
                lastDayWithData = d;
                break;
            }
        }

        const totalAtual = totals.total;
        const metaFinal = metaAcumMap.get(lastDayWithData > 0 ? lastDayWithData : daysInMonth) || metaMensal;
        const pctMeta = metaFinal > 0 ? ((totalAtual / metaFinal) - 1) * 100 : 0;
        const pctAtingido = metaMensal > 0 ? (totalAtual / metaMensal) * 100 : 0;

        return { totalAtual, metaFinal, pctMeta, pctAtingido };
    }, [kpiMap, daysInMonth, metaAcumMap, metaMensal, totals]);

    // Chart data for fullscreen mode
    const chartData = useMemo(() => {
        const data = [];
        for (let d = 1; d <= daysInMonth; d++) {
            const kpi = kpiMap.get(d);
            const prevKpi = prevKpiMap.get(d);
            const metaAcum = metaAcumMap.get(d) || 0;

            const totalAtual = kpi ? Number(kpi.faturado_acumulado || 0) + Number(kpi.exportacao_acumulado || 0) : null;
            const totalAnterior = prevKpi ? Number(prevKpi.faturado_acumulado || 0) + Number(prevKpi.exportacao_acumulado || 0) : null;
            const devolucoes = kpi ? Number(kpi.devolucoes_dia || 0) : null;
            const ottrYtd = kpi ? Number(kpi.ottr_ytd || 0) : null;

            data.push({
                day: d,
                totalMes: totalAtual,
                metaMes: metaAcum || null,
                totalUltimoMes: totalAnterior,
                devolucoes: devolucoes,
                ottrYtd: ottrYtd
            });
        }
        return data;
    }, [daysInMonth, kpiMap, prevKpiMap, metaAcumMap]);

    const isDayUtil = (d: number) => {
        const kpi = kpiMap.get(d);
        return kpi ? kpi.is_dia_util : !isWeekend(new Date(ano, mes - 1, d));
    };

    // --- MODAL FUNCTIONS ---
    const openDayModal = (day: number) => {
        const kpi = kpiMap.get(day);

        // Sempre buscar o último dia com dados para usar como sugestão em campos vazios
        let prevDayKpi: LogisticaKpi | null = null;
        for (let d = day - 1; d >= 1; d--) {
            const candidate = kpiMap.get(d);
            if (candidate && (candidate.faturado_acumulado || candidate.exportacao_acumulado)) {
                prevDayKpi = candidate;
                break;
            }
        }

        // Para cada campo: se tem valor no dia atual, usa ele; senão, usa sugestão do dia anterior
        const suggestedData: Partial<LogisticaKpi> = prevDayKpi || {};



        // Rastrear quais campos são sugestões (não existiam no dia atual)
        // Um campo é considerado sugestão se: (1) não existe no dia atual E (2) tem valor no dia anterior
        // Importante: se o valor do dia atual é 0, consideramos como "não preenchido" e usamos sugestão
        const isSuggested: SuggestedFields = {
            faturado_acumulado: !Number(kpi?.faturado_acumulado) && !!Number(suggestedData.faturado_acumulado),
            exportacao_acumulado: !Number(kpi?.exportacao_acumulado) && !!Number(suggestedData.exportacao_acumulado),
            devolucoes_dia: !Number(kpi?.devolucoes_dia) && !!Number(suggestedData.devolucoes_dia),
            total_linhas: !Number(kpi?.total_linhas) && !!Number(suggestedData.total_linhas),
            linhas_atraso: !Number(kpi?.linhas_atraso) && !!Number(suggestedData.linhas_atraso),
            backlog_atraso: !Number(kpi?.backlog_atraso) && !!Number(suggestedData.backlog_atraso),
            ottr_ytd: !Number(kpi?.ottr_ytd) && !!Number(suggestedData.ottr_ytd)
        };

        setSuggestedFields(isSuggested);

        setModalData({
            day,
            // Campo a campo: se estiver vazio/zero no dia atual, preencher com sugestão do dia anterior
            faturado_acumulado: Number(kpi?.faturado_acumulado) || Number(suggestedData.faturado_acumulado) || 0,
            exportacao_acumulado: Number(kpi?.exportacao_acumulado) || Number(suggestedData.exportacao_acumulado) || 0,
            devolucoes_dia: Number(kpi?.devolucoes_dia) || Number(suggestedData.devolucoes_dia) || 0,
            total_linhas: Number(kpi?.total_linhas) || Number(suggestedData.total_linhas) || 0,
            linhas_atraso: Number(kpi?.linhas_atraso) || Number(suggestedData.linhas_atraso) || 0,
            backlog_atraso: Number(kpi?.backlog_atraso) || Number(suggestedData.backlog_atraso) || 0,
            ottr_ytd: Number(kpi?.ottr_ytd) || Number(suggestedData.ottr_ytd) || 0,
            is_dia_util: kpi ? kpi.is_dia_util !== false : !isWeekend(new Date(ano, mes - 1, day))
        });
        setModalOpen(true);
    };

    const handleModalSave = async () => {
        if (!modalData) return;
        setSaving(true);

        const dateStr = `${ano}-${String(mes).padStart(2, '0')}-${String(modalData.day).padStart(2, '0')}`;

        try {
            await saveLogisticaKpi(dateStr, {
                faturado_acumulado: modalData.faturado_acumulado,
                exportacao_acumulado: modalData.exportacao_acumulado,
                devolucoes_dia: modalData.devolucoes_dia,
                total_linhas: modalData.total_linhas,
                linhas_atraso: modalData.linhas_atraso,
                backlog_atraso: modalData.backlog_atraso,
                ottr_ytd: modalData.ottr_ytd,
                is_dia_util: modalData.is_dia_util
            });

            // Refresh data
            await fetchData();
            setModalOpen(false);
            setModalData(null);
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    // --- DOWNLOAD FUNCTIONS ---
    const handleDownload = async (
        elementRef: React.RefObject<HTMLDivElement | null>,
        fileName: string,
        title: string,
        includeHeader: boolean = true
    ) => {
        if (!elementRef.current) return;

        try {
            // Create a temporary wrapper
            const wrapper = document.createElement('div');
            wrapper.style.position = 'absolute';
            wrapper.style.left = '-9999px';
            wrapper.style.top = '0';
            wrapper.style.background = 'white';
            wrapper.style.padding = '24px';
            wrapper.style.width = 'fit-content';
            wrapper.style.maxWidth = '100%';

            // Create header with logo and title (only if includeHeader is true)
            if (includeHeader) {
                const header = document.createElement('div');
                header.style.display = 'flex';
                header.style.alignItems = 'center';
                header.style.gap = '16px';
                header.style.marginBottom = '24px';
                header.style.paddingBottom = '16px';
                header.style.borderBottom = '2px solid #e2e8f0';

                // Add logo
                const logo = document.createElement('img');
                logo.src = logoSpirax;
                logo.style.height = '40px';

                // Add title
                const titleEl = document.createElement('span');
                titleEl.textContent = title;
                titleEl.style.fontSize = '1.5rem';
                titleEl.style.fontWeight = '700';
                titleEl.style.color = '#1e293b';
                titleEl.style.textTransform = 'uppercase';

                header.appendChild(logo);
                header.appendChild(titleEl);
                wrapper.appendChild(header);
            }

            // Clone the target element
            const clone = elementRef.current.cloneNode(true) as HTMLElement;
            clone.style.width = elementRef.current.offsetWidth + 'px';

            // Assemble wrapper
            wrapper.appendChild(clone);
            document.body.appendChild(wrapper);

            // Capture with html2canvas
            const canvas = await html2canvas(wrapper, {
                scale: 2,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                width: wrapper.scrollWidth,
                height: wrapper.scrollHeight
            });

            // Convert to blob and download
            canvas.toBlob((blob) => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = fileName;
                    link.click();
                    URL.revokeObjectURL(url);
                }
            });

            // Cleanup
            document.body.removeChild(wrapper);
        } catch (error) {
            console.error('Error downloading image:', error);
        }
    };

    // --- RENDER FUNCTIONS ---
    const renderHeader = () => (
        <tr>
            <th className={styles.headerRowLabel}>{t('logistics.headers.indicator')}</th>
            {visibleDays.map(d => {
                const date = new Date(ano, mes - 1, d);
                const isUtil = isDayUtil(d);
                const workClass = isUtil ? styles.workingDay : styles.nonWorkingDay;

                return (
                    <th
                        key={d}
                        className={`${styles.headerDay} ${workClass}`}
                        onClick={() => openDayModal(d)}
                        title="Clique para editar"
                    >
                        <span className={styles.dayNumber}>{String(d).padStart(2, '0')}</span>
                        <span className={styles.dayName}>{format(date, 'EEE', { locale: ptBR }).slice(0, 3)}</span>
                    </th>
                );
            })}
            <th className={styles.headerTotal}>{t('logistics.headers.total')}</th>
        </tr>
    );

    const renderTextCell = (d: number, value: number, className = "") => {
        const isUtil = isDayUtil(d);
        const workClass = isUtil ? '' : styles.nonWorkingCell;

        return (
            <td key={d} className={`${styles.cell} ${workClass} ${className}`}>
                {formatNumber(value)}
            </td>
        );
    };

    const renderPercentCell = (d: number, value: number | null, useThreshold = false) => {
        const isUtil = isDayUtil(d);
        const workClass = isUtil ? '' : styles.nonWorkingCell;

        if (value === null || isNaN(value)) {
            return <td key={d} className={`${styles.cell} ${workClass}`}>-</td>;
        }

        const displayValue = (value * 100).toFixed(0) + '%';
        let colorClass = '';

        if (useThreshold) {
            // Para Realizado X Meta e Comparativos: >= 100% = verde, < 100% = vermelho
            colorClass = value >= 1.0 ? styles.textGreen : styles.textRed;
        } else {
            // Lógica antiga para outros casos
            colorClass = value >= 0 ? styles.textGreen : styles.textRed;
        }

        return (
            <td key={d} className={`${styles.cell} ${workClass} ${colorClass}`}>
                {displayValue}
            </td>
        );
    };

    const renderTotalCell = (value: number | string, className = '') => (
        <td className={`${styles.cellTotal} ${className}`}>{typeof value === 'number' ? formatNumber(value) : value}</td>
    );

    const renderSpacer = (colspan: number) => (
        <tr className={styles.sectionSpacer}><td colSpan={colspan + 2}></td></tr>
    );

    const renderSectionHeader = (title: string, colspan: number) => (
        <tr className={styles.sectionTitle}>
            <td colSpan={colspan + 2}>{title}</td>
        </tr>
    );

    const containerClass = isFullscreen
        ? `${styles.container} ${styles.containerFullscreen}`
        : styles.container;

    return (
        <div className={containerClass}>
            {isFullscreen && (
                <button className={styles.closeFullscreen} onClick={() => setIsFullscreen(false)}>
                    <FiX />
                </button>
            )}

            <div className={styles.controls}>
                {!isFullscreen ? (
                    <div className={styles.controlsTitle}>
                        <FiTrendingUp size={24} />
                        {t('logistics.controls.title')}
                    </div>
                ) : (
                    <div className={styles.controlsTitle}>
                        <img src={logoSpirax} alt="Spirax Sarco" style={{ height: '32px', marginRight: '16px' }} />
                        <span>{t('logistics.controls.titleFullscreen', { month: format(currentDate, 'MMMM', { locale: ptBR }).toUpperCase(), year: ano })}</span>
                    </div>
                )}

                <div className={styles.controlsActions}>
                    {(loading || saving) && (
                        <div className={styles.savingIndicator}>
                            <CircularProgress size={14} color="inherit" />
                            <span>{saving ? t('logistics.controls.saving') : t('logistics.controls.loading')}</span>
                        </div>
                    )}

                    {/* Period Selector */}
                    {!isFullscreen && (
                        <div className={styles.periodSelector}>
                            <button
                                className={`${styles.periodBtn} ${periodView === '1H' ? styles.periodBtnActive : ''}`}
                                onClick={() => setPeriodView('1H')}
                            >
                                {t('logistics.controls.firstFortnight')}
                            </button>
                            <button
                                className={`${styles.periodBtn} ${periodView === '2H' ? styles.periodBtnActive : ''}`}
                                onClick={() => setPeriodView('2H')}
                            >
                                {t('logistics.controls.secondFortnight')}
                            </button>
                        </div>
                    )}

                    {/* Meta Input */}
                    <div className={styles.metaInputContainer}>
                        <label className={styles.metaInputLabel}>{t('logistics.controls.monthlyTarget')}</label>
                        <input
                            type="number"
                            className={styles.metaInputHeader}
                            value={metaMensal || ''}
                            placeholder="R$ 0"
                            onChange={(e) => setMetaMensal(parseFloat(e.target.value) || 0)}
                            onBlur={(e) => handleMetaSave(e.target.value)}
                        />
                    </div>

                    <div className={styles.monthNav}>
                        <button className={styles.navBtn} onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
                            <FiChevronLeft size={18} />
                        </button>
                        <span className={styles.monthLabel}>
                            {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
                        </span>
                        <button className={styles.navBtn} onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
                            <FiChevronRight size={18} />
                        </button>
                    </div>

                    {!isFullscreen && (
                        <button className={styles.actionBtn} onClick={() => setIsFullscreen(true)} title={t('logistics.controls.expand')}>
                            <FiMaximize2 size={16} />
                            {t('logistics.controls.expand')}
                        </button>
                    )}

                    <button className={`${styles.actionBtn} ${styles.refreshBtn}`} onClick={fetchData} title={t('logistics.controls.refresh')}>
                        <FiRefreshCw size={16} />
                    </button>
                </div>
            </div>

            <div className={styles.gridWrapper}>
                {(loading && !data) ? (
                    <div className={styles.loadingOverlay}>
                        <CircularProgress />
                    </div>
                ) : (
                    <>
                        {isFullscreen && (
                            <div className={styles.sectionHeader}>
                                <button
                                    className={styles.downloadBtn}
                                    onClick={() => handleDownload(
                                        tableRef,
                                        `faturamento-${format(currentDate, 'MMMM-yyyy', { locale: ptBR })}.png`,
                                        t('logistics.controls.titleFullscreen', { month: format(currentDate, 'MMMM', { locale: ptBR }).toUpperCase(), year: ano })
                                    )}
                                    title="Baixar tabela como imagem"
                                >
                                    <FiDownload size={18} />
                                    {t('logistics.controls.downloadTable')}
                                </button>
                            </div>
                        )}
                        <div ref={tableRef}>
                            <table className={styles.table}>
                                <thead>{renderHeader()}</thead>
                                <tbody>
                                    {/* === FATURAMENTO SECTION === */}
                                    {renderSectionHeader(t('logistics.headers.billing'), visibleDays.length)}

                                    {/* Faturado Nacional */}
                                    <tr className={styles.rowFaturamento}>
                                        <td className={styles.rowHeader}>{t('logistics.rows.nationalBilling')}</td>
                                        {visibleDays.map(d => {
                                            const vals = getValues(d);
                                            return renderTextCell(d, vals.faturado);
                                        })}
                                        {renderTotalCell(totals.faturado)}
                                    </tr>

                                    {/* Faturado Exportação */}
                                    <tr className={styles.rowFaturamento}>
                                        <td className={styles.rowHeader}>{t('logistics.rows.exportBilling')}</td>
                                        {visibleDays.map(d => {
                                            const vals = getValues(d);
                                            return renderTextCell(d, vals.exportacao);
                                        })}
                                        {renderTotalCell(totals.exportacao)}
                                    </tr>

                                    {/* TOTAL */}
                                    <tr className={styles.rowTotal}>
                                        <td className={styles.rowHeader}>{t('logistics.rows.total')}</td>
                                        {visibleDays.map(d => {
                                            const vals = getValues(d);
                                            return renderTextCell(d, vals.total);
                                        })}
                                        {renderTotalCell(totals.total)}
                                    </tr>

                                    {/* Realizado no Dia */}
                                    <tr className={styles.rowRealizado}>
                                        <td className={styles.rowHeader}>{t('logistics.rows.realizedDay')}</td>
                                        {visibleDays.map(d => {
                                            const vals = getValues(d);
                                            return renderTextCell(d, vals.realizadoDia);
                                        })}
                                        {renderTotalCell('-')}
                                    </tr>

                                    {renderSpacer(visibleDays.length)}

                                    {/* === META SECTION === */}
                                    {renderSectionHeader(t('logistics.headers.meta'), visibleDays.length)}

                                    {/* Meta Acumulada */}
                                    <tr className={styles.rowMeta}>
                                        <td className={styles.rowHeader}>{t('logistics.rows.metaMonth', { month: format(currentDate, 'MMMM', { locale: ptBR }).toUpperCase() })}</td>
                                        {visibleDays.map(d => {
                                            const metaAcum = metaAcumMap.get(d) || 0;
                                            return renderTextCell(d, metaAcum);
                                        })}
                                        {renderTotalCell(metaMensal)}
                                    </tr>

                                    {/* Realizado X Meta */}
                                    <tr className={styles.rowMeta}>
                                        <td className={styles.rowHeader}>{t('logistics.rows.realizedVsMeta')}</td>
                                        {visibleDays.map(d => {
                                            const vals = getValues(d);
                                            const metaAcum = metaAcumMap.get(d) || 0;
                                            if (!metaAcum || vals.total === 0) return renderPercentCell(d, null, true);
                                            return renderPercentCell(d, vals.total / metaAcum, true);
                                        })}
                                        <td className={`${styles.cellTotal} ${summary.pctAtingido >= 100 ? styles.textGreen : styles.textRed}`}>
                                            {summary.pctAtingido.toFixed(0)}%
                                        </td>
                                    </tr>

                                    {renderSpacer(visibleDays.length)}

                                    {/* === COMPARATIVO SECTION === */}
                                    {renderSectionHeader(t('logistics.headers.comparison'), visibleDays.length)}

                                    {/* Mês Anterior */}
                                    <tr className={styles.rowComparativo}>
                                        <td className={styles.rowHeader}>{t('logistics.rows.realizedLastMonth', { month: format(subMonths(currentDate, 1), 'MMMM', { locale: ptBR }).toUpperCase() })}</td>
                                        {visibleDays.map(d => {
                                            const prevKpi = prevKpiMap.get(d);
                                            const totalPrev = prevKpi ? Number(prevKpi.faturado_acumulado || 0) + Number(prevKpi.exportacao_acumulado || 0) : 0;
                                            return (
                                                <td key={d} className={`${styles.cell} ${styles.textPurple}`}>
                                                    {formatNumber(totalPrev)}
                                                </td>
                                            );
                                        })}
                                        {renderTotalCell(totals.lastPrevTotal, styles.textPurple)}
                                    </tr>

                                    {/* Variação vs Mês Anterior */}
                                    <tr className={styles.rowComparativo}>
                                        <td className={styles.rowHeader}>{t('logistics.rows.variation', { month1: format(subMonths(currentDate, 1), 'MMM', { locale: ptBR }).toUpperCase(), month2: format(currentDate, 'MMM', { locale: ptBR }).toUpperCase() })}</td>
                                        {visibleDays.map(d => {
                                            const vals = getValues(d);
                                            const prevKpi = prevKpiMap.get(d);
                                            const totalPrev = prevKpi ? Number(prevKpi.faturado_acumulado || 0) + Number(prevKpi.exportacao_acumulado || 0) : 0;
                                            if (!totalPrev || vals.total === 0) return renderPercentCell(d, null, true);
                                            return renderPercentCell(d, vals.total / totalPrev, true);
                                        })}
                                        <td className={`${styles.cellTotal} ${totals.total >= totals.lastPrevTotal ? styles.textGreen : styles.textRed}`}>
                                            {totals.lastPrevTotal > 0 ? `${((totals.total / totals.lastPrevTotal) * 100).toFixed(0)}%` : '-'}
                                        </td>
                                    </tr>

                                    {renderSpacer(visibleDays.length)}

                                    {/* === DEVOLUÇÕES SECTION === */}
                                    {renderSectionHeader(t('logistics.headers.returns'), visibleDays.length)}

                                    <tr className={styles.rowDevolucoes}>
                                        <td className={styles.rowHeader}>{t('logistics.rows.returns')}</td>
                                        {visibleDays.map(d => {
                                            const kpi = kpiMap.get(d);
                                            return renderTextCell(d, Number(kpi?.devolucoes_dia || 0));
                                        })}
                                        {renderTotalCell(totals.devolucoes, styles.textRed)}
                                    </tr>

                                    {renderSpacer(visibleDays.length)}

                                    {/* === OTTR SECTION === */}
                                    {renderSectionHeader(t('logistics.headers.ottr'), visibleDays.length)}

                                    {/* Total de Linhas */}
                                    <tr className={styles.rowOttr}>
                                        <td className={styles.rowHeader}>{t('logistics.rows.totalLines')}</td>
                                        {visibleDays.map(d => {
                                            const kpi = kpiMap.get(d);
                                            return renderTextCell(d, Number(kpi?.total_linhas || 0));
                                        })}
                                        {renderTotalCell(totals.totalLinhas)}
                                    </tr>

                                    {/* Linhas On Time */}
                                    <tr className={styles.rowOttr}>
                                        <td className={styles.rowHeader}>{t('logistics.rows.linesOnTime')}</td>
                                        {visibleDays.map(d => {
                                            const kpi = kpiMap.get(d);
                                            const onTime = Number(kpi?.total_linhas || 0) - Number(kpi?.linhas_atraso || 0);
                                            return renderTextCell(d, onTime);
                                        })}
                                        {renderTotalCell(totals.totalLinhas - totals.linhasAtraso)}
                                    </tr>

                                    {/* Linhas Atraso */}
                                    <tr className={styles.rowOttr}>
                                        <td className={styles.rowHeader}>{t('logistics.rows.linesLate')}</td>
                                        {visibleDays.map(d => {
                                            const kpi = kpiMap.get(d);
                                            return renderTextCell(d, Number(kpi?.linhas_atraso || 0));
                                        })}
                                        {renderTotalCell(totals.linhasAtraso)}
                                    </tr>

                                    {/* Backlog Atraso */}
                                    <tr className={styles.rowOttr}>
                                        <td className={styles.rowHeader}>{t('logistics.rows.backlogLate')}</td>
                                        {visibleDays.map(d => {
                                            const kpi = kpiMap.get(d);
                                            return renderTextCell(d, Number(kpi?.backlog_atraso || 0));
                                        })}
                                        {renderTotalCell(totals.backlog)}
                                    </tr>

                                    {/* OTTR YTD */}
                                    <tr className={styles.rowOttr}>
                                        <td className={styles.rowHeader}>{t('logistics.rows.ottrYtd')}</td>
                                        {visibleDays.map(d => {
                                            const kpi = kpiMap.get(d);
                                            const val = Number(kpi?.ottr_ytd || 0);
                                            if (!val) return <td key={d} className={styles.cell}>-</td>;
                                            const colorClass = val >= 95 ? styles.textGreen : val >= 90 ? styles.textBlue : styles.textRed;
                                            return (
                                                <td key={d} className={`${styles.cell} ${colorClass}`}>
                                                    {val.toFixed(1)}%
                                                </td>
                                            );
                                        })}
                                        <td className={`${styles.cellTotal} ${totals.ottr_ytd >= 95 ? styles.textGreen : totals.ottr_ytd >= 90 ? styles.textBlue : styles.textRed}`}>
                                            {totals.ottr_ytd > 0 ? `${totals.ottr_ytd.toFixed(1)}%` : '-'}
                                        </td>
                                    </tr>

                                    {/* OTTR Mês Anterior */}
                                    <tr className={styles.rowOttr}>
                                        <td className={styles.rowHeader}>{t('logistics.rows.ottrLastMonth', { month: format(subMonths(currentDate, 1), 'MMMM', { locale: ptBR }).toUpperCase() })}</td>
                                        {visibleDays.map(d => {
                                            const prevKpi = prevKpiMap.get(d);
                                            const val = Number(prevKpi?.ottr_ytd || 0);
                                            if (!val) return <td key={d} className={`${styles.cell} ${styles.textPurple}`}>-</td>;
                                            return (
                                                <td key={d} className={`${styles.cell} ${styles.textPurple}`}>
                                                    {val.toFixed(1)}%
                                                </td>
                                            );
                                        })}
                                        <td className={`${styles.cellTotal} ${styles.textPurple}`}>
                                            {totals.lastPrevOttrYtd > 0 ? `${totals.lastPrevOttrYtd.toFixed(1)}%` : '-'}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {/* Summary Footer - Only show if NOT in fullscreen */}
            {!isFullscreen && (
                <div className={styles.summarySection}>
                    <div className={styles.summaryCard}>
                        <div className={styles.summaryLabel}>{t('logistics.summary.realizedMonth')}</div>
                        <div className={styles.summaryValue}>{formatNumber(summary.totalAtual)}</div>
                    </div>
                    <div className={styles.summaryCard}>
                        <div className={styles.summaryLabel}>{t('logistics.summary.monthlyTarget')}</div>
                        <div className={styles.summaryValue}>{formatNumber(metaMensal)}</div>
                    </div>
                    <div className={styles.summaryCard}>
                        <div className={styles.summaryLabel}>{t('logistics.summary.reached')}</div>
                        <div className={`${styles.summaryValue} ${summary.pctAtingido >= 100 ? styles.textGreen : styles.textRed}`}>
                            {summary.pctAtingido.toFixed(1)}%
                        </div>
                    </div>
                    <div className={styles.summaryCard}>
                        <div className={styles.summaryLabel}>{t('logistics.summary.variationVsMeta')}</div>
                        <div className={`${styles.summaryValue} ${summary.pctMeta >= 0 ? styles.textGreen : styles.textRed}`}>
                            {summary.pctMeta > 0 ? '+' : ''}{summary.pctMeta.toFixed(1)}%
                        </div>
                    </div>
                </div>
            )}

            {/* Line Chart - Only show in fullscreen */}
            {isFullscreen && (
                <div className={styles.chartSection}>
                    <div className={styles.chartHeader}>
                        <h3 className={styles.chartTitle}>{t('logistics.charts.financialPerformance')}</h3>
                        <button
                            className={styles.downloadBtn}
                            onClick={() => handleDownload(
                                lineChartRef,
                                `grafico-faturamento-${format(currentDate, 'MMMM-yyyy', { locale: ptBR })}.png`,
                                ``,
                                false
                            )}
                            title={t('logistics.controls.downloadChart')}
                        >
                            <FiDownload size={18} />
                            {t('logistics.controls.downloadChart')}
                        </button>
                    </div>
                    <div ref={lineChartRef} className={styles.chartContainer}>
                        <ResponsiveContainer width="100%" height={400}>
                            <LineChart
                                data={chartData}
                                margin={{ top: 20, right: 30, left: 60, bottom: 20 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis
                                    dataKey="day"
                                    label={{ value: t('logistics.charts.day'), position: 'insideBottom', offset: -10, style: { fontSize: '14px', fontWeight: 600 } }}
                                    tick={{ fontSize: 12 }}
                                />
                                <YAxis
                                    label={{ value: t('logistics.charts.value'), angle: -90, position: 'insideLeft', style: { fontSize: '14px', fontWeight: 600, textAnchor: 'middle' } }}
                                    tick={{ fontSize: 12 }}
                                    tickFormatter={(value) => formatNumber(value)}
                                />
                                <Tooltip
                                    formatter={(value: any) => formatNumber(Number(value))}
                                    labelFormatter={(label) => `Dia ${label}`}
                                    contentStyle={{
                                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                    }}
                                />
                                <Legend
                                    wrapperStyle={{ paddingTop: '20px' }}
                                    iconType="line"
                                />
                                <Line
                                    type="monotone"
                                    dataKey="totalMes"
                                    name={t('logistics.legend.total', { date: format(currentDate, 'MMMM yyyy', { locale: ptBR }) })}
                                    stroke="#3b82f6"
                                    strokeWidth={3}
                                    dot={{ fill: '#3b82f6', r: 4 }}
                                    activeDot={{ r: 6 }}
                                    connectNulls
                                />
                                <Line
                                    type="monotone"
                                    dataKey="metaMes"
                                    name={t('logistics.legend.meta', { date: format(currentDate, 'MMMM yyyy', { locale: ptBR }) })}
                                    stroke="#f59e0b"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={{ fill: '#f59e0b', r: 3 }}
                                    connectNulls
                                />
                                <Line
                                    type="monotone"
                                    dataKey="totalUltimoMes"
                                    name={t('logistics.legend.total', { date: format(subMonths(currentDate, 1), 'MMMM yyyy', { locale: ptBR }) })}
                                    stroke="#8b5cf6"
                                    strokeWidth={2}
                                    dot={{ fill: '#8b5cf6', r: 3 }}
                                    connectNulls
                                />
                                <Line
                                    type="monotone"
                                    dataKey="devolucoes"
                                    name={t('logistics.legend.returns', { date: format(currentDate, 'MMMM yyyy', { locale: ptBR }) })}
                                    stroke="#dc2626"
                                    strokeWidth={2}
                                    dot={{ fill: '#dc2626', r: 3 }}
                                    connectNulls
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* GAP between charts */}
                    <div style={{ height: '32px' }}></div>

                    {/* OTTR Bar Chart */}
                    <div className={styles.chartHeader}>
                        <h3 className={styles.chartTitle} style={{ color: '#0d9488' }}>
                            {t('logistics.charts.ottrEvolution')}
                        </h3>
                        <button
                            className={styles.downloadBtn}
                            onClick={() => handleDownload(
                                barChartRef,
                                `grafico-ottr-${format(currentDate, 'MMMM-yyyy', { locale: ptBR })}.png`,
                                ``,
                                false
                            )}
                            title={t('logistics.controls.downloadChart')}
                        >
                            <FiDownload size={18} />
                            {t('logistics.controls.downloadChart')}
                        </button>
                    </div>
                    <div ref={barChartRef} className={styles.chartContainer}>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart
                                data={chartData}
                                margin={{ top: 20, right: 30, left: 60, bottom: 20 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis
                                    dataKey="day"
                                    label={{ value: t('logistics.charts.day'), position: 'insideBottom', offset: -10, style: { fontSize: '14px', fontWeight: 600 } }}
                                    tick={{ fontSize: 12 }}
                                />
                                <YAxis
                                    label={{ value: t('logistics.charts.ottrYtd'), angle: -90, position: 'insideLeft', style: { fontSize: '14px', fontWeight: 600, textAnchor: 'middle' } }}
                                    tick={{ fontSize: 12 }}
                                    domain={[0, 100]}
                                />
                                <Tooltip
                                    formatter={(value: any) => `${Number(value).toFixed(1)}%`}
                                    labelFormatter={(label) => `Dia ${label}`}
                                    contentStyle={{
                                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                    }}
                                />
                                <Legend
                                    wrapperStyle={{ paddingTop: '20px' }}
                                />
                                <Bar
                                    dataKey="ottrYtd"
                                    name={t('logistics.legend.ottrYtd', { date: format(currentDate, 'MMMM yyyy', { locale: ptBR }) })}
                                    fill="#14b8a6"
                                    radius={[4, 4, 0, 0]}
                                    barSize={20}
                                >
                                    <LabelList
                                        dataKey="ottrYtd"
                                        position="top"
                                        formatter={(val: any) => typeof val === 'number' ? `${val.toFixed(0)}%` : ''}
                                        style={{ fontSize: '10px', fontWeight: 'bold', fill: '#0d9488' }}
                                    />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Day Edit Modal */}
            {modalOpen && modalData && (
                <div className={styles.modalOverlay} onClick={() => setModalOpen(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div className={styles.modalTitle}>
                                <FiEdit3 size={20} />
                                {t('logistics.modal.title', { day: String(modalData.day).padStart(2, '0'), weekday: format(new Date(ano, mes - 1, modalData.day), 'EEEE', { locale: ptBR }) })}
                            </div>
                            <button className={styles.modalCloseBtn} onClick={() => setModalOpen(false)}>
                                <FiX size={18} />
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            {/* Faturamento Section */}
                            <div className={styles.modalSection}>
                                <div className={`${styles.modalSectionTitle} ${styles.blue}`}>
                                    <FiDollarSign size={16} />
                                    {t('logistics.modal.billing')}
                                </div>
                                <div className={styles.modalInputRow}>
                                    <div className={styles.modalInputGroup}>
                                        <label className={styles.modalInputLabel}>
                                            {t('logistics.modal.nationalBillingAcum')}
                                            {suggestedFields.faturado_acumulado && <span className={styles.suggestionBadge}><FiZap />{t('logistics.modal.suggested')}</span>}
                                        </label>
                                        <input
                                            type="number"
                                            className={`${styles.modalInput} ${suggestedFields.faturado_acumulado ? styles.modalInputSuggested : ''}`}
                                            value={modalData.faturado_acumulado || ''}
                                            onChange={(e) => setModalData({ ...modalData, faturado_acumulado: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div className={styles.modalInputGroup}>
                                        <label className={styles.modalInputLabel}>
                                            {t('logistics.modal.exportBillingAcum')}
                                            {suggestedFields.exportacao_acumulado && <span className={styles.suggestionBadge}><FiZap />{t('logistics.modal.suggested')}</span>}
                                        </label>
                                        <input
                                            type="number"
                                            className={`${styles.modalInput} ${suggestedFields.exportacao_acumulado ? styles.modalInputSuggested : ''}`}
                                            value={modalData.exportacao_acumulado || ''}
                                            onChange={(e) => setModalData({ ...modalData, exportacao_acumulado: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className={styles.modalSection}>
                                <div className={`${styles.modalSectionTitle} ${styles.red}`}>
                                    <FiPackage size={16} />
                                    {t('logistics.modal.returns')}
                                </div>
                                <div className={styles.modalInputGroup}>
                                    <label className={styles.modalInputLabel}>
                                        {t('logistics.modal.returnsDay')}
                                        {suggestedFields.devolucoes_dia && <span className={styles.suggestionBadge}><FiZap />{t('logistics.modal.suggested')}</span>}
                                    </label>
                                    <input
                                        type="number"
                                        className={`${styles.modalInput} ${suggestedFields.devolucoes_dia ? styles.modalInputSuggested : ''}`}
                                        value={modalData.devolucoes_dia || ''}
                                        onChange={(e) => setModalData({ ...modalData, devolucoes_dia: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                            </div>

                            <div className={styles.modalSection}>
                                <div className={`${styles.modalSectionTitle} ${styles.teal}`}>
                                    <FiTruck size={16} />
                                    {t('logistics.modal.serviceLevel')}
                                </div>
                                <div className={styles.modalInputRow}>
                                    <div className={styles.modalInputGroup}>
                                        <label className={styles.modalInputLabel}>
                                            {t('logistics.modal.totalLines')}
                                            {suggestedFields.total_linhas && <span className={styles.suggestionBadge}><FiZap />{t('logistics.modal.suggested')}</span>}
                                        </label>
                                        <input
                                            type="number"
                                            className={`${styles.modalInput} ${suggestedFields.total_linhas ? styles.modalInputSuggested : ''}`}
                                            value={modalData.total_linhas || ''}
                                            onChange={(e) => setModalData({ ...modalData, total_linhas: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div className={styles.modalInputGroup}>
                                        <label className={styles.modalInputLabel}>
                                            {t('logistics.modal.linesLate')}
                                            {suggestedFields.linhas_atraso && <span className={styles.suggestionBadge}><FiZap />{t('logistics.modal.suggested')}</span>}
                                        </label>
                                        <input
                                            type="number"
                                            className={`${styles.modalInput} ${suggestedFields.linhas_atraso ? styles.modalInputSuggested : ''}`}
                                            value={modalData.linhas_atraso || ''}
                                            onChange={(e) => setModalData({ ...modalData, linhas_atraso: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                                <div className={styles.modalInputRow}>
                                    <div className={styles.modalInputGroup}>
                                        <label className={styles.modalInputLabel}>
                                            {t('logistics.modal.backlogLate')}
                                            {suggestedFields.backlog_atraso && <span className={styles.suggestionBadge}><FiZap />{t('logistics.modal.suggested')}</span>}
                                        </label>
                                        <input
                                            type="number"
                                            className={`${styles.modalInput} ${suggestedFields.backlog_atraso ? styles.modalInputSuggested : ''}`}
                                            value={modalData.backlog_atraso || ''}
                                            onChange={(e) => setModalData({ ...modalData, backlog_atraso: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div className={styles.modalInputGroup}>
                                        <label className={styles.modalInputLabel}>
                                            {t('logistics.charts.ottrYtd')}
                                            {suggestedFields.ottr_ytd && <span className={styles.suggestionBadge}><FiZap />{t('logistics.modal.suggested')}</span>}
                                        </label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            className={`${styles.modalInput} ${suggestedFields.ottr_ytd ? styles.modalInputSuggested : ''}`}
                                            value={modalData.ottr_ytd || ''}
                                            onChange={(e) => setModalData({ ...modalData, ottr_ytd: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>

                                {/* Toggle for working day */}
                                <div className={styles.toggleContainer}>
                                    <span className={styles.toggleLabel}>{t('logistics.modal.workingDay')}</span>
                                    <div
                                        className={`${styles.toggle} ${modalData.is_dia_util ? styles.active : ''}`}
                                        onClick={() => setModalData({ ...modalData, is_dia_util: !modalData.is_dia_util })}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={styles.modalFooter}>
                            <button className={styles.modalBtnCancel} onClick={() => setModalOpen(false)}>
                                {t('logistics.modal.cancel')}
                            </button>
                            <button className={styles.modalBtnSave} onClick={handleModalSave} disabled={saving}>
                                {saving ? t('logistics.controls.saving') : t('logistics.modal.save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
