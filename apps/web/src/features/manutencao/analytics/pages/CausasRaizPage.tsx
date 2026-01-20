// src/features/analytics/pages/CausasRaizPage.tsx
import React, { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import {
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    CartesianGrid,
    ResponsiveContainer
} from 'recharts';
import styles from './CausasRaizPage.module.css';
import { useTranslation } from 'react-i18next';
import Skeleton from '@mui/material/Skeleton';
import {
    listarCausas,
    criarCausa,
    excluirCausa,
    listarParetoCausas,
    getMaquinas,
} from '../../../../services/apiClient';

// ---------- Types ----------
interface User {
    role?: string;
    email?: string;
}

export interface CausasRaizPageProps {
    user: User;
}

interface Causa {
    id?: string;
    nome: string;
}

interface Maquina {
    id: string;
    nome?: string;
    tag?: string;
}

interface ParetoItem {
    causa: string;
    chamados?: number;
    count?: number;
    pctAcum?: number;
    acumPercent?: number;
}

interface ChartDataItem {
    causa: string;
    count: number;
    acumPercent: number;
}

// ---------- CRUD de Causas Raiz ----------
interface CausasCrudProps {
    user: User;
}

function CausasCrud({ user }: CausasCrudProps) {
    const { t } = useTranslation();
    const [causas, setCausas] = useState<Causa[]>([]);
    const [novoNome, setNovoNome] = useState('');
    const [loading, setLoading] = useState(true);

    // carrega causas
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const resp = await listarCausas();
                const lista: Causa[] = Array.isArray(resp) ? resp : ((resp as { items?: Causa[] })?.items ?? []);
                if (!alive) return;

                // garante sem duplicatas
                const seen = new Set<string>();
                const unique: Causa[] = [];
                for (const it of lista) {
                    const key = it.id ?? `nome:${it.nome}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        unique.push({ id: it.id, nome: it.nome });
                    }
                }
                unique.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
                setCausas(unique);
            } catch (e) {
                console.error(e);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    const handleAdd = async (e: FormEvent) => {
        e.preventDefault();
        const nome = (novoNome || '').trim();
        if (!nome) return;
        try {
            const saved: Causa = await criarCausa({ nome }, { role: user?.role, email: user?.email });
            setCausas(prev => {
                const semDup = prev.filter(x => (saved.id ? x.id !== saved.id : x.nome !== saved.nome));
                return [...semDup, saved].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
            });
            setNovoNome('');
        } catch (err) {
            console.error(err);
            alert((err as Error)?.message || t('common.error', 'Falha ao criar causa'));
        }
    };

    const handleDelete = async (item: Causa) => {
        if (!window.confirm(t('causas.confirm.delete'))) return;

        try {
            let id = item?.id;

            // fallback: procurar o id por nome
            if (!id) {
                const fresh: Causa[] = await listarCausas();
                const found = fresh.find(
                    x => (x.nome || '').trim().toLowerCase() === (item?.nome || '').trim().toLowerCase()
                );
                id = found?.id;
            }

            if (!id) {
                alert('Registro sem id');
                return;
            }

            await excluirCausa(id, { role: user?.role, email: user?.email });
            setCausas(prev => prev.filter(c => c.id !== id));
        } catch (err) {
            console.error(err);
            alert((err as Error)?.message || 'Falha ao excluir causa');
        }
    };

    return (
        <div>
            <form onSubmit={handleAdd} className={styles.formGroup}>
                <input
                    type="text"
                    className={styles.input}
                    placeholder={t('causas.form.placeholder')}
                    value={novoNome}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNovoNome(e.target.value)}
                    required
                />
                <button type="submit" className={styles.button}>
                    {t('causas.form.add')}
                </button>
            </form>

            {loading ? (
                <ul className={styles.list}>
                    {[1, 2, 3, 4].map((i) => (
                        <li key={i} className={styles.listItem}>
                            <Skeleton variant="text" width="60%" height={24} />
                            <Skeleton variant="rectangular" width={60} height={28} sx={{ borderRadius: 1 }} />
                        </li>
                    ))}
                </ul>
            ) : causas.length === 0 ? (
                <p className={styles.muted}>{t('causas.list.empty', 'Nenhuma causa cadastrada')}</p>
            ) : null}

            {!loading && causas.length > 0 && (
                <ul className={styles.list}>
                    {causas.map((c, i) => (
                        <li key={c.id ?? `${c.nome}__${i}`} className={styles.listItem}>
                            {c.nome}
                            <button
                                className={styles.deleteButton}
                                onClick={() => handleDelete(c)}
                                title={t('causas.list.delete')}
                            >
                                {t('causas.list.delete')}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ---------- Pareto Chart ----------
function ParetoChart() {
    const { t } = useTranslation();
    const [dados, setDados] = useState<ChartDataItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [maquinas, setMaquinas] = useState<Maquina[]>([]);

    // Filtros
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);
    const [maquinaId, setMaquinaId] = useState('');

    // Carregar lista de mÃ¡quinas
    useEffect(() => {
        getMaquinas('', 'manutencao').then((list: Maquina[] | { items?: Maquina[] }) => {
            const arr = Array.isArray((list as { items?: Maquina[] })?.items)
                ? (list as { items: Maquina[] }).items
                : (Array.isArray(list) ? list : []);
            setMaquinas(arr.sort((a, b) => (a.nome || a.tag || '').localeCompare(b.nome || b.tag || '', 'pt')));
        }).catch(console.error);
    }, []);

    // Carregar dados do Pareto
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const params: Record<string, string> = {};
                if (startDate) params.from = startDate.toISOString();
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    params.to = end.toISOString();
                }
                if (maquinaId) params.maquinaId = maquinaId;

                const resp = await listarParetoCausas(params);
                const items: ParetoItem[] = Array.isArray((resp as { items?: ParetoItem[] })?.items)
                    ? (resp as { items: ParetoItem[] }).items
                    : (Array.isArray(resp) ? resp : []);
                const data: ChartDataItem[] = items.map(it => ({
                    causa: it.causa,
                    count: Number(it.chamados ?? it.count ?? 0),
                    acumPercent: Number(it.pctAcum ?? it.acumPercent ?? 0),
                }));
                if (!alive) return;
                setDados(data);
            } catch (e) {
                console.error(e);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [startDate, endDate, maquinaId]);

    const handleStartDateChange = (e: ChangeEvent<HTMLInputElement>) => {
        setStartDate(e.target.value ? new Date(e.target.value + 'T00:00:00') : null);
    };

    const handleEndDateChange = (e: ChangeEvent<HTMLInputElement>) => {
        setEndDate(e.target.value ? new Date(e.target.value + 'T00:00:00') : null);
    };

    const handleClearFilters = () => {
        setStartDate(null);
        setEndDate(null);
        setMaquinaId('');
    };

    return (
        <>
            {/* Filtros */}
            <div className={styles.filterContainer}>
                <div className={styles.filterField}>
                    <label htmlFor="maquinaFilter">{t('causas.filters.machine', 'MÃ¡quina')}</label>
                    <select
                        id="maquinaFilter"
                        className={styles.select}
                        value={maquinaId}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) => setMaquinaId(e.target.value)}
                    >
                        <option value="">{t('causas.filters.allMachines', 'Todas')}</option>
                        {maquinas.map((m) => (
                            <option key={m.id} value={m.id}>{m.nome || m.tag}</option>
                        ))}
                    </select>
                </div>

                <div className={styles.filterField}>
                    <label htmlFor="startDateFilter">{t('causas.filters.start', 'De')}</label>
                    <input
                        type="date"
                        id="startDateFilter"
                        className={styles.dateInput}
                        value={startDate ? startDate.toISOString().slice(0, 10) : ''}
                        onChange={handleStartDateChange}
                    />
                </div>

                <div className={styles.filterField}>
                    <label htmlFor="endDateFilter">{t('causas.filters.end', 'AtÃ©')}</label>
                    <input
                        type="date"
                        id="endDateFilter"
                        className={styles.dateInput}
                        value={endDate ? endDate.toISOString().slice(0, 10) : ''}
                        onChange={handleEndDateChange}
                    />
                </div>

                <button
                    type="button"
                    className={styles.clearButton}
                    onClick={handleClearFilters}
                >
                    {t('causas.filters.clear', 'Limpar')}
                </button>
            </div>

            {loading ? (
                <>
                    {/* Skeleton do grÃ¡fico Pareto */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, justifyContent: 'center', height: 350, marginTop: 16 }}>
                        {[180, 150, 120, 90, 60, 40, 25].map((h, i) => (
                            <Skeleton key={i} variant="rectangular" width={50} height={h} sx={{ borderRadius: 1 }} />
                        ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                        <Skeleton variant="text" width={200} height={20} />
                    </div>
                </>
            ) : !dados.length ? (
                <p className={styles.muted}>{t('causas.chart.empty', 'Sem dados para exibir')}</p>
            ) : (
                <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart data={dados}>
                        <CartesianGrid stroke="#f5f5f5" />
                        <XAxis
                            dataKey="causa"
                            label={{ value: t('causas.chart.xLabel'), position: 'insideBottom', offset: -5 }}
                        />
                        <YAxis
                            yAxisId="left"
                            label={{ value: t('causas.chart.yLeft'), angle: -90, position: 'insideLeft' }}
                        />
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            domain={[0, 100]}
                            label={{ value: t('causas.chart.yRight'), angle: 90, position: 'insideRight' }}
                        />
                        <Tooltip />
                        <Legend />
                        <Bar
                            yAxisId="left"
                            dataKey="count"
                            name={t('causas.chart.seriesCalls')}
                            fill="#8884d8"
                        />
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="acumPercent"
                            name={t('causas.chart.seriesAccumPct')}
                            stroke="#ff7300"
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            )}
        </>
    );
}

// ---------- PÃ¡gina ----------
export default function CausasRaizPage({ user }: CausasRaizPageProps) {
    const { t } = useTranslation();
    return (
        <div className={styles.pageContainer}>
            <section className={styles.crudSection}>
                <h2>{t('causas.titleCrud')}</h2>
                <CausasCrud user={user} />
            </section>
            <section className={styles.chartSection}>
                <h2>{t('causas.titlePareto')}</h2>
                <ParetoChart />
            </section>
        </div>
    );
}
