import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    FiDownload,
    FiChevronDown,
    FiChevronRight,
    FiBarChart2,
    FiTarget,
    FiTrendingUp,
    FiClock,
    FiRefreshCw
} from 'react-icons/fi';
import { 
    PageHeader
} from '../../../shared/components';
import { getResultadosMensais } from '../../../services/apiClient';
import type { ResultadosMensais } from '@spiraview/shared';
import { exportToExcel } from '../../../utils/exportExcel';
import styles from './ProducaoResultadosPage.module.css';

// --- Utils ---
function round2(n: number) { return Math.round(n * 100) / 100; }
function pct(n: number, d: number) {
    if (!d || d <= 0) return null;
    return n / d;
}
function pctLabel(p: number | null) {
    if (p == null) return '—';
    return `${Math.round(p * 100)}%`;
}
function pctLabel1(p: number | null) {
    if (p == null) return '—';
    return `${(p * 100).toFixed(1)}%`;
}
function hoursLabel(n: number) {
    return n.toFixed(2);
}

// Badge de % colorido (para linha de ritmo diário)
function PctBadge({ p }: { p: number | null }) {
    if (p == null) return <span className={`${styles.pctBadge} ${styles.pctBadgeNeutral}`}>—</span>;
    const pct100 = p * 100;
    const cls = pct100 >= 100 ? styles.pctBadgeGood : pct100 >= 80 ? styles.pctBadgeWarn : styles.pctBadgeBad;
    return <span className={`${styles.pctBadge} ${cls}`}>{Math.round(pct100)}%</span>;
}

// Badge com mini barra de progresso (para tabela detalhes)
function PctWithBar({ p, inverted }: { p: number | null; inverted?: boolean }) {
    if (p == null) return <span style={{ color: inverted ? 'rgba(255,255,255,0.5)' : '#94a3b8' }}>—</span>;
    const pct100 = Math.min(p * 100, 100);
    const textColor = inverted
        ? 'rgba(255,255,255,0.95)'
        : p >= 1 ? '#16a34a' : p >= 0.8 ? '#ca8a04' : '#dc2626';
    const barCls = p >= 1 ? styles.miniProgressGood : p >= 0.8 ? styles.miniProgressWarn : styles.miniProgressBad;
    return (
        <div className={styles.miniProgressWrap}>
            <span style={{ fontWeight: 700, color: textColor }}>{(p * 100).toFixed(1)}%</span>
            <div className={styles.miniProgress} style={{ background: inverted ? 'rgba(255,255,255,0.2)' : undefined }}>
                <div className={`${styles.miniProgressFill} ${barCls}`} style={{ width: `${pct100}%` }} />
            </div>
        </div>
    );
}

const ProducaoResultadosPage: React.FC = () => {
    const { t } = useTranslation('common');

    const today = new Date();
    const initialDate = today.getDate() < 5 ? new Date(today.getFullYear(), today.getMonth() - 1, 1) : today;

    const [ano, setAno] = useState(initialDate.getFullYear());
    const [mes, setMes] = useState(initialDate.getMonth() + 1);

    const [data, setData] = useState<ResultadosMensais | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [expandedSectors, setExpandedSectors] = useState<Record<string, boolean>>({});
    const [selectedDay, setSelectedDay] = useState<string | null>(null);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const res = await getResultadosMensais(ano, mes);
            setData(res);
            
            // Default all sectors expanded
            const expanded: Record<string, boolean> = {};
            res.setores.forEach(s => { expanded[s.setorId || 'none'] = true; });
            setExpandedSectors(expanded);

            // Set default selected day
            if (res.diasMes.length > 0) {
                const todayStr = new Date().toISOString().split('T')[0];
                const availableDays = res.diasMes.filter(d => d <= todayStr);
                const defaultDay = availableDays.length > 0 ? availableDays[availableDays.length - 1] : res.diasMes[0];
                setSelectedDay(defaultDay);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erro ao carregar resultados';
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [ano, mes]);

    const dayMergeMap = useMemo(() => {
        if (!data) return {} as Record<string, string>;
        const map: Record<string, string> = {};
        const THRESHOLD = 10;

        data.diasMes.forEach(d => {
            const dateObj = new Date(d + 'T12:00:00');
            const wd = dateObj.getDay();
            if (!map[d]) map[d] = d;

            if (wd === 5) {
                const fridayIdx = data.diasMes.indexOf(d);
                const sat = data.diasMes[fridayIdx + 1];
                const sun = data.diasMes[fridayIdx + 2];
                if (sat) {
                    let satProd = 0;
                    data.setores.forEach(s => s.maquinas.forEach(m => {
                        const dayD = m.dias.find(dd => dd.dia === sat);
                        if (dayD) satProd += (dayD.horasRealizadas || 0);
                    }));
                    if (satProd < THRESHOLD) {
                        map[sat] = d;
                        if (sun) map[sun] = d;
                    } else if (sun) {
                        let sunProd = 0;
                        data.setores.forEach(s => s.maquinas.forEach(m => {
                            const dayD = m.dias.find(dd => dd.dia === sun);
                            if (dayD) sunProd += (dayD.horasRealizadas || 0);
                        }));
                        if (sunProd < THRESHOLD) map[sun] = sat;
                    }
                }
            }
        });
        return map;
    }, [data]);

    const dailyTrack = useMemo(() => {
        if (!data) return [];
        const visibleDays = data.diasMes.filter(d => dayMergeMap[d] === d);
        const allDays = visibleDays.map(d => {
            const mergedSourceDays = data.diasMes.filter(src => dayMergeMap[src] === d);
            let meta = 0, real = 0;
            let hasSat = false, hasSun = false;
            mergedSourceDays.forEach(src => {
                const dateObj = new Date(src + 'T12:00:00');
                if (dateObj.getDay() === 6) hasSat = true;
                if (dateObj.getDay() === 0) hasSun = true;
                data.setores.forEach(s => s.maquinas.forEach(m => {
                    const dayD = m.dias.find(dd => dd.dia === src);
                    if (dayD) {
                        meta += (dayD.horasMeta || 0);
                        real += (dayD.horasRealizadas || 0);
                    }
                }));
            });
            return {
                dia: d,
                label: parseInt(d.split('-')[2], 10),
                meta: round2(meta),
                real: round2(real),
                delta: round2(real - meta),
                pct: pct(real, meta),
                isSaturday: hasSat,
                isSunday: hasSun
            };
        });

        // Corta após o último dia com dados reais para não distorcer o total
        const lastWithData = allDays.reduce((idx, d, i) => d.real > 0 ? i : idx, -1);
        return lastWithData >= 0 ? allDays.slice(0, lastWithData + 1) : allDays;
    }, [data, dayMergeMap]);

    const machineMetrics = useMemo(() => {
        if (!data || !selectedDay) return [];
        const activeDay = dayMergeMap[selectedDay] || selectedDay;
        const activeDayD = new Date(activeDay + 'T12:00:00');
        const results: any[] = [];
        data.setores.forEach(setor => {
            const setorItems: any[] = [];
            let sDayMeta = 0, sDayReal = 0, sAccMeta = 0, sAccReal = 0;
            setor.maquinas.forEach(maq => {
                let dMeta = 0, dReal = 0, aMeta = 0, aReal = 0;
                maq.dias.forEach(d => {
                    const target = dayMergeMap[d.dia] || d.dia;
                    const targetD = new Date(target + 'T12:00:00');
                    if (target === activeDay) {
                        dMeta += (d.horasMeta || 0);
                        dReal += (d.horasRealizadas || 0);
                    }
                    if (targetD <= activeDayD) {
                        aMeta += (d.horasMeta || 0);
                        aReal += (d.horasRealizadas || 0);
                    }
                });
                setorItems.push({
                    id: maq.maquinaId,
                    nome: maq.maquinaNome,
                    isMaquinaMae: maq.isMaquinaMae,
                    dayMeta: round2(dMeta),
                    dayReal: round2(dReal),
                    dayDelta: round2(dReal - dMeta),
                    accMeta: round2(aMeta),
                    accReal: round2(aReal),
                    accDelta: round2(aReal - aMeta),
                    pctDay: pct(dReal, dMeta),
                    pctMonth: pct(aReal, aMeta)
                });
                sDayMeta += dMeta; sDayReal += dReal;
                sAccMeta += aMeta; sAccReal += aReal;
            });
            results.push({
                setorId: setor.setorId || 'none',
                setorNome: setor.setorNome,
                dayMeta: round2(sDayMeta),
                dayReal: round2(sDayReal),
                dayDelta: round2(sDayReal - sDayMeta),
                accMeta: round2(sAccMeta),
                accReal: round2(sAccReal),
                accDelta: round2(sAccReal - sAccMeta),
                pctDay: pct(sDayReal, sDayMeta),
                pctMonth: pct(sAccReal, sAccMeta),
                maquinas: setorItems
            });
        });
        return results;
    }, [data, selectedDay, dayMergeMap]);

    const totals = useMemo(() => {
        let dm = 0, dr = 0, am = 0, ar = 0;
        machineMetrics.forEach(s => {
            dm += s.dayMeta; dr += s.dayReal;
            am += s.accMeta; ar += s.accReal;
        });
        return {
            dayMeta: round2(dm),
            dayReal: round2(dr),
            dayDelta: round2(dr - dm),
            accMeta: round2(am),
            accReal: round2(ar),
            accDelta: round2(ar - am),
            pctDay: pct(dr, dm),
            pctMonth: pct(ar, am)
        };
    }, [machineMetrics]);

    const handleExport = () => {
        if (!data) return;
        const rows: Record<string, unknown>[] = [];
        data.setores.forEach(setor => {
            setor.maquinas.forEach(maq => {
                const row: Record<string, unknown> = {
                    [t('producao.resultados.export.sector', 'Setor')]: setor.setorNome,
                    [t('producao.resultados.export.machine', 'Maquina')]: maq.maquinaNome,
                };
                data.diasMes.forEach(diaKey => {
                    const diaData = maq.dias.find(d => d.dia === diaKey);
                    const label = parseInt(diaKey.split('-')[2], 10);
                    row[`D${label} (Meta)`] = diaData ? (diaData.horasMeta || 0) : 0;
                    row[`D${label} (Real)`] = diaData ? diaData.horasRealizadas : 0;
                });
                row['Total Meta'] = maq.totalMeta;
                row['Total Real'] = maq.totalRealizado;
                row['% Rank'] = maq.totalMeta > 0 ? ((maq.totalRealizado / maq.totalMeta) * 100).toFixed(1) + '%' : '-';
                rows.push(row);
            });
        });
        exportToExcel(rows, `Resultados_${ano}_${mes}`, `Producao_Resultados_${ano}_${mes}`);
    };

    const getDeltaStyle = (d: number) => {
        if (d > 0) return styles.deltaGood;
        if (d < 0) return styles.deltaBad;
        return styles.deltaNeutral;
    };

    if (isLoading && !data) {
        return <div className={styles.loadingFull}>{t('common.loading')}</div>;
    }

    return (
        <>
            <PageHeader
                title={t('producao.resultados.title')}
                subtitle={t('producao.resultados.subtitle')}
            />
            <div className={styles.container}>
                {/* Controles */}
                <div className={styles.controlsBar}>
                    <input
                        type="month"
                        value={`${ano}-${String(mes).padStart(2, '0')}`}
                        onChange={e => {
                            if(e.target.value) {
                                const [y, m] = e.target.value.split('-');
                                setAno(Number(y));
                                setMes(Number(m));
                            }
                        }}
                        className={styles.monthInput}
                    />
                    <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                        <button className={styles.exportButton} onClick={handleExport}>
                            <FiDownload size={18} /> Exportar
                        </button>
                        <button className={styles.refreshButton} onClick={loadData}>
                            <FiRefreshCw size={18} />
                        </button>
                    </div>
                </div>

                {/* KPI Summary Cards */}
            <div className={styles.kpiRow}>
                <div className={styles.kpiCard} style={{ '--kpi-accent': '#1e3a5f', '--kpi-icon-bg': '#eff6ff' } as React.CSSProperties}>
                    <div className={styles.kpiIcon}><FiTarget size={22} /></div>
                    <div className={styles.kpiContent}>
                        <span className={styles.kpiLabel}>Meta do Dia</span>
                        <span className={`${styles.kpiValue} ${styles.kpiValueAccent}`}>{Math.round(totals.dayMeta)}h</span>
                    </div>
                </div>
                <div className={styles.kpiCard} style={{ '--kpi-accent': '#d97706', '--kpi-icon-bg': '#fef3c7' } as React.CSSProperties}>
                    <div className={styles.kpiIcon}><FiBarChart2 size={22} /></div>
                    <div className={styles.kpiContent}>
                        <span className={styles.kpiLabel}>Real do Dia</span>
                        <span className={`${styles.kpiValue} ${styles.kpiValueHighlight}`}>{Math.round(totals.dayReal)}h</span>
                    </div>
                </div>
                <div className={styles.kpiCard} style={{ '--kpi-accent': '#7c3aed', '--kpi-icon-bg': '#ede9fe' } as React.CSSProperties}>
                    <div className={styles.kpiIcon}><FiClock size={22} /></div>
                    <div className={styles.kpiContent}>
                        <span className={styles.kpiLabel}>{t('producao.resultados.kpi.accMeta')}</span>
                        <span className={`${styles.kpiValue}`} style={{ color: '#7c3aed' }}>{Math.round(totals.accMeta)}h</span>
                    </div>
                </div>
                <div className={styles.kpiCard} style={{ '--kpi-accent': '#16a34a', '--kpi-icon-bg': '#dcfce7' } as React.CSSProperties}>
                    <div className={styles.kpiIcon}><FiTrendingUp size={22} /></div>
                    <div className={styles.kpiContent}>
                        <span className={styles.kpiLabel}>{t('producao.resultados.kpi.accPct')}</span>
                        <span className={`${styles.kpiValue} ${styles.kpiValueGreen}`}>{pctLabel(totals.pctMonth)}</span>
                    </div>
                </div>
                </div>

                {/* RITMO DIARIO SECTION */}
                <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <div className={styles.accentBar} />
                        {t('producao.resultados.ritmo.title')}
                    </h2>
                    <span className={styles.sectionSubtitle}>
                        Ref: {selectedDay ? parseInt(selectedDay.split('-')[2], 10) + '/' + selectedDay.split('-')[1] : '—'}
                    </span>
                </div>
                <div className={styles.horizontalTableContainer}>
                    <table className={styles.horizontalTable}>
                        <thead>
                            <tr>
                                <th className={styles.thSticky}>Dia</th>
                                {dailyTrack.map(d => {
                                    const isWeekend = d.isSaturday || d.isSunday;
                                    return (
                                        <th
                                            key={d.dia}
                                            className={`${styles.thDay} ${isWeekend ? styles.thDayWeekend : ''} ${selectedDay === d.dia ? styles.thDaySelected : ''}`}
                                            onClick={() => setSelectedDay(d.dia)}
                                            title={d.dia}
                                        >
                                            <span className={styles.dayNum}>{d.label}</span>
                                            {d.isSaturday && <span className={styles.daySub}>SÁB</span>}
                                            {d.isSunday && <span className={`${styles.daySub} ${styles.sunLabel}`}>DOM</span>}
                                        </th>
                                    );
                                })}
                                <th className={styles.thTotal}>TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className={styles.tdLabel}>META</td>
                                {dailyTrack.map(d => (
                                    <td key={d.dia} className={`${styles.tdDayValue} ${(d.isSaturday || d.isSunday) ? styles.tdDayWeekend : ''} ${selectedDay === d.dia ? styles.tdDaySelected : ''}`}>
                                        {d.meta > 0 ? Math.round(d.meta) : <span className={styles.muted}>—</span>}
                                    </td>
                                ))}
                                <td className={styles.tdTotalValue}>{Math.round(dailyTrack.reduce((a, b) => a + b.meta, 0))}</td>
                            </tr>
                            <tr className={styles.rowReal}>
                                <td className={styles.tdLabel}>REAL</td>
                                {dailyTrack.map(d => (
                                    <td key={d.dia} className={`${styles.tdDayValue} ${(d.isSaturday || d.isSunday) ? styles.tdDayWeekend : ''} ${selectedDay === d.dia ? styles.tdDaySelected : ''}`}>
                                        {d.real > 0 ? Math.round(d.real) : <span className={styles.muted}>—</span>}
                                    </td>
                                ))}
                                <td className={styles.tdTotalValue}>{Math.round(dailyTrack.reduce((a, b) => a + b.real, 0))}</td>
                            </tr>
                            <tr className={styles.rowPct}>
                                <td className={styles.tdLabel}>% ATING.</td>
                                {dailyTrack.map(d => (
                                    <td key={d.dia} className={`${styles.tdDayValue} ${(d.isSaturday || d.isSunday) ? styles.tdDayWeekend : ''} ${selectedDay === d.dia ? styles.tdDaySelected : ''}`} style={{ paddingTop: 4, paddingBottom: 4 }}>
                                        <PctBadge p={d.pct} />
                                    </td>
                                ))}
                                <td className={styles.tdTotalValue}>
                                    <PctBadge p={pct(dailyTrack.reduce((a, b) => a + b.real, 0), dailyTrack.reduce((a, b) => a + b.meta, 0))} />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                </div>

                {/* DETAILS SECTION */}
                <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <div className={styles.accentBar} />
                        {selectedDay 
                            ? `${t('producao.resultados.detalhes.title')} — ${new Date(selectedDay + 'T12:00:00').toLocaleDateString('pt-BR')}`
                            : t('producao.resultados.detalhes.title')}
                    </h2>
                </div>
                <div className={styles.verticalTableContainer}>
                    <table className={styles.verticalTable}>
                        <thead>
                            <tr>
                                <th className={styles.thVHeader}>{t('producao.resultados.table.structure')}</th>
                                <th className={styles.thVHeader}>{t('producao.resultados.table.meta_day')}</th>
                                <th className={styles.thVHeader}>{t('producao.resultados.table.real_day')}</th>
                                <th className={styles.thVHeader}>{t('producao.resultados.table.delta_day')}</th>
                                <th className={styles.thVHeader}>{t('producao.resultados.table.meta_acc')}</th>
                                <th className={styles.thVHeader}>{t('producao.resultados.table.real_acc')}</th>
                                <th className={styles.thVHeader}>{t('producao.resultados.table.delta_acc')}</th>
                                <th className={styles.thVHeader}>{t('producao.resultados.table.pct_day')}</th>
                                <th className={styles.thVHeader}>{t('producao.resultados.table.pct_month')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {machineMetrics.map(sec => (
                                <React.Fragment key={sec.setorId}>
                                    <tr className={styles.trSector} onClick={() => setExpandedSectors(p => ({...p, [sec.setorId]: !p[sec.setorId]}))}>
                                        <td className={`${styles.tdSector} ${styles.tdSectorLeft}`}>
                                            <span className={styles.iconChevron}>{expandedSectors[sec.setorId] ? <FiChevronDown /> : <FiChevronRight />}</span>
                                            <span className={styles.sectorLabel}>{sec.setorNome}</span>
                                        </td>
                                        <td className={styles.tdSector}>{hoursLabel(sec.dayMeta)}</td>
                                        <td className={styles.tdSector}>{hoursLabel(sec.dayReal)}</td>
                                        <td className={`${styles.tdSector} ${getDeltaStyle(sec.dayDelta)}`}>{hoursLabel(sec.dayDelta)}</td>
                                        <td className={styles.tdSector}>{hoursLabel(sec.accMeta)}</td>
                                        <td className={styles.tdSector}>{hoursLabel(sec.accReal)}</td>
                                        <td className={`${styles.tdSector} ${getDeltaStyle(sec.accDelta)}`}>{hoursLabel(sec.accDelta)}</td>
                                        <td className={styles.tdSector}><PctWithBar p={sec.pctDay} /></td>
                                        <td className={styles.tdSector}><PctWithBar p={sec.pctMonth} /></td>
                                    </tr>
                                    {expandedSectors[sec.setorId] && sec.maquinas.map((m: any) => (
                                        <tr key={m.id} className={styles.trMachine}>
                                            <td className={`${styles.tdMachine} ${styles.tdMachineLeft}`}>
                                                <span className={styles.macCode}>
                                                    {m.nome}
                                                    {m.isMaquinaMae && (
                                                        <span title="Máquina Mãe" style={{ marginLeft: 6, fontSize: '0.7em', padding: '2px 6px', borderRadius: 4, background: '#e0e7ff', color: '#4338ca', display: 'inline-block' }}>
                                                            MÃE
                                                        </span>
                                                    )}
                                                </span>
                                            </td>
                                            <td className={`${styles.tdMachine} ${m.dayMeta === 0 ? styles.muted : ''}`}>{hoursLabel(m.dayMeta)}</td>
                                            <td className={`${styles.tdMachine} ${m.dayReal === 0 ? styles.muted : ''}`}>{hoursLabel(m.dayReal)}</td>
                                            <td className={`${styles.tdMachine} ${getDeltaStyle(m.dayDelta)}`}>{hoursLabel(m.dayDelta)}</td>
                                            <td className={`${styles.tdMachine} ${m.accMeta === 0 ? styles.muted : ''}`}>{hoursLabel(m.accMeta)}</td>
                                            <td className={`${styles.tdMachine} ${m.accReal === 0 ? styles.muted : ''}`}>{hoursLabel(m.accReal)}</td>
                                            <td className={`${styles.tdMachine} ${getDeltaStyle(m.accDelta)}`}>{hoursLabel(m.accDelta)}</td>
                                            <td className={styles.tdMachine}><PctWithBar p={m.pctDay} /></td>
                                            <td className={styles.tdMachine}><PctWithBar p={m.pctMonth} /></td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                            <tr className={styles.trTotalGeral}>
                                <td className={`${styles.tdTotalGeral} ${styles.tdTotalGeralLeft}`}>
                                    {t('producao.resultados.table.total_general')}
                                </td>
                                <td className={styles.tdTotalGeral}>{hoursLabel(totals.dayMeta)}</td>
                                <td className={styles.tdTotalGeral}>{hoursLabel(totals.dayReal)}</td>
                                <td className={`${styles.tdTotalGeral} ${getDeltaStyle(totals.dayDelta)}`}>{hoursLabel(totals.dayDelta)}</td>
                                <td className={styles.tdTotalGeral}>{hoursLabel(totals.accMeta)}</td>
                                <td className={styles.tdTotalGeral}>{hoursLabel(totals.accReal)}</td>
                                <td className={`${styles.tdTotalGeral} ${getDeltaStyle(totals.accDelta)}`}>{hoursLabel(totals.accDelta)}</td>
                                <td className={styles.tdTotalGeral}><PctWithBar p={totals.pctDay} inverted /></td>
                                <td className={styles.tdTotalGeral}><PctWithBar p={totals.pctMonth} inverted /></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            </div>
        </>
    );
};

export default ProducaoResultadosPage;
