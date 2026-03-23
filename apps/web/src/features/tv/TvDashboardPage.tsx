// src/features/tv/TvDashboardPage.tsx
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight, FiMaximize, FiMinimize, FiMonitor, FiArrowLeft, FiMapPin } from 'react-icons/fi';
import {
    listarMaquinas,
    listarMetasProducao,
    listarResumoDiarioProducao,
    buscarUltimoUploadProducao,
    getUltimoUploadPlanejamentoTv,
    getCapacidadeResumoTv,
    BASE,
    http,
    type ProducaoMeta,
    type ProducaoResumoDiario,
} from '../../services/apiClient';
import type { Maquina } from '@spiraview/shared';
import SlideResumo from './components/SlideResumo';
import useSSE from '../../hooks/useSSE';
import SlidePlanejamento from './components/SlidePlanejamento';
import styles from './TvDashboardPage.module.css';

// ==================== HELPERS ====================
function toISO(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function getCurrentHHMM(): string {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fracDiaLogico(hhmm: string): number {
    const toMin = (s: string) => {
        const [h, m] = s.split(':').map(Number);
        return h * 60 + m;
    };
    const START = toMin('05:30');     // 05:30 = 330 min
    const END_NEXT_DAY = 44;          // 00:44 = 44 min (no dia seguinte)
    const TOTAL_DURATION = (24 * 60 - START) + END_NEXT_DAY; // 1154 min

    let cur = toMin(hhmm);

    // Se é entre 00:00 e 00:44, é fim da jornada (tratar como + 24h)
    if (cur < END_NEXT_DAY + 1) {
        cur += 24 * 60; // Adiciona 24h para normalizar
    }

    // Antes do início da jornada
    if (cur < START) return 0;

    // Após o fim da jornada (00:45 a 05:29)
    if (cur >= START && cur < 24 * 60 + END_NEXT_DAY) {
        // Dentro da jornada
        return Math.min(1, (cur - START) / TOTAL_DURATION);
    }

    return 1; // Jornada completa
}

function perfColor(pct: number | null): string {
    if (pct === null) return '#94a3b8';
    if (pct >= 100) return '#059669'; // Verde mais vibrante/saturado para excelência
    if (pct >= 90) return '#10b981';  // Verde sólido
    if (pct >= 80) return '#eab308';  // Amarelo
    if (pct >= 70) return '#f59e0b';  // Laranja
    return '#ef4444';                  // Vermelho
}

function clamp(v: number, min = 0, max = 100) {
    return Math.max(min, Math.min(max, v));
}

function formatNum(n: number, decimals = 2): string {
    return n.toFixed(decimals);
}

function formatDateBR(iso: string): string {
    try {
        // Extrair data diretamente da string para evitar problemas de timezone
        // Aceita formatos: 2024-12-17 ou 2024-12-17T03:00:00.000Z
        const dateStr = iso.includes('T') ? iso.slice(0, 10) : iso;
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const [, m, d] = parts;
            return `${d}/${m}`;
        }
        return iso;
    } catch {
        return iso;
    }
}

function formatDateTime(isoDate: string): string {
    try {
        const d = new Date(isoDate);
        return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '--:--';
    }
}

// ==================== TYPES ====================
interface Contribuinte {
    codigo: string;
    produzido: number;
}

interface LinhaMaquina {
    maquinaId: string;
    maquinaNome: string;
    setor?: string;
    produzido: number;
    meta: number;
    esperado: number;
    aderencia: number | null;
    desvio: number;
    isMother?: boolean;
    isChild?: boolean;
    exibirFilhos?: boolean; // Máquina mãe que exibe filhos (deve ser fixada)
    contribuintes?: Contribuinte[]; // Top 5 filhos que contribuíram para produção
    isStale?: boolean;    // Se dados são mais antigos que o upload global (lógica de justiça)
    lastRefTime?: string; // Hora da última atualização real (ex: "12:11")
}

// ==================== COMPONENT ====================
export default function TvDashboardPage() {
    const navigate = useNavigate();
    const { scope = 'geral' } = useParams<{ scope?: string }>();
    const rootRef = useRef<HTMLDivElement>(null);

    const [dataRef, setDataRef] = useState<string>(() => toISO(new Date()));
    const [nowISO, setNowISO] = useState<string>(() => toISO(new Date()));
    const [lastUpdateTime, setLastUpdateTime] = useState<string>('--:--');
    const [uploadHHMM, setUploadHHMM] = useState<string>('--:--'); // Hora do upload para cálculo de frac
    const [maquinas, setMaquinas] = useState<Maquina[]>([]);
    const [metas, setMetas] = useState<ProducaoMeta[]>([]);
    const [resumos, setResumos] = useState<ProducaoResumoDiario[]>([]);
    const [historicoRaw, setHistoricoRaw] = useState<ProducaoResumoDiario[]>([]); // Dados brutos do histórico
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(false);
    const failCountRef = useRef(0);
    const MAX_FAILURES = 5;

    // Carrossel
    const [currentPage, setCurrentPage] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const CARDS_PER_PAGE = 6;
    const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutos — fallback caso SSE não esteja disponível
    const SLIDE_INTERVAL = 12000; // 12 segundos por slide

    // Título dinâmico baseado no escopo
    const tituloPainel = useMemo(() => {
        if (scope === 'planejamento') return 'Painel de Planejamento';
        if (scope === 'montagem') return 'Painel de Montagem';
        if (scope === 'usinagem') return 'Painel de Usinagem';
        return 'Painel Geral de Produção';
    }, [scope]);

    const isPlanejamento = scope === 'planejamento';

    // Comparar apenas a data (sem hora) para isToday/isPast
    // Usar slice para evitar problemas de timezone
    const refDateOnly = useMemo(() => {
        // dataRef já foi normalizado para YYYY-MM-DD no fetchData
        return dataRef.includes('T') ? dataRef.slice(0, 10) : dataRef;
    }, [dataRef]);

    // todayISO e yesterdayISO derivados de nowISO (atualizado a cada fetch)
    // para não ficarem obsoletos quando a página passa da meia-noite sem recarregar
    const todayISO = nowISO;
    const yesterdayISO = useMemo(() => {
        const yesterday = new Date(nowISO + 'T12:00:00');
        yesterday.setDate(yesterday.getDate() - 1);
        return `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    }, [nowISO]);

    const isToday = refDateOnly === todayISO;
    const isYesterday = refDateOnly === yesterdayISO;
    const isPast = refDateOnly < todayISO;
    const isFuture = !isToday && !isPast;

    const frac = useMemo(() => {
        if (isPast) return 1;
        if (isFuture) return 0;
        // Para hoje, usar fração baseada na hora do ÚLTIMO UPLOAD (não hora atual)
        if (uploadHHMM === '--:--') return 0;
        return fracDiaLogico(uploadHHMM);
    }, [isPast, isFuture, uploadHHMM]);

    // ==================== DATA FETCHING ====================
    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setFetchError(false);

            // Buscar último upload baseado no scope
            let refDate: string;
            let refTime: string;
            let uploadTime: string;

            if (scope === 'planejamento') {
                // Para planejamento, buscar último upload de planejamento
                const data = await getUltimoUploadPlanejamentoTv();
                const ultimoUpload = data.upload;

                if (ultimoUpload?.criadoEm) {
                    const uploadDate = new Date(ultimoUpload.criadoEm);
                    refDate = toISO(uploadDate);
                    refTime = formatDateTime(ultimoUpload.criadoEm);
                    uploadTime = `${String(uploadDate.getHours()).padStart(2, '0')}:${String(uploadDate.getMinutes()).padStart(2, '0')}`;
                } else {
                    refDate = toISO(new Date());
                    refTime = '--:--';
                    uploadTime = '--:--';
                }
            } else {
                // Para outros scopes, buscar último upload de produção
                const ultimoUpload = await buscarUltimoUploadProducao();
                refDate = ultimoUpload?.dataRef || toISO(new Date());
                if (refDate.includes('T')) {
                    refDate = refDate.slice(0, 10);
                }
                refTime = ultimoUpload?.criadoEm ? formatDateTime(ultimoUpload.criadoEm) : '--:--';

                uploadTime = '--:--';
                if (ultimoUpload?.criadoEm) {
                    const uploadDate = new Date(ultimoUpload.criadoEm);
                    uploadTime = `${String(uploadDate.getHours()).padStart(2, '0')}:${String(uploadDate.getMinutes()).padStart(2, '0')}`;
                }
            }

            setDataRef(refDate);
            setNowISO(toISO(new Date())); // Atualiza "hoje" a cada fetch para detectar virada de dia
            setLastUpdateTime(refTime);
            setUploadHHMM(uploadTime);

            // Calcular data de início para histórico (14 dias antes)
            const refDateObj = new Date(refDate + 'T12:00:00');
            const dataInicioObj = new Date(refDateObj);
            dataInicioObj.setDate(dataInicioObj.getDate() - 13);
            const dataInicio = toISO(dataInicioObj);

            // Buscar dados usando a data de referência do upload
            const [maqData, metasData, resumoData, historicoData] = await Promise.all([
                listarMaquinas({ escopo: 'producao' }),
                listarMetasProducao({ vigente: true }),
                listarResumoDiarioProducao({ dataRef: refDate }),
                listarResumoDiarioProducao({ dataInicio, dataFim: refDate }),
            ]);
            setMaquinas(maqData as Maquina[]);
            setMetas(metasData);

            // Lógica de Agregação em Cascata (Domingo -> Sábado -> Sexta)
            let finalResumos = resumoData;
            let finalRefDate = refDate;

            // Helper para agregar dias
            const aggregateDays = (
                sourceData: ProducaoResumoDiario[],
                targetDateISO: string,
                targetHistory: ProducaoResumoDiario[]
            ) => {
                // Buscar dados do dia alvo no histórico
                const targetDayData = targetHistory.filter(h => {
                    const hDate = typeof h.dataRef === 'string' && h.dataRef.includes('T')
                        ? h.dataRef.slice(0, 10)
                        : h.dataRef;
                    return hDate === targetDateISO;
                });

                // Criar mapa para fusão
                const mergedMap = new Map<string, ProducaoResumoDiario>();

                // 1. Adicionar dados do alvo (base)
                targetDayData.forEach(item => {
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
            if (currentRefObj.getDay() === 0) { // Domingo
                const totalSunday = finalResumos.reduce((acc, r) => acc + (Number(r.horasDia) || 0), 0);
                if (totalSunday < 10) {
                    console.log('TV Dashboard: Domingo < 10h. Agregando ao Sábado.');

                    const satDateObj = new Date(currentRefObj);
                    satDateObj.setDate(satDateObj.getDate() - 1);
                    const satISO = toISO(satDateObj);

                    finalResumos = aggregateDays(finalResumos, satISO, historicoData);
                    finalRefDate = satISO;
                }
            }

            // 2. Verificar Sábado -> Sexta (pode ser o Sábado original ou o resultado da fusão do Domingo)
            currentRefObj = new Date(finalRefDate.includes('T') ? finalRefDate : finalRefDate + 'T12:00:00');
            if (currentRefObj.getDay() === 6) { // Sábado
                const totalSaturday = finalResumos.reduce((acc, r) => acc + (Number(r.horasDia) || 0), 0);
                if (totalSaturday < 10) {
                    console.log('TV Dashboard: Sábado < 10h. Agregando à Sexta.');

                    const friDateObj = new Date(currentRefObj);
                    friDateObj.setDate(friDateObj.getDate() - 1);
                    const friISO = toISO(friDateObj);

                    finalResumos = aggregateDays(finalResumos, friISO, historicoData);
                    finalRefDate = friISO;
                }
            }

            setResumos(finalResumos);
            setDataRef(finalRefDate);

            // Salvar dados brutos do histórico (processamento será feito no useMemo com filtro por scope)
            setHistoricoRaw(historicoData);
            failCountRef.current = 0;
        } catch (err) {
            console.error('Erro ao carregar dados TV:', err);
            failCountRef.current += 1;
            setFetchError(true);
            if (failCountRef.current >= MAX_FAILURES) {
                // Forçar re-autenticação após falhas consecutivas
                localStorage.removeItem('tv_token');
                navigate('/tv');
            }
        } finally {
            setLoading(false);
        }
    }, [scope, navigate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Auto-refresh via SSE — atualiza imediatamente quando há novos lançamentos ou upload ativado
    useSSE('producao_lancamentos', fetchData);
    useSSE('producao_uploads', fetchData);

    // Polling como fallback (30 min) — garante atualização mesmo se SSE cair
    useEffect(() => {
        const id = setInterval(fetchData, REFRESH_INTERVAL);
        return () => clearInterval(id);
    }, [fetchData]);

    // Retry acelerado (2 min) quando em estado de erro
    useEffect(() => {
        if (!fetchError) return;
        const id = setInterval(fetchData, 2 * 60 * 1000);
        return () => clearInterval(id);
    }, [fetchError, fetchData]);

    // ==================== DATA PROCESSING ====================
    const metasByMaquina = useMemo(() => {
        const map = new Map<string, number>();
        for (const m of metas) {
            if (!map.has(m.maquinaId)) {
                map.set(m.maquinaId, Number(m.horasMeta) || 0);
            }
        }
        return map;
    }, [metas]);

    const resumosByMaquina = useMemo(() => {
        const map = new Map<string, ProducaoResumoDiario>();
        for (const r of resumos) {
            map.set(r.maquinaId, r);
        }
        return map;
    }, [resumos]);

    const maquinasMap = useMemo(() => {
        const map = new Map<string, Maquina>();
        for (const m of maquinas) {
            map.set(m.id, m);
        }
        return map;
    }, [maquinas]);

    // Processar histórico filtrado por scope
    const historicoDias = useMemo(() => {
        // Filtrar máquinas por scope para calcular meta
        // Planejamento usa todos os dados (geral) para o slide de produção
        const maquinasFiltradas = maquinas.filter(m => {
            if (scope === 'geral' || scope === 'planejamento') return true;
            const setor = (m.setor || '').toLowerCase();
            return setor === scope.toLowerCase();
        });
        const maquinaIdsDoScope = new Set(maquinasFiltradas.map(m => m.id));

        // Calcular meta total apenas das máquinas do scope
        const metasByMaq = new Map<string, number>();
        let metaTotalDia = 0;
        for (const m of metas) {
            if (maquinaIdsDoScope.has(m.maquinaId) && !metasByMaq.has(m.maquinaId)) {
                const metaValor = Number(m.horasMeta) || 0;
                metasByMaq.set(m.maquinaId, metaValor);
                metaTotalDia += metaValor;
            }
        }

        // Agrupar resumos por data, filtrando apenas máquinas do scope
        const byDate = new Map<string, number>();
        for (const r of historicoRaw) {
            if (!maquinaIdsDoScope.has(r.maquinaId)) continue;
            const dt = typeof r.dataRef === 'string' ? r.dataRef.slice(0, 10) : toISO(new Date(r.dataRef));
            const curr = byDate.get(dt) || 0;
            byDate.set(dt, curr + (Number(r.horasDia) || 0));
        }

        // Converter para array ordenado
        // Converter e preparar para processamento
        const sortedDays = Array.from(byDate.entries())
            .map(([iso, produzido]) => {
                const d = new Date(iso + 'T12:00:00');
                const weekDay = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()];
                const dayMonth = `${d.getDate()}/${d.getMonth() + 1}`;
                return {
                    iso,
                    label: `${weekDay} ${dayMonth}`,
                    produzido,
                    meta: metaTotalDia,
                    pct: metaTotalDia > 0 ? (produzido / metaTotalDia) * 100 : 0,
                    isSaturday: d.getDay() === 6,
                    dayOfWeek: d.getDay(), // Auxiliar para lógica (0=Dom, 6=Sáb)
                };
            })
            .sort((a, b) => a.iso.localeCompare(b.iso));

        // Agregar Domingos com < 10h no Sábado (ou Sexta)
        // E Sábados com < 10h na Sexta
        const processedDays = [];
        let pendingFridayIndex = -1;
        let pendingSaturdayIndex = -1;

        for (const current of sortedDays) {
            // Se for Sexta
            if (current.dayOfWeek === 5) {
                pendingFridayIndex = processedDays.length;
                pendingSaturdayIndex = -1; // Resetar
                processedDays.push({ ...current });
                continue;
            }

            // Se for Sábado
            if (current.dayOfWeek === 6) {
                // Se existe Sexta anterior E horas < 10
                if (pendingFridayIndex !== -1 && current.produzido < 10) {
                    // Agregar à Sexta
                    const fri = processedDays[pendingFridayIndex];
                    fri.produzido += current.produzido;
                    fri.pct = fri.meta > 0 ? (fri.produzido / fri.meta) * 100 : 0;

                    // Sábado foi absorvido.
                    // Para o Domingo, a "referência de sábado" passa a ser a sexta combinada
                    pendingSaturdayIndex = pendingFridayIndex;
                } else {
                    // Sábado normal
                    pendingSaturdayIndex = processedDays.length;
                    processedDays.push({ ...current });
                    pendingFridayIndex = -1; // Sexta já passou, não agrega mais
                }
                continue;
            }

            // Se for Domingo
            if (current.dayOfWeek === 0) {
                // Se existe Sábado (ou Sexta combinada) anterior pendente E horas < 10
                if (pendingSaturdayIndex !== -1 && current.produzido < 10) {
                    // Agregar
                    const target = processedDays[pendingSaturdayIndex];
                    target.produzido += current.produzido;
                    target.pct = target.meta > 0 ? (target.produzido / target.meta) * 100 : 0;

                    // Resetar (domingo é absorvido)
                    pendingSaturdayIndex = -1;
                } else {
                    // Domingo normal entrou
                    processedDays.push({ ...current });
                    pendingSaturdayIndex = -1;
                    pendingFridayIndex = -1;
                }
            } else {
                // Outros dias
                processedDays.push({ ...current });
                pendingSaturdayIndex = -1;
                pendingFridayIndex = -1;
            }
        }

        return processedDays;
    }, [maquinas, metas, historicoRaw, scope]);

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

    const linhas: LinhaMaquina[] = useMemo(() => {
        const rows: LinhaMaquina[] = [];

        for (const m of maquinas) {
            // Filtrar por escopo/setor
            if (scope !== 'geral') {
                const setor = (m.setor || '').toLowerCase();
                if (setor !== scope.toLowerCase()) continue;
            }

            let show = true;
            if (m.parent_maquina_id) {
                const parent = maquinasMap.get(m.parent_maquina_id);
                if (parent && parent.exibir_filhos_dashboard === false) {
                    show = false;
                }
            }
            if (!show) continue;

            const resumo = resumosByMaquina.get(m.id);
            let produzido = resumo ? Number(resumo.horasDia) || 0 : 0;
            const metaVigente = metasByMaquina.get(m.id) || 0;
            let meta = metaVigente;

            // Lógica de justiça: calcular frac individual se timestamp difere do global
            let maqFrac = frac;
            let isStale = false;
            let lastRefTime: string | undefined;

            if (resumo?.ultimaAtualizacaoEm && uploadHHMM !== '--:--' && isToday) {
                const maqRefDate = new Date(resumo.ultimaAtualizacaoEm);
                const maqHHMM = `${String(maqRefDate.getHours()).padStart(2, '0')}:${String(maqRefDate.getMinutes()).padStart(2, '0')}`;
                lastRefTime = maqHHMM;

                // Se diferença > 2 minutos do upload global, é stale
                const globalDate = new Date();
                const [gH, gM] = uploadHHMM.split(':').map(Number);
                globalDate.setHours(gH, gM, 0, 0);

                const diffMs = globalDate.getTime() - maqRefDate.getTime();
                if (diffMs > 2 * 60 * 1000) {
                    isStale = true;
                    maqFrac = fracDiaLogico(maqHHMM);
                }
            }

            let contribuintes: Contribuinte[] | undefined;
            if (m.is_maquina_mae) {
                const filhos = childrenByParent.get(m.id) || [];
                const filhosData: Contribuinte[] = [];
                for (const f of filhos) {
                    const rFilho = resumosByMaquina.get(f.id);
                    const horasFilho = rFilho ? Number(rFilho.horasDia) || 0 : 0;
                    produzido += horasFilho;
                    meta += metasByMaquina.get(f.id) || 0;
                    if (horasFilho > 0) {
                        filhosData.push({ codigo: f.nome_producao || f.nome, produzido: horasFilho });
                    }
                }
                // Top 5 ordenados por produção
                contribuintes = filhosData.sort((a, b) => b.produzido - a.produzido).slice(0, 5);
            }

            const esperado = +(meta * maqFrac).toFixed(2);
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

            rows.push({
                maquinaId: m.id,
                maquinaNome: m.nome_producao || m.nome,
                setor: m.setor,
                produzido,
                meta,
                esperado,
                aderencia,
                desvio: +(produzido - esperado).toFixed(2),
                isMother: !!m.is_maquina_mae,
                isChild: !!m.parent_maquina_id,
                exibirFilhos: !!m.is_maquina_mae && m.exibir_filhos_dashboard === true,
                contribuintes,
                isStale,
                lastRefTime
            });
        }

        // Ordenar por aderência decrescente (melhor ao pior)
        return rows.sort((a, b) => (b.aderencia ?? -1) - (a.aderencia ?? -1));
    }, [maquinas, maquinasMap, childrenByParent, resumosByMaquina, metasByMaquina, frac, isFuture, isPast, scope, uploadHHMM, isToday]);

    // Calcular totais
    const totais = useMemo(() => {
        const roots = linhas.filter(l => !l.isChild);
        const produzido = roots.reduce((s, r) => s + r.produzido, 0);
        const meta = roots.reduce((s, r) => s + r.meta, 0);
        const esperado = roots.reduce((s, r) => s + r.esperado, 0);

        let aderencia: number | null = null;
        if (!isFuture && esperado > 0) {
            aderencia = (produzido / esperado) * 100;
        }

        return { produzido, meta, esperado, aderencia };
    }, [linhas, isFuture]);

    // Separar máquinas mãe (pinned) das outras - apenas em setores específicos, não no geral
    // Só fixa se exibir_filhos_dashboard = true
    const { pinnedMaquinas, regularMaquinas } = useMemo(() => {
        if (scope === 'geral') {
            // Sem pins no modo geral
            return { pinnedMaquinas: [], regularMaquinas: linhas };
        }
        // Em setores específicos, máquinas mãe com filhos exibidos ficam fixadas
        const pinned = linhas.filter(l => l.exibirFilhos);
        const regular = linhas.filter(l => !l.exibirFilhos);
        return { pinnedMaquinas: pinned, regularMaquinas: regular };
    }, [linhas, scope]);

    // Paginar cards (pinned aparecem em todas as páginas)
    const pages = useMemo(() => {
        const result: LinhaMaquina[][] = [];
        const slotsForRegular = CARDS_PER_PAGE - pinnedMaquinas.length;

        if (slotsForRegular <= 0) {
            // Apenas máquinas fixadas (muitas máquinas mãe)
            return [pinnedMaquinas];
        }

        for (let i = 0; i < regularMaquinas.length; i += slotsForRegular) {
            const pageRegular = regularMaquinas.slice(i, i + slotsForRegular);
            result.push([...pinnedMaquinas, ...pageRegular]);
        }

        // Se não há máquinas regulares, mostrar só as fixadas
        if (result.length === 0 && pinnedMaquinas.length > 0) {
            return [pinnedMaquinas];
        }

        return result.length ? result : [[]];
    }, [pinnedMaquinas, regularMaquinas]);

    // Total de slides: planejamento = 3, outros = 1 (resumo) + páginas de máquinas
    const totalSlides = isPlanejamento ? 3 : pages.length + 1;

    // Reset page when scope changes
    useEffect(() => {
        setCurrentPage(0);
    }, [scope]);

    // Auto-slide
    useEffect(() => {
        if (totalSlides <= 1) return;
        const id = setInterval(() => {
            setCurrentPage(prev => (prev + 1) % totalSlides);
        }, SLIDE_INTERVAL);
        return () => clearInterval(id);
    }, [totalSlides]);

    // Fullscreen
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            rootRef.current?.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    };

    useEffect(() => {
        const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    const goPrev = () => setCurrentPage(prev => (prev - 1 + totalSlides) % totalSlides);
    const goNext = () => setCurrentPage(prev => (prev + 1) % totalSlides);

    // ==================== RENDER ====================
    // Slide 0 = resumo, slides 1+ = páginas de máquinas
    const isResumoSlide = currentPage === 0;
    const machinePageIndex = currentPage - 1; // índice das páginas de máquinas (0-based)
    const currentCards = pages[machinePageIndex] || [];
    const dateLabel = isToday ? `HOJE • ${formatDateBR(dataRef)}` : isYesterday ? `ONTEM • ${formatDateBR(dataRef)}` : formatDateBR(dataRef);

    return (
        <div ref={rootRef} className={styles.container}>
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <button className={styles.backButton} onClick={() => navigate('/tv')}>
                        <FiArrowLeft size={20} />
                        <span>Menu</span>
                    </button>
                    <div className={styles.titleGroup}>
                        <FiMonitor size={24} />
                        <h1>{tituloPainel}</h1>
                    </div>
                </div>

                <div className={styles.headerRight}>
                    {/* Resumo Dia */}
                    {/* Resumo Dia */}
                    <div className={styles.summaryCard}>
                        <span className={styles.summaryLabel}>DIA</span>
                        <div className={styles.summaryBadges}>
                            <span className={styles.badgeMeta}>Meta: {formatNum(totais.meta)}h</span>
                            <span className={styles.badgeMetaRelativa}>Meta Relativa: {formatNum(totais.esperado)}h</span>
                            <span className={styles.badgeReal}>Real: {formatNum(totais.produzido)}h</span>
                            <span
                                className={styles.badgePct}
                                style={{ backgroundColor: perfColor(totais.aderencia) }}
                            >
                                {totais.aderencia !== null ? `${formatNum(totais.aderencia, 0)}%` : '-'}
                            </span>
                        </div>
                    </div>

                    {/* Hora de Atualização (Destaque) */}
                    <div className={styles.updateTimeCard}>
                        <span className={styles.updateTimeLabel}>ATUALIZADO ÀS</span>
                        <span className={styles.updateTimeValue}>{lastUpdateTime}</span>
                    </div>

                    {/* Data de Referência */}
                    <div className={`${styles.dateCard} ${isToday ? styles.dateToday : styles.datePast}`}>
                        <span className={styles.dateLabel}>Visão de</span>
                        <span className={styles.dateValue}>{dateLabel}</span>
                    </div>

                    {/* Fullscreen */}
                    <button className={styles.fullscreenButton} onClick={toggleFullscreen}>
                        {isFullscreen ? <FiMinimize size={20} /> : <FiMaximize size={20} />}
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className={styles.main}>
                {fetchError && !loading && (
                    <div className={styles.errorBanner}>
                        <span className={styles.errorBannerIcon}>⚠</span>
                        <span>Falha ao carregar dados. Tentando novamente automaticamente...</span>
                        <button className={styles.errorBannerRetry} onClick={fetchData}>
                            Tentar agora
                        </button>
                    </div>
                )}
                {loading ? (
                    <div className={styles.loadingContainer}>
                        <div className={styles.spinner} />
                        <span>Carregando dados...</span>
                    </div>
                ) : (
                    <>
                        {/* Navegação do Carrossel */}
                        <div className={styles.carouselNav}>
                            <button className={styles.navButton} onClick={goPrev}>
                                <FiChevronLeft size={24} />
                            </button>
                            <div className={styles.dots}>
                                {Array.from({ length: totalSlides }).map((_, idx) => (
                                    <button
                                        key={idx}
                                        className={`${styles.dot} ${idx === currentPage ? styles.dotActive : ''}`}
                                        onClick={() => setCurrentPage(idx)}
                                    />
                                ))}
                            </div>
                            <span className={styles.pageInfo}>
                                {isPlanejamento
                                    ? ['Produção • Últimos 12 dias', 'Capacidade Mensal', 'Capacidade 30 dias'][currentPage]
                                    : isResumoSlide ? 'Resumo do Período' : `Máquinas • Página ${machinePageIndex + 1} de ${pages.length}`}
                            </span>
                            <button className={styles.navButton} onClick={goNext}>
                                <FiChevronRight size={24} />
                            </button>
                        </div>

                        {/* Conteúdo: Planejamento, SlideResumo ou Cards Grid */}
                        {isPlanejamento ? (
                            <SlidePlanejamento currentSlide={currentPage} diasProducao={historicoDias} />
                        ) : isResumoSlide ? (
                            <SlideResumo dias={historicoDias} />
                        ) : (
                            <div className={styles.cardsGrid}>
                                {currentCards.map((card) => (
                                    <MaquinaCard
                                        key={card.maquinaId}
                                        data={card}
                                        isFuture={isFuture}
                                        isPinned={scope !== 'geral' && card.exibirFilhos}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}

// ==================== CARD COMPONENT ====================
interface MaquinaCardProps {
    data: LinhaMaquina;
    isFuture: boolean;
    isPinned?: boolean;
}

function MaquinaCard({ data, isFuture, isPinned }: MaquinaCardProps) {
    const pctEsperado = data.esperado > 0 ? (data.produzido / data.esperado) * 100 : 0;
    const pctMeta = data.meta > 0 ? (data.produzido / data.meta) * 100 : 0;
    const color = perfColor(data.aderencia);

    return (
        <div className={`${styles.card} ${isPinned ? styles.cardPinned : ''}`}>
            {/* Header */}
            <div className={styles.cardHeader}>
                <div className={styles.cardTitleGroup}>
                    {isPinned && <FiMapPin size={18} className={styles.pinIcon} />}
                    <h3 className={styles.cardTitle}>{data.maquinaNome}</h3>
                    {/* Badge de dados desatualizados */}
                    {data.isStale && data.lastRefTime && (
                        <span style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: '#fef3c7',
                            color: '#92400e',
                            marginLeft: '8px',
                            fontWeight: 600
                        }}>
                            Dados de {data.lastRefTime}
                        </span>
                    )}
                </div>
                {isFuture ? (
                    <span className={styles.badgeFuture}>FUTURO</span>
                ) : (
                    <span className={styles.cardBadge} style={{ backgroundColor: color }}>
                        {data.aderencia !== null ? `${formatNum(data.aderencia, 0)}%` : '-'}
                    </span>
                )}
            </div>

            {/* Conteúdo Principal */}
            <div className={styles.cardBody}>
                {/* Ring Progress */}
                <div className={styles.ringContainer}>
                    <svg className={styles.ring} viewBox="0 0 100 100">
                        <circle
                            className={styles.ringBg}
                            cx="50" cy="50" r="42"
                            stroke="#e2e8f0"
                            strokeWidth="10"
                            fill="none"
                        />
                        <circle
                            className={styles.ringProgress}
                            cx="50" cy="50" r="42"
                            stroke={color}
                            strokeWidth="10"
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray={`${clamp(data.aderencia ?? 0) * 2.64} 264`}
                            transform="rotate(-90 50 50)"
                        />
                    </svg>
                    <span className={styles.ringText} style={{ color }}>
                        {data.aderencia !== null ? `${formatNum(data.aderencia, 0)}%` : '-'}
                    </span>
                </div>

                {/* Dados */}
                <div className={styles.cardData}>
                    <span className={styles.dataLabel}>PRODUZIDO</span>
                    <span className={styles.dataValue}>{formatNum(data.produzido)}h</span>
                    <div className={styles.dataDetails}>
                        <span>Esperado: <strong>{formatNum(data.esperado)}h</strong></span>
                        <span>Meta Dia: <strong>{formatNum(data.meta)}h</strong></span>
                    </div>
                </div>

                {/* Contribuintes (para máquinas mãe) */}
                {data.contribuintes && data.contribuintes.length > 0 && (
                    <>
                        <div className={styles.cardDivider} />
                        <div className={styles.contribuintesSection}>
                            <span className={styles.contribuintesLabel}>DETALHE:</span>
                            <div className={styles.contribuintesList}>
                                {data.contribuintes.map((c, idx) => (
                                    <div key={idx} className={styles.contribuinteRow}>
                                        <span className={styles.contribuinteCodigo} title={c.codigo}>{c.codigo}</span>
                                        <span className={styles.contribuinteHoras}>{c.produzido.toFixed(1)}h</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Barras de Progresso */}
            <div className={styles.progressSection}>
                <div className={styles.progressRow}>
                    <div className={styles.progressInfo}>
                        <span>Progresso vs Esperado</span>
                        <span>{formatNum(clamp(pctEsperado), 0)}%</span>
                    </div>
                    <div className={styles.progressBar}>
                        <div
                            className={`${styles.progressFill} ${pctEsperado >= 100 ? styles.progressComplete : pctEsperado < 100 ? styles.progressStriped : ''}`}
                            style={{
                                width: `${clamp(pctEsperado)}%`,
                                backgroundColor: perfColor(pctEsperado)
                            }}
                        />
                    </div>
                </div>
                <div className={styles.progressRow}>
                    <div className={styles.progressInfo}>
                        <span>Progresso vs Meta</span>
                        <span>{formatNum(clamp(pctMeta), 0)}%</span>
                    </div>
                    <div className={styles.progressBar}>
                        <div
                            className={`${styles.progressFill} ${styles.progressBlue} ${pctMeta >= 100 ? styles.progressComplete : pctMeta < 100 ? styles.progressStriped : ''}`}
                            style={{ width: `${clamp(pctMeta)}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
