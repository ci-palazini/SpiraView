// src/features/producao/pages/ProducaoDashboardPage.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { FiBarChart2, FiCalendar, FiClock, FiActivity } from 'react-icons/fi';
import Skeleton from '@mui/material/Skeleton';

import PageHeader from '../../../shared/components/PageHeader';
import {
    listarMaquinas,
    listarMetasProducao,
    listarResumoDiarioProducao,
    buscarUltimoUploadProducao, // [NEW]
    type ProducaoMeta,
    type ProducaoResumoDiario,
} from '../../../services/apiClient';
import type { Maquina } from '../../../types/api';
import styles from './ProducaoDashboardPage.module.css';
import { useTranslation } from 'react-i18next';

interface User {
    role?: string;
    email?: string;
}

interface ProducaoDashboardPageProps {
    user: User;
}

// (Removida interface Maquina local antiga)

interface LinhaMaquina {
    maquinaId: string;
    maquinaNome: string;
    setor?: string;
    produzido: number;
    meta: number;
    esperado: number;
    aderencia: number | null;
    desvio: number;
    isMother?: boolean; // Para ordenação visual
    isChild?: boolean;
}

// Helpers
function toISO(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function getCurrentHHMM(): string {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

// Fração do dia lógico: 05:30 -> 00:44 (+1 dia)
function fracDiaLogico(hhmm: string): number {
    const toMin = (s: string) => {
        const [h, m] = s.split(':').map(Number);
        return h * 60 + m;
    };
    const start = toMin('05:30');
    const end = 24 * 60 + 44; // 1484 min (00:44 do dia seguinte)
    const cur = toMin(hhmm);
    if (cur < start) return 0;
    if (cur >= end) return 1;
    return (cur - start) / (end - start);
}

function colorForPct(pct: number | null): 'green' | 'yellow' | 'red' | 'gray' {
    if (pct === null) return 'gray';
    if (pct >= 100) return 'green';
    if (pct >= 80) return 'yellow';
    return 'red';
}

function clamp(v: number, min = 0, max = 100) {
    return Math.max(min, Math.min(max, v));
}

function formatDateBR(iso: string): string {
    try {
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
    } catch {
        return iso;
    }
}

function isSameDay(iso: string): boolean {
    return iso === toISO(new Date());
}

function isPastDay(iso: string): boolean {
    return iso < toISO(new Date());
}

export default function ProducaoDashboardPage({ user }: ProducaoDashboardPageProps) {
    const { t } = useTranslation();
    const [dataRef, setDataRef] = useState<string>(() => toISO(new Date()));
    const [hora, setHora] = useState<string>(() => getCurrentHHMM());
    const [maquinas, setMaquinas] = useState<Maquina[]>([]);
    const [metas, setMetas] = useState<ProducaoMeta[]>([]);
    const [resumos, setResumos] = useState<ProducaoResumoDiario[]>([]);
    const [loading, setLoading] = useState(true);
    const [setorFiltro, setSetorFiltro] = useState<'todos' | 'Usinagem' | 'Montagem'>('Usinagem');

    const isToday = isSameDay(dataRef);
    const isPast = isPastDay(dataRef);
    const isFuture = !isToday && !isPast;

    // Fração do dia (1 se passado, 0 se futuro, calculado se hoje)
    const frac = useMemo(() => {
        if (isPast) return 1;
        if (isFuture) return 0;
        return fracDiaLogico(hora);
    }, [isPast, isFuture, hora]);

    // Ajustar hora para 00:44 se dia passado
    useEffect(() => {
        if (isPast && hora !== '00:44') {
            setHora('00:44');
        }
    }, [isPast, hora]);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [maqData, metasData, resumoData] = await Promise.all([
                listarMaquinas({ escopo: 'producao' }),
                listarMetasProducao({ vigente: true }),
                listarResumoDiarioProducao({ dataRef }),
            ]);
            setMaquinas(maqData as Maquina[]);
            setMetas(metasData);

            // Lógica de Agregação em Cascata (Domingo -> Sábado -> Sexta)
            // Idêntica ao TvDashboardPage para consistência
            let finalResumos = resumoData;
            let finalRefDate = dataRef;

            // Helper para agregar dias
            const aggregateDays = async (
                sourceData: ProducaoResumoDiario[],
                targetDateISO: string
            ) => {
                // Buscar dados do dia alvo sob demanda
                const targetResumo = await listarResumoDiarioProducao({ dataRef: targetDateISO });

                // Criar mapa para fusão
                const mergedMap = new Map<string, ProducaoResumoDiario>();

                // 1. Adicionar dados do alvo (base)
                targetResumo.forEach(item => {
                    mergedMap.set(item.maquinaId, { ...item, horasDia: Number(item.horasDia) || 0 });
                });

                // 2. Somar dados da origem
                sourceData.forEach(item => {
                    const h = Number(item.horasDia) || 0;
                    if (mergedMap.has(item.maquinaId)) {
                        const current = mergedMap.get(item.maquinaId)!;
                        const currentHoras = Number(current.horasDia) || 0;
                        current.horasDia = currentHoras + h;

                        if (item.ultimaAtualizacaoEm && (!current.ultimaAtualizacaoEm || item.ultimaAtualizacaoEm > current.ultimaAtualizacaoEm)) {
                            current.ultimaAtualizacaoEm = item.ultimaAtualizacaoEm;
                        }
                    } else {
                        mergedMap.set(item.maquinaId, { ...item, horasDia: h, dataRef: targetDateISO });
                    }
                });

                return Array.from(mergedMap.values());
            };

            // 1. Verificar Domingo -> Sábado
            let currentRefObj = new Date(finalRefDate.includes('T') ? finalRefDate : finalRefDate + 'T12:00:00');
            let aggregated = false;
            let targetDateLabel = '';

            // Lógica "Olhar para Trás" (Backward Aggregation)
            // Se estou vendo Domingo e é < 10h -> Mostra Sábado (com Domingo somado)
            if (currentRefObj.getDay() === 0) { // Domingo
                const totalSunday = finalResumos.reduce((acc, r) => acc + (Number(r.horasDia) || 0), 0);
                if (totalSunday < 10) {
                    console.log('Produção Dashboard: Domingo < 10h. Agregando ao Sábado.');

                    const satDateObj = new Date(currentRefObj);
                    satDateObj.setDate(satDateObj.getDate() - 1);
                    const satISO = toISO(satDateObj);

                    finalResumos = await aggregateDays(finalResumos, satISO);
                    finalRefDate = satISO;
                    // Não atualizar dataRef para evitar reload, apenas notificar
                    aggregated = true;
                    targetDateLabel = 'Sábado';
                }
            }

            // Se estou vendo Sábado (ou Sábado resultante do Domingo) e é < 10h -> Mostra Sexta (com Sábado somado)
            currentRefObj = new Date(finalRefDate.includes('T') ? finalRefDate : finalRefDate + 'T12:00:00');
            if (currentRefObj.getDay() === 6) { // Sábado
                const totalSaturday = finalResumos.reduce((acc, r) => acc + (Number(r.horasDia) || 0), 0);
                if (totalSaturday < 10) {
                    console.log('Produção Dashboard: Sábado < 10h. Agregando à Sexta.');

                    const friDateObj = new Date(currentRefObj);
                    friDateObj.setDate(friDateObj.getDate() - 1);
                    const friISO = toISO(friDateObj);

                    finalResumos = await aggregateDays(finalResumos, friISO);
                    finalRefDate = friISO;
                    aggregated = true;
                    targetDateLabel = 'Sexta-feira';
                }
            }

            // Lógica "Olhar para Frente" (Forward Aggregation)
            // Se estou vendo Sexta -> Verificar se Sábado (e Domingo) devem ser somados aqui
            currentRefObj = new Date(finalRefDate.includes('T') ? finalRefDate : finalRefDate + 'T12:00:00');
            if (currentRefObj.getDay() === 5) { // Sexta
                // 1. Verificar Sábado seguinte
                const satDateObj = new Date(currentRefObj);
                satDateObj.setDate(satDateObj.getDate() + 1);
                const satISO = toISO(satDateObj);

                // Buscar resumo de sábado (raw)
                const satResumo = await listarResumoDiarioProducao({ dataRef: satISO });
                let totalSat = satResumo.reduce((acc, r) => acc + (Number(r.horasDia) || 0), 0);

                // 2. Verificar Domingo seguinte (para somar ao Sábado se necessário)
                const sunDateObj = new Date(satDateObj);
                sunDateObj.setDate(sunDateObj.getDate() + 1);
                const sunISO = toISO(sunDateObj);

                const sunResumo = await listarResumoDiarioProducao({ dataRef: sunISO });
                const totalSun = sunResumo.reduce((acc, r) => acc + (Number(r.horasDia) || 0), 0);

                // Se Domingo < 10h, soma ao Sábado
                let effectiveSatResumo = satResumo;
                if (totalSun < 10 && totalSun > 0) {
                    // Mesclar Domingo no Sábado (apenas em memória para verificação)
                    // Reutilizando aggregateDays logic logicamente (mas aqui invertido: source=Sun, target=Sat)
                    // Mas aggregateDays espera source=Current, target=Target.
                    // Aqui queremos somar Sun EM Sat.

                    // Simplificação: Apenas somar horas totais para a decisão
                    totalSat += totalSun;
                    // E concatenar arrays para fusão final
                    effectiveSatResumo = [...satResumo, ...sunResumo];
                }

                // Se Sábado (com Domingo) < 10h e > 0 -> Soma na Sexta
                if (totalSat < 10 && totalSat > 0) {
                    console.log('Produção Dashboard: Visualizando Sexta. Sábado seguinte < 10h detectado. Agregando.');

                    // A função aggregateDays espera (sourceData, targetDateISO).
                    // sourceData aqui é o Sábado (+ Domingo).
                    // targetDateISO é a Sexta (finalRefDate).
                    // Mas aggregateDays busca o target (Sexta) internamente.
                    // Então passamos effectiveSatResumo como source.

                    finalResumos = await aggregateDays(effectiveSatResumo, finalRefDate);

                    aggregated = true;
                    targetDateLabel = 'Sexta + Fim de Semana';
                }
            }

            if (aggregated) {
                toast.success(`Visualizando produção agregada com ${targetDateLabel} devido ao baixo volume (< 10h) na data selecionada.`, {
                    id: 'aggregated-toast',
                    duration: 5000
                });
            } else {
                toast.dismiss('aggregated-toast');
            }

            setResumos(finalResumos);
        } catch (err) {
            console.error(err);
            toast.error(t('common.error', 'Erro ao carregar dados'));
        } finally {
            setLoading(false);
        }
    }, [dataRef]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // [NEW] Buscar último upload para definir data/hora inicial
    useEffect(() => {
        buscarUltimoUploadProducao()
            .then((last) => {
                if (last) {
                    // Define dataRef para a data do upload
                    // last.dataRef vem como YYYY-MM-DD (string) ou ISO
                    const dr = last.dataRef.split('T')[0];
                    setDataRef(dr);

                    // Define hora para a hora de criação do upload (quando foi processado)
                    const d = new Date(last.criadoEm);
                    const hh = String(d.getHours()).padStart(2, '0');
                    const mm = String(d.getMinutes()).padStart(2, '0');
                    setHora(`${hh}:${mm}`);
                }
            })
            .catch(console.error);
    }, []);

    // Mapear metas por maquinaId
    const metasByMaquina = useMemo(() => {
        const map = new Map<string, number>();
        for (const m of metas) {
            if (!map.has(m.maquinaId)) {
                map.set(m.maquinaId, Number(m.horasMeta) || 0);
            }
        }
        return map;
    }, [metas]);

    // Mapear resumos por maquinaId
    const resumosByMaquina = useMemo(() => {
        const map = new Map<string, ProducaoResumoDiario>();
        for (const r of resumos) {
            map.set(r.maquinaId, r);
        }
        return map;
    }, [resumos]);

    // MAPA de máquinas para lookup rápido de pais
    const maquinasMap = useMemo(() => {
        const map = new Map<string, Maquina>();
        for (const m of maquinas) {
            map.set(m.id, m);
        }
        return map;
    }, [maquinas]);

    // Mapear filhos por pai
    const childrenByParent = useMemo(() => {
        const map = new Map<string, Maquina[]>();
        for (const m of maquinas) {
            if (m.parent_maquina_id) {
                const list = map.get(m.parent_maquina_id) || [];
                list.push(m);
                map.set(m.parent_maquina_id, list);
            }
        }
        return map;
    }, [maquinas]);

    // Construir linhas para todas as máquinas
    const linhas: LinhaMaquina[] = useMemo(() => {
        const rows: LinhaMaquina[] = [];

        for (const m of maquinas) {
            // Lógica de Visibilidade:
            // Se tiver pai, verificar se o pai está configurado para mostrar filhos
            let show = true;
            if (m.parent_maquina_id) {
                const parent = maquinasMap.get(m.parent_maquina_id);
                // Se o pai existe e diz "NÃO exibir filhos", então escondemos este filho
                if (parent && parent.exibir_filhos_dashboard === false) {
                    show = false;
                }
            }

            if (!show) continue;

            const resumo = resumosByMaquina.get(m.id);
            let produzido = resumo ? Number(resumo.horasDia) || 0 : 0;
            const metaVigente = metasByMaquina.get(m.id) || 0;
            let meta = metaVigente; // Pode ser somada se for mãe

            // Se for mãe, somar produção dos filhos
            if (m.is_maquina_mae) {
                const filhos = childrenByParent.get(m.id) || [];
                for (const f of filhos) {
                    const rFilho = resumosByMaquina.get(f.id);
                    const prodFilho = rFilho ? Number(rFilho.horasDia) || 0 : 0;
                    const metaFilho = metasByMaquina.get(f.id) || 0;

                    produzido += prodFilho;
                    meta += metaFilho;
                }
            }

            const esperado = +(meta * frac).toFixed(2);

            let aderencia: number | null = null;
            if (!isFuture) {
                if (esperado > 0) {
                    aderencia = (produzido / esperado) * 100;
                } else if (isPast && meta > 0) {
                    aderencia = (produzido / meta) * 100;
                } else {
                    aderencia = 0;
                }
            }

            const desvio = +(produzido - esperado).toFixed(2);

            rows.push({
                maquinaId: m.id,
                maquinaNome: m.nome_producao || m.nome,
                setor: m.setor,
                produzido,
                meta,
                esperado,
                aderencia,
                desvio,
                isMother: !!m.is_maquina_mae, // Flag para ordenação
                isChild: !!m.parent_maquina_id
            });
        }

        // Ordenação Personalizada:
        // 1. Mães primeiro
        // 2. Aderência ascendente (pior performance primeiro)
        return rows.sort((a, b) => {
            // Regra 1: Mãe vem antes
            if (a.isMother && !b.isMother) return -1;
            if (!a.isMother && b.isMother) return 1;

            // Regra 2: Aderência (menor primeiro)
            const pctA = a.aderencia ?? -1;
            const pctB = b.aderencia ?? -1;
            return pctA - pctB;
        });
    }, [maquinas, maquinasMap, childrenByParent, resumosByMaquina, metasByMaquina, frac, isFuture, isPast]);

    // Filtrar linhas por setor
    const linhasFiltradas = useMemo(() => {
        if (setorFiltro === 'todos') return linhas;
        return linhas.filter((l) => {
            const s = l.setor || '';
            return s.toLowerCase().trim() === setorFiltro.toLowerCase();
        });
    }, [linhas, setorFiltro]);

    // Totais agregados
    const fabrica = useMemo(() => {
        // Para evitar dupla contagem (Mãe + Filhos), somamos APENAS as 'raízes' (Mães ou Independentes)
        // Como 'linhas' já contém os dados agregados nas Mães, se somarmos uma Mãe e seus Filhos, duplicamos.
        // A solução é filtrar apenas as linhas que NÃO são filhas (isChild !== true).

        const roots = linhasFiltradas.filter(l => !l.isChild);

        const produzido = roots.reduce((s, r) => s + r.produzido, 0);
        const meta = roots.reduce((s, r) => s + r.meta, 0);
        const esperado = roots.reduce((s, r) => s + r.esperado, 0);

        let aderencia: number | null = null;
        if (!isFuture) {
            if (esperado > 0) {
                aderencia = (produzido / esperado) * 100;
            } else if (isPast && meta > 0) {
                aderencia = (produzido / meta) * 100;
            } else {
                aderencia = 0;
            }
        }

        const projEod = frac > 0 ? produzido / frac : 0;
        const gapEod = +(projEod - meta).toFixed(2);

        // Contagem de máquinas físicas reais no filtro
        // Se a linha representa uma mãe agregadora, quantas máquinas reais tem lá dentro?
        // Simplificação: count = roots.length (número de linhas de produção/maquinas independentes)
        // Ou count = soma de todas as linhasFiltradas que são máquinas FÍSICAS?
        // Se a mãe é puramente virtual, não deveria contar? 
        // Vamos manter roots.length por enquanto como "Unidades Produtivas Principais"

        return {
            maquinas: roots.length,
            produzido: +produzido.toFixed(2),
            meta: +meta.toFixed(2),
            esperado: +esperado.toFixed(2),
            aderencia: aderencia !== null ? +aderencia.toFixed(2) : null,
            projEod: +projEod.toFixed(2),
            gapEod,
        };
    }, [linhasFiltradas, frac, isFuture, isPast]);

    return (
        <>
            <PageHeader
                title={t('producao.dashboard.title', 'Visão do Dia')}
                subtitle={t('producao.dashboard.subtitle', 'Acompanhamento de produção por máquina')}
            />

            <div className={styles.container}>
                {/* Filtro de Setores (Tabs Discretas) */}
                <div style={{ marginBottom: 16 }}>
                    <div className={styles.sectorTabs}>
                        <button
                            className={`${styles.sectorTab} ${setorFiltro === 'Usinagem' ? styles.sectorTabActive : ''
                                }`}
                            onClick={() => setSetorFiltro('Usinagem')}
                        >
                            {t('producao.dashboard.sectors.machining', 'Usinagem')}
                        </button>
                        <button
                            className={`${styles.sectorTab} ${setorFiltro === 'Montagem' ? styles.sectorTabActive : ''
                                }`}
                            onClick={() => setSetorFiltro('Montagem')}
                        >
                            {t('producao.dashboard.sectors.assembly', 'Montagem')}
                        </button>
                        <button
                            className={`${styles.sectorTab} ${setorFiltro === 'todos' ? styles.sectorTabActive : ''
                                }`}
                            onClick={() => setSetorFiltro('todos')}
                        >
                            {t('producao.dashboard.sectors.all', 'Todos')}
                        </button>
                    </div>
                </div>

                {/* Header Grid: Data + Hora + Summary Card */}
                <div className={styles.headerGrid}>
                    {/* Seletor de Data */}
                    {/* Seletor de Data */}
                    <div className={styles.dateCard}>
                        <label className={styles.inputLabel}>
                            <FiCalendar style={{ marginRight: 6 }} />
                            {t('producao.dashboard.dateLabel', 'Data do WIP')}
                        </label>
                        <input
                            type="date"
                            className={styles.dateInput}
                            value={dataRef}
                            onChange={(e) => setDataRef(e.target.value)}
                        />
                    </div>

                    {/* Seletor de Hora */}
                    <div className={styles.dateCard}>
                        <label className={styles.inputLabel}>
                            <FiClock style={{ marginRight: 6 }} />
                            {t('producao.dashboard.timeLabel', 'Hora referência (05:30 → 00:44)')}
                        </label>
                        <input
                            type="time"
                            className={styles.dateInput}
                            value={hora}
                            onChange={(e) => setHora(e.target.value)}
                            disabled={isPast || isFuture}
                        />
                        {isPast && (
                            <span className={styles.helperText}>{t('producao.dashboard.timeHelper.past', 'Dia concluído — usando janela completa')}</span>
                        )}
                        {isFuture && (
                            <span className={styles.helperText}>{t('producao.dashboard.timeHelper.future', 'Dia futuro — aguardando início')}</span>
                        )}
                        {isToday && (
                            <span className={styles.helperText}>{t('producao.dashboard.timeHelper.today', { pct: (frac * 100).toFixed(0), defaultValue: '{{pct}}% do dia' })}</span>
                        )}
                    </div>

                    {/* Card de Resumo da Fábrica */}
                    <div className={styles.summaryCard}>
                        <div className={styles.summaryHeader}>
                            <span className={styles.summaryTitle}>
                                <FiActivity style={{ marginRight: 6 }} />
                                {t('producao.dashboard.summary.title', 'Total Fábrica')}
                            </span>
                            {loading ? (
                                <Skeleton variant="rectangular" width={60} height={24} sx={{ borderRadius: 2 }} />
                            ) : isFuture ? (
                                <span className={`${styles.badge} ${styles.badgeGray}`}>{t('producao.dashboard.summary.future', 'FUTURO')}</span>
                            ) : (
                                <span
                                    className={`${styles.badge} ${styles[
                                        `badge${colorForPct(fabrica.aderencia).charAt(0).toUpperCase() +
                                        colorForPct(fabrica.aderencia).slice(1)
                                        }`
                                    ]
                                        }`}
                                >
                                    {fabrica.aderencia !== null ? `${fabrica.aderencia.toFixed(1)}%` : '—'}
                                </span>
                            )}
                        </div>

                        <div className={styles.summaryBody}>
                            {loading ? (
                                <>
                                    <Skeleton variant="text" width="100%" height={24} />
                                    <Skeleton variant="text" width="100%" height={24} />
                                    <Skeleton variant="text" width="100%" height={24} />
                                </>
                            ) : (

                                <>
                                    <div className={styles.summaryRow}>
                                        <span>{t('producao.dashboard.summary.produced', 'Produzido')}:</span>
                                        <strong>{fabrica.produzido.toFixed(2)} h</strong>
                                    </div>
                                    <div className={styles.summaryRow}>
                                        <span>{t('producao.dashboard.summary.expected', 'Esperado')}:</span>
                                        <strong>{fabrica.esperado.toFixed(2)} h</strong>
                                    </div>
                                    <div className={styles.summaryRow}>
                                        <span>{t('producao.dashboard.summary.dailyGoal', 'Meta diária')}:</span>
                                        <strong>{fabrica.meta.toFixed(2)} h</strong>
                                    </div>
                                </>
                            )}

                        </div>

                        {/* Barra de progresso vs esperado */}
                        {!loading && (
                            <>
                                <div className={styles.progressContainer}>
                                    <span className={styles.progressLabel}>{t('producao.dashboard.summary.progressVsExpected', 'Progresso vs esperado')}</span>
                                    <div className={styles.progressBar}>
                                        <div
                                            className={`${styles.progressFill} ${styles[
                                                `progress${colorForPct(fabrica.aderencia).charAt(0).toUpperCase() +
                                                colorForPct(fabrica.aderencia).slice(1)
                                                }`
                                            ]
                                                }`}
                                            style={{ width: `${clamp(fabrica.aderencia || 0)}%` }}
                                        />
                                    </div>
                                </div>

                                <div className={styles.summaryFooter}>
                                    <span className={styles.badgeDot}>{t('producao.dashboard.summary.machines', 'Máquinas')}: {fabrica.maquinas}</span>
                                    <span className={styles.badgeDot}>{t('producao.dashboard.summary.projection', 'Projeção')}: {fabrica.projEod.toFixed(2)} h</span>
                                    <span
                                        className={`${styles.badgeDot} ${fabrica.gapEod >= 0 ? styles.textGreen : styles.textRed
                                            }`}
                                    >
                                        {t('producao.dashboard.summary.gap', 'Gap')}: {fabrica.gapEod >= 0 ? '+' : ''}
                                        {fabrica.gapEod.toFixed(2)} h
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </div >

                {/* Loading Skeleton */}
                {
                    loading && (
                        <div className={styles.cardsGrid}>
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <div key={i} className={styles.machineCard}>
                                    <Skeleton variant="text" width="60%" height={24} />
                                    <Skeleton variant="text" width="100%" height={20} sx={{ mt: 1 }} />
                                    <Skeleton variant="text" width="100%" height={20} />
                                    <Skeleton variant="text" width="100%" height={20} />
                                    <Skeleton
                                        variant="rectangular"
                                        width="100%"
                                        height={8}
                                        sx={{ mt: 2, borderRadius: 1 }}
                                    />
                                </div>
                            ))}
                        </div>
                    )
                }

                {/* Empty State */}
                {
                    !loading && linhasFiltradas.length === 0 && (
                        <div className={styles.emptyState}>
                            <FiBarChart2 className={styles.emptyIcon} />
                            <p>
                                {maquinas.length === 0
                                    ? t('producao.dashboard.empty.noScope', 'Nenhuma máquina com escopo de produção ativo.')
                                    : t('producao.dashboard.empty.noFilter', 'Nenhuma máquina encontrada para este filtro. Verifique se os setores estão preenchidos na tela de Configuração.')}
                            </p>
                        </div>
                    )
                }

                {/* Grid de Cards por Máquina */}
                {
                    !loading && linhasFiltradas.length > 0 && (
                        <div className={styles.cardsGrid}>
                            {linhasFiltradas.map((r) => {
                                const color = colorForPct(r.aderencia);
                                const pctEsperado = r.esperado > 0 ? (r.produzido / r.esperado) * 100 : 0;
                                const pctMeta = r.meta > 0 ? (r.produzido / r.meta) * 100 : 0;

                                return (
                                    <div key={r.maquinaId} className={styles.machineCard} data-status={color}>
                                        <div className={styles.cardHeader}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className={styles.machineName}>{r.maquinaNome}</span>
                                                {r.isMother && (
                                                    <span className={styles.motherBadge}>
                                                        {t('producao.dashboard.mother', 'MÃE')}
                                                    </span>
                                                )}
                                            </div>
                                            {isFuture ? (
                                                <span className={`${styles.badge} ${styles.badgeGray}`}>{t('producao.dashboard.summary.future', 'FUTURO')}</span>
                                            ) : (
                                                <span
                                                    className={`${styles.badge} ${styles[`badge${color.charAt(0).toUpperCase() + color.slice(1)}`]
                                                        }`}
                                                >
                                                    {r.aderencia !== null ? `${r.aderencia.toFixed(1)}%` : t('producao.dashboard.summary.noGoal', 'Sem meta')}
                                                </span>
                                            )}
                                        </div>

                                        <div className={styles.cardBody}>
                                            <div className={styles.statLine}>
                                                <span>{t('producao.dashboard.summary.produced', 'Produzido')}:</span>
                                                <strong>{r.produzido.toFixed(2)} h</strong>
                                            </div>
                                            <div className={styles.statLine}>
                                                <span>{t('producao.dashboard.summary.expected', 'Esperado')}:</span>
                                                <strong>{r.esperado.toFixed(2)} h</strong>
                                            </div>
                                            <div className={styles.statLine}>
                                                <span>{t('producao.dashboard.summary.dailyGoal', 'Meta diária')}:</span>
                                                <strong>{r.meta.toFixed(2)} h</strong>
                                            </div>
                                            <div className={styles.statLine}>
                                                <span>{t('producao.dashboard.summary.deviation', 'Desvio')}:</span>
                                                <strong style={{ color: r.desvio >= 0 ? '#16a34a' : '#dc2626' }}>
                                                    {r.desvio >= 0 ? '+' : ''}
                                                    {r.desvio.toFixed(2)} h
                                                </strong>
                                            </div>
                                        </div>

                                        {/* Barras de progresso */}
                                        <div className={styles.cardProgress}>
                                            <span className={styles.progressLabel}>{t('producao.dashboard.summary.progressVsExpected', 'vs esperado')}</span>
                                            <div className={styles.progressBar}>
                                                <div
                                                    className={`${styles.progressFill} ${styles[`progress${color.charAt(0).toUpperCase() + color.slice(1)}`]
                                                        }`}
                                                    style={{ width: `${clamp(pctEsperado)}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className={styles.cardProgress}>
                                            <span className={styles.progressLabel}>{t('producao.dashboard.summary.progressVsGoal', 'vs meta do dia')}</span>
                                            <div className={styles.progressBar}>
                                                <div
                                                    className={`${styles.progressFill} ${styles.progressBlue}`}
                                                    style={{ width: `${clamp(pctMeta)}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className={styles.cardFooter}>
                                            <span className={styles.badgeDot}>{pctEsperado.toFixed(0)}% esp.</span>
                                            <span className={styles.badgeDot}>{pctMeta.toFixed(0)}% meta</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                }
            </div >
        </>
    );
}
