// src/features/producao/tv/components/SlideResumo.tsx
import { useMemo } from 'react';
import {
    ResponsiveContainer,
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
} from 'recharts';
import styles from './SlideResumo.module.css';

interface DiaData {
    iso: string;
    label: string;
    produzido: number;
    meta: number;
    pct: number;
    isSaturday: boolean;
}

interface SlideResumoProps {
    dias: DiaData[];
}

function perfColor(pct: number | null): string {
    if (pct === null) return '#94a3b8';
    if (pct >= 100) return '#059669'; // Verde mais vibrante/saturado para excelência
    if (pct >= 90) return '#10b981';  // Verde sólido
    if (pct >= 80) return '#eab308';  // Amarelo
    if (pct >= 70) return '#f59e0b';  // Laranja
    return '#ef4444';                  // Vermelho
}

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const p = payload.find((x: any) => x.dataKey === 'produzido')?.value ?? 0;
    const m = payload.find((x: any) => x.dataKey === 'meta')?.value ?? 0;
    const diff = p - m;
    const pct = m > 0 ? (p / m) * 100 : 100;
    return (
        <div className={styles.tooltip}>
            <div className={styles.tooltipTitle}>{label}</div>
            <div className={styles.tooltipRow}>Produzido: <strong>{p.toFixed(1)}h</strong></div>
            <div className={styles.tooltipRow}>Meta: <strong>{m.toFixed(1)}h</strong></div>
            <div className={styles.tooltipRow}>
                Diferença: <strong style={{ color: diff >= 0 ? '#16a34a' : '#ef4444' }}>
                    {diff >= 0 ? '+' : ''}{diff.toFixed(1)}h
                </strong>
            </div>
            <div className={styles.tooltipRow}>Aderência: <strong>{pct.toFixed(0)}%</strong></div>
        </div>
    );
}

function BarLabel(props: any) {
    const { x, y, width, height, value } = props;
    if (value == null || !height || height < 20) return null;
    return (
        <text
            x={x + width / 2}
            y={y - 8}
            textAnchor="middle"
            fontSize={14}
            fontWeight={700}
            fill="#374151"
        >
            {Number(value).toFixed(0)}h
        </text>
    );
}

export default function SlideResumo({ dias }: SlideResumoProps) {
    const totais = useMemo(() => {
        const prod = dias.reduce((s, d) => s + d.produzido, 0);
        const meta = dias.reduce((s, d) => s + d.meta, 0);
        return {
            produzido: prod,
            meta: meta,
            pct: meta > 0 ? (prod / meta) * 100 : 0,
            diff: prod - meta,
        };
    }, [dias]);

    if (!dias.length) {
        return (
            <div className={styles.container}>
                <div className={styles.empty}>Sem dados recentes.</div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <h2 className={styles.title}>Produção Diária • Últimos {dias.length} dias</h2>
                <div className={styles.legend}>
                    <span className={styles.legendItem}>
                        <span className={styles.legendDot} style={{ background: '#f97316' }} />
                        Dia Útil
                    </span>
                    <span className={styles.legendItem}>
                        <span className={styles.legendDot} style={{ background: '#3b82f6' }} />
                        Sábado
                    </span>
                    <span className={styles.legendItem}>
                        <span className={styles.legendDot} style={{ background: '#16a34a' }} />
                        Meta Atingida
                    </span>
                </div>
            </div>

            {/* Gráfico */}
            <div className={styles.chartContainer}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dias} margin={{ top: 30, right: 20, left: 20, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
                        <XAxis
                            dataKey="label"
                            tick={{ fontSize: 13, fill: '#64748b' }}
                            tickMargin={10}
                            axisLine={{ stroke: '#e2e8f0' }}
                        />
                        <YAxis hide />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                        <Bar
                            dataKey="produzido"
                            radius={[6, 6, 0, 0]}
                            isAnimationActive={true}
                            label={<BarLabel />}
                        >
                            {dias.map((d, i) => (
                                <Cell
                                    key={i}
                                    fill={
                                        d.meta > 0 && d.produzido >= d.meta
                                            ? '#16a34a'
                                            : d.isSaturday
                                                ? '#3b82f6'
                                                : '#f97316'
                                    }
                                />
                            ))}
                        </Bar>
                        <Line
                            type="monotone"
                            dataKey="meta"
                            stroke="#1f2937"
                            strokeDasharray="5 5"
                            dot={false}
                            strokeWidth={3}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* Resumo Últimos 7 Dias */}
            <div className={styles.daysGrid}>
                {dias.slice(-7).map((d) => {
                    const diff = d.produzido - d.meta;
                    return (
                        <div
                            key={d.iso}
                            className={styles.dayCard}
                            style={{ borderTopColor: perfColor(d.pct) }}
                        >
                            <span className={styles.dayLabel}>{d.label}</span>
                            <span className={styles.dayValue}>{d.produzido.toFixed(0)}h</span>
                            <span
                                className={styles.dayDiff}
                                style={{ color: diff >= 0 ? '#16a34a' : '#ef4444' }}
                            >
                                {diff >= 0 ? '+' : ''}{diff.toFixed(0)}h
                            </span>
                            <span
                                className={styles.dayBadge}
                                style={{ backgroundColor: perfColor(d.pct) }}
                            >
                                {d.pct.toFixed(0)}%
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
