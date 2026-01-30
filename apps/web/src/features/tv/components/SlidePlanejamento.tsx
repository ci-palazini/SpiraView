// src/features/tv/components/SlidePlanejamento.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ResponsiveContainer,
    BarChart,
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
    LabelList,
} from 'recharts';
import { type ResumoCapacidade, BASE } from '../../../services/apiClient';
import styles from './SlidePlanejamento.module.css';

interface DiaData {
    iso: string;
    label: string;
    produzido: number;
    meta: number;
    pct: number;
    isSaturday: boolean;
}

interface SlidePlanejamentoProps {
    currentSlide: number; // 0 = produção, 1 = capacidade mensal, 2 = 30 dias
    diasProducao: DiaData[];
}

// ==================== HELPERS ====================
function perfColor(pct: number | null): string {
    if (pct === null) return '#94a3b8';
    if (pct >= 100) return '#059669';
    if (pct >= 90) return '#10b981';
    if (pct >= 80) return '#eab308';
    if (pct >= 70) return '#f59e0b';
    return '#ef4444';
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

function CustomTooltipProducao({ active, payload, label }: any) {
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

// ==================== COMPONENT ====================
export default function SlidePlanejamento({ currentSlide, diasProducao }: SlidePlanejamentoProps) {
    const [capacidadeData, setCapacidadeData] = useState<ResumoCapacidade[]>([]);
    const [calculation, setCalculation] = useState<{ totalBusinessDays: number; passedBusinessDays: number } | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchCapacidade = useCallback(async () => {
        try {
            setLoading(true);
            // Use public TV endpoint (no auth required)
            const r = await fetch(`${BASE}/planejamento/capacidade/resumo/tv`);
            const data = await r.json();
            setCapacidadeData(data.items || []);
            if (data.calculation) {
                setCalculation(data.calculation);
            }
        } catch (err) {
            console.error('Erro ao buscar capacidade TV:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCapacidade();
        // Refresh every 5 minutes
        const id = setInterval(fetchCapacidade, 300000);
        return () => clearInterval(id);
    }, [fetchCapacidade]);

    const chartData = useMemo(() => {
        return capacidadeData.map((d) => ({
            name: d.centroTrabalho,
            cargaOP: Math.round(d.cargaOP * 10) / 10,
            cargaHoras: Math.round(d.cargaHoras * 10) / 10,
            cargaResto: Math.max(0, Math.round((d.cargaHoras - d.cargaOP) * 10) / 10),
            capacidade: Math.round(d.capacidade * 10) / 10,
            capacidadeRestante: Math.round(d.capacidadeRestante * 10) / 10,
            sobrecarga: d.sobrecarga,
        }));
    }, [capacidadeData]);

    // ==================== SLIDE 0: PRODUÇÃO ====================
    if (currentSlide === 0) {
        if (!diasProducao.length) {
            return (
                <div className={styles.container}>
                    <div className={styles.empty}>Sem dados de produção.</div>
                </div>
            );
        }

        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h2 className={styles.title}>Produção Diária • Últimos {diasProducao.length} dias</h2>
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

                <div className={styles.chartContainer}>
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={diasProducao} margin={{ top: 30, right: 20, left: 20, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
                            <XAxis
                                dataKey="label"
                                tick={{ fontSize: 13, fill: '#64748b' }}
                                tickMargin={10}
                                axisLine={{ stroke: '#e2e8f0' }}
                            />
                            <YAxis hide />
                            <Tooltip content={<CustomTooltipProducao />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                            <Bar
                                dataKey="produzido"
                                radius={[6, 6, 0, 0]}
                                isAnimationActive={true}
                                label={<BarLabel />}
                            >
                                {diasProducao.map((d, i) => (
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
                    {diasProducao.slice(-7).map((d) => {
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

    // ==================== SLIDE 1: CAPACIDADE MENSAL ====================
    if (currentSlide === 1) {
        if (loading) {
            return (
                <div className={styles.container}>
                    <div className={styles.loading}>Carregando capacidade...</div>
                </div>
            );
        }

        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <div>
                        <h2 className={styles.title}>Análise da Capacidade Mensal vs Plano do Mês</h2>
                        {calculation && (
                            <p className={styles.subtitle} style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                                Dia Útil: <strong>{calculation.passedBusinessDays} / {calculation.totalBusinessDays}</strong>
                            </p>
                        )}
                    </div>
                    <div className={styles.legend}>
                        <span className={styles.legendItem}>
                            <span className={styles.legendDot} style={{ background: '#3b82f6' }} />
                            Carga OP
                        </span>
                        <span className={styles.legendItem}>
                            <span className={styles.legendDot} style={{ background: '#22c55e' }} />
                            Cap. Restante
                        </span>
                    </div>
                </div>

                <div className={styles.chartContainer}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis
                                dataKey="name"
                                tick={{ fill: '#64748b', fontSize: 12 }}
                                angle={-45}
                                textAnchor="end"
                                height={80}
                            />
                            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                            <Tooltip />
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

                {/* Resumo de Sobrecargas */}
                {(() => {
                    const sobrecargas = chartData
                        .map(c => ({
                            name: c.name,
                            carga: c.cargaOP,
                            capacidade: c.capacidadeRestante,
                            excesso: c.cargaOP - c.capacidadeRestante
                        }))
                        .filter(c => c.excesso > 0)
                        .sort((a, b) => b.excesso - a.excesso)
                        .slice(0, 7);

                    if (sobrecargas.length === 0) {
                        return (
                            <div className={styles.overloadSummary}>
                                <span className={styles.noOverload}>✓ Nenhum centro em sobrecarga</span>
                            </div>
                        );
                    }

                    return (
                        <div className={styles.overloadGrid}>
                            {sobrecargas.map((s) => (
                                <div key={s.name} className={styles.overloadCard}>
                                    <span className={styles.overloadName}>{s.name}</span>
                                    <span className={styles.overloadValue}>+{s.excesso.toFixed(0)}h</span>
                                    <span className={styles.overloadLabel}>sobrecarga</span>
                                </div>
                            ))}
                        </div>
                    );
                })()}
            </div>
        );
    }

    // ==================== SLIDE 2: 30 DIAS ====================
    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>Carregando capacidade...</div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>Análise da Capacidade (30 dias) vs Necessidade Total</h2>
                <div className={styles.legend}>
                    <span className={styles.legendItem}>
                        <span className={styles.legendDot} style={{ background: '#3b82f6' }} />
                        Carga OP
                    </span>
                    <span className={styles.legendItem}>
                        <span className={styles.legendDot} style={{ background: '#94a3b8' }} />
                        Carga Horas
                    </span>
                    <span className={styles.legendItem}>
                        <span className={styles.legendDot} style={{ background: '#22c55e' }} />
                        Capacidade
                    </span>
                </div>
            </div>

            <div className={styles.chartContainer}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                            dataKey="name"
                            tick={{ fill: '#64748b', fontSize: 12 }}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                        />
                        <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                        <Tooltip />
                        {/* Carga OP (Base - Azul) */}
                        <Bar dataKey="cargaOP" name="Carga OP" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]}>
                            <LabelList
                                dataKey="cargaOP"
                                position="insideTop"
                                style={{ fill: '#fff', fontSize: 11, fontWeight: 700 }}
                                formatter={(v: any) => v > 0 ? Number(v).toFixed(0) : ''}
                            />
                        </Bar>
                        {/* Carga Resto (Topo - Cinza) */}
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

            {/* Resumo de Sobrecargas */}
            {(() => {
                const sobrecargas = chartData
                    .map(c => ({
                        name: c.name,
                        carga: c.cargaHoras,
                        capacidade: c.capacidade,
                        excesso: c.cargaHoras - c.capacidade
                    }))
                    .filter(c => c.excesso > 0)
                    .sort((a, b) => b.excesso - a.excesso)
                    .slice(0, 7);

                if (sobrecargas.length === 0) {
                    return (
                        <div className={styles.overloadSummary}>
                            <span className={styles.noOverload}>✓ Nenhum centro em sobrecarga</span>
                        </div>
                    );
                }

                return (
                    <div className={styles.overloadGrid}>
                        {sobrecargas.map((s) => (
                            <div key={s.name} className={styles.overloadCard}>
                                <span className={styles.overloadName}>{s.name}</span>
                                <span className={styles.overloadValue}>+{s.excesso.toFixed(0)}h</span>
                                <span className={styles.overloadLabel}>sobrecarga</span>
                            </div>
                        ))}
                    </div>
                );
            })()}
        </div>
    );
}
