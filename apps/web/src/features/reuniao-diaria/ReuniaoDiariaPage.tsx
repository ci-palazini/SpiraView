// src/features/reuniao-diaria/ReuniaoDiariaPage.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    FiArrowLeft,
    FiChevronLeft,
    FiChevronRight,
    FiMaximize2,
    FiMinimize2,
    FiPlay,
    FiPause,
    FiAlertTriangle,
    FiAlertCircle,
    FiTrendingUp,
    FiTrendingDown,
    FiCheckCircle,
    FiSearch,
    FiRefreshCw,
    FiUsers,
} from 'react-icons/fi';
import { http, buscarMetasPlanejamento, type PlanejamentoMetas } from '../../services/apiClient';
import styles from './ReuniaoDiaria.module.css';

// ===== TYPES =====
interface RefugoRow {
    data_ocorrencia: string;
    descricao_item: string;
    motivo_defeito: string;
    quantidade: number;
    custo: number;
    origem: string;
    responsavel_nome: string;
    tipo_lancamento: string;
    tipo_origem?: string;
}

interface RetrabalhoRow {
    data: string;
    codigo: string;
    descricao: string;
    nao_conformidade: string;
    causa_provavel: string | null;
    solicitante: string | null;
    ncr: string | null;
    ordem_producao: string | null;
    ocorrencia: number;
    severidade: number;
    deteccao: number;
    horas_retrabalho: string | null;
}

interface TopCausa {
    causa: string;
    ocorrencias: number;
    quantidadeTotal: number;
}

interface Breakdown {
    qtdRefugo: number;
    custoRefugo: number;
    qtdQuarentena: number;
    custoQuarentena: number;
}

interface HorasRetrabalhoData {
    totalMes: number;
}

interface InternoExternoData {
    qtdInterno: number;
    custoInterno: number;
    qtdExterno: number;
    custoExterno: number;
}

interface RetrabalhoStatsData {
    totalOcorrencias: number;
    itensdistintos: number;
    ncDistintas: number;
}

interface TopNCData {
    nc: string;
    total: number;
    horas: number;
}

interface Causa4MData {
    causa: string;
    total: number;
    horas: number;
}

interface TopSolicitanteData {
    solicitante: string;
    total: number;
    horas: number;
}

interface MaquinaEficienciaBreakdown {
    dataRef: string;
    horas: number;
}

interface MaquinaEficiencia {
    maquina: string;
    horasRealizadas: number;
    horasMeta: number | null;
    pct: number | null;
    breakdown?: MaquinaEficienciaBreakdown[];
}

interface FaturamentoData {
    dataRef: string;
    faturadoAcumulado: number;
    exportacaoAcumulado: number;
    devolucoesDia: number;
    linhasAtraso: number;
    backlogAtraso: number;
    ottrUltimoMes: number | null;
    ottrYtd: number;
    metaFinanceira: number | null;
    metaMtd?: number | null;
    pctMeta: number | null;
    pctMetaMtd?: number | null;
}

interface EficienciaData {
    dataRef: string;
    isAggregated?: boolean;
    maquinas: MaquinaEficiencia[];
    eficienciaGeral: number | null;
}

interface LogisticaDist5 {
    faixa0_2: number; faixa3_7: number; faixa8_14: number; faixa15_30: number; faixa30Mais: number;
}
interface LogisticaNotasEmbarque {
    totalNotas: number; valorTotalNet: number; notasAtrasadas: number; valorRisco: number;
    uploadedAt: string | null; distribuicao: LogisticaDist5;
}
interface LogisticaPrinc1 {
    totalItens: number; estoqueTotal: number; qtdAtrasados: number; qtdCriticos: number;
    atrasoMedio: number; maiorAtraso: number; uploadedAt: string | null; distribuicao: LogisticaDist5;
}
interface LogisticaProposto {
    totalRegistros: number; valorTotalProposto: number; ovsUnicas: number;
    itensCriticos: number; valorCritico: number; uploadedAt: string | null; distribuicao: LogisticaDist5;
}
interface LogisticaDelivery {
    notasEmbarque: LogisticaNotasEmbarque | null;
    princ1: LogisticaPrinc1 | null;
    proposto: LogisticaProposto | null;
}

interface SafetyKsb {
    categoria: string;
    total: number;
}

interface SafetyCausa {
    causa: string;
    total: number;
}

interface SafetyRatio {
    seguros: number;
    arriscados: number;
}

interface SafetyEngajamentoDept {
    departamento: string;
    total: number;
    comObservacao: number;
}

interface SafetyData {
    totalMes: number;
    totalMesAnterior: number;
    mesReferencia?: number;
    anoReferencia?: number;
    ratio: SafetyRatio;
    ratioMesAnterior: SafetyRatio;
    topKsbsSeguros: SafetyKsb[];
    topKsbsArriscados: SafetyKsb[];
    topCausas: SafetyCausa[];
    feedbackPct: number | null;
    stopWorkCount: number;
    lastUpload?: string | null;
    engajamentoDepartamentos?: SafetyEngajamentoDept[];
}

interface DailyData {
    departamento: string;
    dataRef: string;
    safety: SafetyData | null;
    quality: {
        refugos: RefugoRow[];
        retrabalhos: RetrabalhoRow[];
        custoTotalMes: number;
        qtdTotalMes: number;
        topCausas: TopCausa[];
        breakdown: Breakdown;
        horasRetrabalho: HorasRetrabalhoData;
        internoExterno: InternoExternoData;
        retrabalhoStats: RetrabalhoStatsData;
        topNCs: TopNCData[];
        causas4M: Causa4MData[];
        topSolicitantes: TopSolicitanteData[];
        mesReferencia?: number;
        anoReferencia?: number;
        mesReferenciaRetrabalho?: number;
        anoReferenciaRetrabalho?: number;
        lastUpdatedRefugo?: string | null;
        lastUpdatedRetrabalho?: string | null;
    };
    deliveryCost: {
        faturamento: FaturamentoData | null;
        eficiencia: EficienciaData | null;
        logisticaDelivery: LogisticaDelivery | null;
        custoRefugoMes: number;
        qtdRefugoMes: number;
    };
    people: null;
}

// 4 slides: S, Q, D&C, P
const SLIDES = ['S', 'Q', 'DC', 'P'] as const;
type SlideId = (typeof SLIDES)[number];

const SLIDE_COLORS: Record<SlideId, string> = {
    S: 'var(--sqdcp-s)',
    Q: 'var(--sqdcp-q)',
    DC: 'var(--sqdcp-d)',
    P: 'var(--sqdcp-p)',
};

const SLIDE_CSS: Record<SlideId, string> = {
    S: styles.sLetter,
    Q: styles.qLetter,
    DC: styles.dLetter,
    P: styles.pLetter,
};

const BADGE_CSS: Record<SlideId, string> = {
    S: styles.safety,
    Q: styles.quality,
    DC: styles.delivery,
    P: styles.people,
};

const DEPT_LABELS: Record<string, string> = {
    usinagem: 'Usinagem',
    montagem: 'Montagem & Pintura',
    logistica: 'Logística',
};

function formatDateBR(iso: string): string {
    if (!iso) return '—';
    const datePart = iso.split('T')[0];
    const [y, m, d] = datePart.split('-');
    return `${d}/${m}/${y}`;
}

function formatDateTimeBR(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatK(value: number): string {
    if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1).replace('.', ',')}k`;
    return `R$ ${value.toFixed(1).replace('.', ',')}`;
}

function efficiencyColor(pct: number | null): string {
    if (pct === null) return '#64748b';
    if (pct >= 100) return '#10b981'; // Green
    if (pct >= 80) return '#d97706'; // Orange
    return '#dc2626'; // Red
}

function rpnColor(rpn: number | null): string {
    if (rpn === null) return '#64748b';
    if (rpn <= 20) return '#16a34a';
    if (rpn <= 50) return '#d97706';
    return '#dc2626';
}

function formatLastUpdate(dateString: string | null): string {
    if (!dateString) return 'Sem data';
    try {
        const date = new Date(dateString);
        const today = new Date();
        const todayDate = today.toLocaleDateString('pt-BR');
        const dateOnly = date.toLocaleDateString('pt-BR');

        // Se for hoje, mostra apenas a hora
        if (dateOnly === todayDate) {
            return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }

        // Se for outro dia, mostra data e hora
        return date.toLocaleString('pt-BR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return 'Sem data';
    }
}

// ===== COMPONENT =====
export default function ReuniaoDiariaPage() {
    const { departamento } = useParams<{ departamento: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);

    const [data, setData] = useState<DailyData | null>(null);
    const [loading, setLoading] = useState(true);
    const [slideIdx, setSlideIdx] = useState(0);
    const [autoPlay, setAutoPlay] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [metas, setMetas] = useState<PlanejamentoMetas | null>(null);

    const dep = (departamento || '').toLowerCase();

    // Fetch data
    const fetchData = useCallback(async () => {
        try {
            const res = await http.get<DailyData>(`/reuniao-diaria/${dep}`);
            setData(res);

            // Buscar metas do mês atual
            const now = new Date();
            const mesMetas = now.getMonth() + 1;
            const anoMetas = now.getFullYear();
            try {
                const m = await buscarMetasPlanejamento(mesMetas, anoMetas, {});
                setMetas(m);
            } catch {
                // falha em buscar metas não bloqueia o resto
            }
        } catch (err) {
            console.error('[reuniao-diaria] Fetch error', err);
        } finally {
            setLoading(false);
        }
    }, [dep]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [fetchData]);

    // Auto-play
    useEffect(() => {
        if (!autoPlay) return;
        const timer = setInterval(() => {
            setSlideIdx((i) => (i + 1) % SLIDES.length);
        }, 30_000);
        return () => clearInterval(timer);
    }, [autoPlay]);

    // Keyboard navigation
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') setSlideIdx((i) => (i + 1) % SLIDES.length);
            if (e.key === 'ArrowLeft') setSlideIdx((i) => (i - 1 + SLIDES.length) % SLIDES.length);
            if (e.key === ' ') { e.preventDefault(); setAutoPlay((v) => !v); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true));
        } else {
            document.exitFullscreen?.().then(() => setIsFullscreen(false));
        }
    };

    const currentSlide = SLIDES[slideIdx];

    // ===== SLIDE RENDERERS =====
    const renderSafety = () => {
        if (!data?.safety) {
            return (
                <div className={styles.placeholder}>
                    <div className={styles.placeholderText}>
                        {t('reuniao_diaria.safety_no_data')}
                    </div>
                </div>
            );
        }

        const s = data.safety;
        const totalRatio = s.ratio.seguros + s.ratio.arriscados;
        const pctSeguros = totalRatio > 0 ? Math.round((s.ratio.seguros / totalRatio) * 100) : 0;
        const pctArriscados = 100 - pctSeguros;
        const trendDiff = s.totalMes - s.totalMesAnterior;
        const trendUp = trendDiff > 0;

        // Verificar se está mostrando dados de um mês diferente do atual
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const isHistoricalData = s.mesReferencia && s.anoReferencia &&
            (s.mesReferencia !== currentMonth || s.anoReferencia !== currentYear);

        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const displayMonth = s.mesReferencia ? monthNames[s.mesReferencia - 1] : '';

        return (
            <div className={styles.safetyTvLayout}>
                {/* Aviso de dados históricos */}
                {isHistoricalData && (
                    <div className={styles.safetyHistoricalBanner}>
                        <FiAlertCircle size={20} />
                        <span>Exibindo dados de {displayMonth}/{s.anoReferencia} (sem dados no mês atual)</span>
                    </div>
                )}

                {/* Última atualização EHS */}
                <div className={styles.lastUpdatedRow}>
                    <FiRefreshCw size={15} />
                    <span>Última atualização EHS: <strong>{formatDateTimeBR(s.lastUpload)}</strong></span>
                </div>

                <div className={styles.safetyTvGrid}>
                    {/* ===== COLUNA ESQUERDA: KPIs + Ratio ===== */}
                    <div className={styles.safetyTvLeft}>
                        {/* KPI: Total de Observações */}
                        <div className={styles.safetyTvKpiCard}>
                            <p className={styles.safetyTvKpiValue} style={{ color: '#3b82f6' }}>
                                {s.totalMes}
                            </p>
                            <p className={styles.safetyTvKpiLabel}>{t('reuniao_diaria.safety_total')}</p>
                            <p className={styles.safetyTvKpiSub}>
                                {trendUp
                                    ? <FiTrendingUp size={20} style={{ color: '#16a34a', verticalAlign: 'middle' }} />
                                    : <FiTrendingDown size={20} style={{ color: '#dc2626', verticalAlign: 'middle' }} />}
                                {' '}{Math.abs(trendDiff)} vs. mês anterior ({s.totalMesAnterior})
                            </p>
                        </div>

                        {/* KPI: % Feedback */}
                        <div className={styles.safetyTvKpiCard}>
                            <p
                                className={styles.safetyTvKpiValue}
                                style={{ color: s.feedbackPct !== null && s.feedbackPct >= 90 ? '#16a34a' : '#d97706' }}
                            >
                                {s.feedbackPct !== null ? `${s.feedbackPct}%` : '—'}
                            </p>
                            <p className={styles.safetyTvKpiLabel}>{t('reuniao_diaria.safety_feedback')}</p>
                        </div>

                        {/* KPI: Stop Work */}
                        <div
                            className={styles.safetyTvKpiCard}
                            style={s.stopWorkCount > 0 ? { borderColor: '#dc2626', background: 'rgba(220,38,38,0.04)' } : {}}
                        >
                            <p
                                className={styles.safetyTvKpiValue}
                                style={{ color: s.stopWorkCount > 0 ? '#dc2626' : '#64748b' }}
                            >
                                {s.stopWorkCount}
                            </p>
                            <p className={styles.safetyTvKpiLabel}>{t('reuniao_diaria.safety_stopwork')}</p>
                        </div>

                        {/* Barra Seguros vs Arriscados */}
                        <div className={styles.safetyTvRatioCard}>
                            <h4 className={styles.safetyTvSectionLabel}>{t('reuniao_diaria.safety_ratio')}</h4>
                            <div className={styles.safetyTvBar}>
                                {s.ratio.seguros > 0 && (
                                    <div
                                        className={styles.safetyTvBarSegment}
                                        style={{ width: `${pctSeguros}%`, background: '#16a34a' }}
                                    />
                                )}
                                {s.ratio.arriscados > 0 && (
                                    <div
                                        className={styles.safetyTvBarSegment}
                                        style={{ width: `${pctArriscados}%`, background: '#dc2626' }}
                                    />
                                )}
                            </div>
                            <div className={styles.safetyTvBarLegend}>
                                <span className={styles.safetyTvLegendItem}>
                                    <span className={styles.safetyTvLegendDot} style={{ background: '#16a34a' }} />
                                    {t('reuniao_diaria.safety_safe_label')}: <strong>{s.ratio.seguros}</strong> ({pctSeguros}%)
                                </span>
                                <span className={styles.safetyTvLegendItem}>
                                    <span className={styles.safetyTvLegendDot} style={{ background: '#dc2626' }} />
                                    {t('reuniao_diaria.safety_atrisk_label')}: <strong>{s.ratio.arriscados}</strong> ({pctArriscados}%)
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ===== COLUNA DIREITA: Top KSBs + Causas ===== */}
                    <div className={styles.safetyTvRight}>
                        {/* Top KSBs Seguros */}
                        {s.topKsbsSeguros.length > 0 && (
                            <div className={styles.safetyTvParetoCard}>
                                <h4 className={styles.safetyTvSectionLabel} style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <FiCheckCircle size={15} />
                                    {t('reuniao_diaria.safety_top_ksbs_safe')}
                                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 400, color: '#64748b' }}>
                                        Total: {s.ratio.seguros}
                                    </span>
                                </h4>
                                <div className={styles.safetyTvParetoList}>
                                    {s.topKsbsSeguros.map((k, i) => {
                                        const maxTotal = s.topKsbsSeguros[0].total;
                                        const barPct = maxTotal > 0 ? (k.total / maxTotal) * 100 : 0;
                                        return (
                                            <div key={i} className={styles.safetyTvParetoRow}>
                                                <span className={styles.safetyTvParetoRank}>#{i + 1}</span>
                                                <span className={styles.safetyTvParetoName}>{k.categoria}</span>
                                                <div className={styles.safetyTvParetoBarWrap}>
                                                    <div
                                                        className={styles.safetyTvParetoBarFill}
                                                        style={{ width: `${barPct}%`, background: '#16a34a' }}
                                                    />
                                                </div>
                                                <span className={styles.safetyTvParetoCount}>{k.total}×</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Top KSBs Arriscados */}
                        {s.topKsbsArriscados.length > 0 && (
                            <div className={styles.safetyTvParetoCard}>
                                <h4 className={styles.safetyTvSectionLabel} style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <FiAlertTriangle size={15} />
                                    {t('reuniao_diaria.safety_top_ksbs_atrisk')}
                                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 400, color: '#64748b' }}>
                                        Total: {s.ratio.arriscados}
                                    </span>
                                </h4>
                                <div className={styles.safetyTvParetoList}>
                                    {s.topKsbsArriscados.map((k, i) => {
                                        const maxTotal = s.topKsbsArriscados[0].total;
                                        const barPct = maxTotal > 0 ? (k.total / maxTotal) * 100 : 0;
                                        return (
                                            <div key={i} className={styles.safetyTvParetoRow}>
                                                <span className={styles.safetyTvParetoRank}>#{i + 1}</span>
                                                <span className={styles.safetyTvParetoName}>{k.categoria}</span>
                                                <div className={styles.safetyTvParetoBarWrap}>
                                                    <div
                                                        className={styles.safetyTvParetoBarFill}
                                                        style={{ width: `${barPct}%`, background: '#ef4444' }}
                                                    />
                                                </div>
                                                <span className={styles.safetyTvParetoCount}>{k.total}×</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Top Causas */}
                        {s.topCausas.length > 0 && (
                            <div className={styles.safetyTvParetoCard}>
                                <h4 className={styles.safetyTvSectionLabel} style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <FiSearch size={15} />
                                    {t('reuniao_diaria.safety_top_causas')}
                                </h4>
                                <div className={styles.safetyTvParetoList}>
                                    {s.topCausas.map((c, i) => {
                                        const maxTotal = s.topCausas[0].total;
                                        const barPct = maxTotal > 0 ? (c.total / maxTotal) * 100 : 0;
                                        return (
                                            <div key={i} className={styles.safetyTvParetoRow}>
                                                <span className={styles.safetyTvParetoRank}>#{i + 1}</span>
                                                <span className={styles.safetyTvParetoName}>{c.causa}</span>
                                                <div className={styles.safetyTvParetoBarWrap}>
                                                    <div
                                                        className={styles.safetyTvParetoBarFill}
                                                        style={{ width: `${barPct}%`, background: '#f59e0b' }}
                                                    />
                                                </div>
                                                <span className={styles.safetyTvParetoCount}>{c.total}×</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Engajamento por departamento — grid 2×2 */}
                        {s.engajamentoDepartamentos && s.engajamentoDepartamentos.length > 0 && (
                            <div className={styles.safetyEngajamentoCard}>
                                <h4 className={styles.safetyTvSectionLabel}>
                                    <FiUsers size={13} />
                                    {t('reuniao_diaria.safety_engajamento')}
                                </h4>
                                <div className={styles.safetyEngajamentoGrid}>
                                    {s.engajamentoDepartamentos.map((d) => {
                                        const pct = d.total > 0 ? Math.round((d.comObservacao / d.total) * 100) : 0;
                                        const color = pct >= 80 ? '#16a34a' : pct >= 50 ? '#f59e0b' : '#dc2626';
                                        return (
                                            <div
                                                key={d.departamento}
                                                className={styles.safetyEngajamentoDeptCard}
                                                style={{ borderColor: color + '40' }}
                                            >
                                                <span className={styles.safetyEngajamentoDeptName}>
                                                    {d.departamento}
                                                </span>
                                                <span className={styles.safetyEngajamentoDeptPct} style={{ color }}>
                                                    {pct}%
                                                </span>
                                                <div className={styles.safetyEngajamentoDeptBar}>
                                                    <div style={{ width: `${pct}%`, background: color }} />
                                                </div>
                                                <span className={styles.safetyEngajamentoDeptCount}>
                                                    {d.comObservacao}/{d.total}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderQuality = () => {
        if (!data?.quality) return null;
        const {
            refugos, retrabalhos, custoTotalMes, qtdTotalMes, topCausas,
            breakdown, horasRetrabalho, internoExterno,
            retrabalhoStats, topNCs, causas4M, topSolicitantes,
            mesReferencia, anoReferencia,
            mesReferenciaRetrabalho, anoReferenciaRetrabalho,
            lastUpdatedRefugo, lastUpdatedRetrabalho,
        } = data.quality;
        const totalBreakdown = breakdown.qtdRefugo + breakdown.qtdQuarentena;
        const pctRefugo = totalBreakdown > 0 ? Math.round((breakdown.qtdRefugo / totalBreakdown) * 100) : 0;
        const pctQuarentena = 100 - pctRefugo;

        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const isHistoricalData = mesReferencia && anoReferencia &&
            (mesReferencia !== currentMonth || anoReferencia !== currentYear);
        const isHistoricalRetrabalho = mesReferenciaRetrabalho && anoReferenciaRetrabalho &&
            (mesReferenciaRetrabalho !== currentMonth || anoReferenciaRetrabalho !== currentYear);
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const displayMonth = mesReferencia ? monthNames[mesReferencia - 1] : '';
        const displayMonthRetrabalho = mesReferenciaRetrabalho ? monthNames[mesReferenciaRetrabalho - 1] : '';

        const causa4mColors: Record<string, string> = {
            METHOD: '#2563eb', MAN: '#d97706', MATERIAL: '#7c3aed', MACHINE: '#16a34a',
        };
        const causa4mLabels: Record<string, string> = {
            METHOD: 'Método', MAN: 'Mão de Obra', MATERIAL: 'Material', MACHINE: 'Máquina',
        };
        const maxNcHoras = topNCs.length > 0 ? Math.max(...topNCs.map(n => n.horas)) : 1;
        const maxSolHoras = topSolicitantes.length > 0 ? Math.max(...topSolicitantes.map(s => s.horas)) : 1;

        return (
            <div className={styles.qualityTvLayout}>
                {/* Banner histórico refugo */}
                {isHistoricalData && (
                    <div className={styles.safetyHistoricalBanner}>
                        <FiAlertCircle size={16} />
                        <span>Refugo/Quarentena: exibindo dados de {displayMonth}/{anoReferencia} (sem dados no mês atual)</span>
                    </div>
                )}
                {/* Banner histórico retrabalho (período diferente) */}
                {isHistoricalRetrabalho && (
                    <div className={styles.safetyHistoricalBanner}>
                        <FiAlertCircle size={16} />
                        <span>Retrabalho: exibindo dados de {displayMonthRetrabalho}/{anoReferenciaRetrabalho} (sem dados no mês atual)</span>
                    </div>
                )}

                <div className={styles.qualityTvGrid}>
                    {/* ===== COLUNA ESQUERDA: Refugo / Quarentena ===== */}
                    <div className={styles.qualityTvCol}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
                            <p className={styles.qualityTvColTitle} style={{ borderColor: '#dc2626', color: '#dc2626', marginBottom: 0 }}>
                                Refugo / Quarentena
                            </p>
                            <span className={styles.lastUpdatedInline}>
                                <FiRefreshCw size={13} />
                                Atualizado: {formatDateTimeBR(lastUpdatedRefugo)}
                            </span>
                        </div>

                        <div className={styles.qualityTvGroups}>
                            {/* Novo Card TOTAIS com Bar Chart integrado */}
                            <div className={styles.qualityTvGroup} style={{ border: '2px solid #dc2626', background: 'rgba(220, 38, 38, 0.02)', display: 'flex', flexDirection: 'column' }}>
                                <div>
                                    <p className={styles.qualityTvGroupTitle} style={{ color: '#dc2626' }}>Total</p>
                                    <div className={styles.qualityTvGroupCards}>
                                        <div className={styles.qualityTvMiniCard}>
                                            <p className={styles.qualityTvMiniValue} style={{ color: '#dc2626' }}>{qtdTotalMes}</p>
                                            <p className={styles.qualityTvMiniLabel}>Qtd</p>
                                        </div>
                                        <div className={styles.qualityTvMiniCard}>
                                            <p className={styles.qualityTvMiniValue} style={{ color: '#dc2626' }}>{formatK(custoTotalMes)}</p>
                                            <p className={styles.qualityTvMiniLabel}>Custo</p>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ marginTop: 'auto', paddingTop: '1.2rem' }}>
                                    <p className={styles.qualityTvGroupTitle} style={{ fontSize: '0.75rem', color: '#dc2626', marginBottom: '0.5rem' }}>Refugo vs. Quarentena</p>
                                    <div className={styles.stackedBarContainer}>
                                        <div className={styles.stackedBar} style={{ height: '16px' }}>
                                            {breakdown.qtdRefugo > 0 && (
                                                <div className={styles.stackedSegment} style={{ width: `${pctRefugo}%`, background: '#dc2626' }} />
                                            )}
                                            {breakdown.qtdQuarentena > 0 && (
                                                <div className={styles.stackedSegment} style={{ width: `${pctQuarentena}%`, background: '#d97706' }} />
                                            )}
                                        </div>
                                        <div className={styles.stackedLegend} style={{ gap: '0.5rem' }}>
                                            <span className={styles.legendItem} style={{ fontSize: '0.75rem' }}>
                                                <span className={styles.legendDot} style={{ background: '#dc2626', width: '8px', height: '8px' }} />
                                                Refugo: {breakdown.qtdRefugo} ({formatK(breakdown.custoRefugo)})
                                            </span>
                                            <span className={styles.legendItem} style={{ fontSize: '0.75rem' }}>
                                                <span className={styles.legendDot} style={{ background: '#d97706', width: '8px', height: '8px' }} />
                                                Quar.: {breakdown.qtdQuarentena} ({formatK(breakdown.custoQuarentena)})
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Interno e Externo agrupados */}
                            <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                                <div className={styles.qualityTvGroup} style={{ flex: 1 }}>
                                    <p className={styles.qualityTvGroupTitle} style={{ color: '#0369a1' }}>Interno</p>
                                    <div className={styles.qualityTvGroupCards}>
                                        <div className={styles.qualityTvMiniCard}>
                                            <p className={styles.qualityTvMiniValue} style={{ color: '#0369a1', fontSize: '1.6rem' }}>{internoExterno.qtdInterno}</p>
                                            <p className={styles.qualityTvMiniLabel}>Qtd</p>
                                        </div>
                                        <div className={styles.qualityTvMiniCard}>
                                            <p className={styles.qualityTvMiniValue} style={{ color: '#0369a1', fontSize: '1.6rem' }}>{formatK(internoExterno.custoInterno)}</p>
                                            <p className={styles.qualityTvMiniLabel}>Custo</p>
                                        </div>
                                    </div>
                                </div>
                                <div className={styles.qualityTvGroup} style={{ flex: 1 }}>
                                    <p className={styles.qualityTvGroupTitle} style={{ color: '#b45309' }}>Externo</p>
                                    <div className={styles.qualityTvGroupCards}>
                                        <div className={styles.qualityTvMiniCard}>
                                            <p className={styles.qualityTvMiniValue} style={{ color: '#b45309', fontSize: '1.6rem' }}>{internoExterno.qtdExterno}</p>
                                            <p className={styles.qualityTvMiniLabel}>Qtd</p>
                                        </div>
                                        <div className={styles.qualityTvMiniCard}>
                                            <p className={styles.qualityTvMiniValue} style={{ color: '#b45309', fontSize: '1.6rem' }}>{formatK(internoExterno.custoExterno)}</p>
                                            <p className={styles.qualityTvMiniLabel}>Custo</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Breakdown + Top Causas */}
                        <div className={styles.qualityTvInsights} style={{ gridTemplateColumns: '1fr' }}>
                            {topCausas.length > 0 && (
                                <div className={styles.insightCard}>
                                    <h4 className={styles.insightTitle}>Top Causas — Interno</h4>
                                    <div className={styles.paretoList}>
                                        {topCausas.slice(0, 4).map((c, i) => {
                                            const barPct = topCausas[0].ocorrencias > 0 ? (c.ocorrencias / topCausas[0].ocorrencias) * 100 : 0;
                                            return (
                                                <div key={i} className={styles.paretoRow}>
                                                    <span className={styles.paretoRank}>#{i + 1}</span>
                                                    <span className={styles.paretoName}>{c.causa}</span>
                                                    <div className={styles.paretoBarWrap}>
                                                        <div className={styles.paretoBarFill} style={{ width: `${barPct}%` }} />
                                                    </div>
                                                    <span className={styles.paretoCount}>{c.ocorrencias}×</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Tabela de refugos */}
                        <div className={styles.qualityTvTableWrap}>
                            <table className={styles.qualityTvTable}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '12%' }}>Data</th>
                                        <th style={{ width: '5%' }}>Tp</th>
                                        <th style={{ width: '5%' }}>I/E</th>
                                        <th style={{ width: '18%' }}>Item</th>
                                        <th style={{ width: '22%' }}>Defeito</th>
                                        <th style={{ width: '18%' }}>Origem</th>
                                        <th style={{ width: '8%' }}>Qtd</th>
                                        <th style={{ width: '12%' }}>Custo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {refugos.slice(0, 6).map((r, i) => (
                                        <tr key={i}>
                                            <td>{formatDateBR(r.data_ocorrencia)}</td>
                                            <td>
                                                <span className={`${styles.typeBadge} ${r.tipo_lancamento === 'REFUGO' ? styles.badgeRefugo : styles.badgeQuarentena}`}>
                                                    {r.tipo_lancamento === 'REFUGO' ? 'R' : 'Q'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`${styles.typeBadge} ${r.tipo_origem === 'EXTERNO' ? styles.badgeExterno : styles.badgeInterno}`}>
                                                    {r.tipo_origem === 'EXTERNO' ? 'E' : 'I'}
                                                </span>
                                            </td>
                                            <td>{r.descricao_item}</td>
                                            <td>{r.motivo_defeito}</td>
                                            <td>{r.origem}</td>
                                            <td>{Number(r.quantidade)}</td>
                                            <td>{formatK(Number(r.custo))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* ===== COLUNA DIREITA: Retrabalho ===== */}
                    <div className={styles.qualityTvCol}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
                            <p className={styles.qualityTvColTitle} style={{ borderColor: '#7c3aed', color: '#7c3aed', marginBottom: 0 }}>
                                Retrabalho
                            </p>
                            <span className={styles.lastUpdatedInline}>
                                <FiRefreshCw size={13} />
                                Atualizado: {formatDateTimeBR(lastUpdatedRetrabalho)}
                            </span>
                        </div>

                        {/* 3 mini-cards de contexto */}
                        <div className={styles.qualityTvStatRow}>
                            <div className={styles.qualityTvStatCard}>
                                <p className={styles.qualityTvStatValue} style={{ color: '#7c3aed' }}>
                                    {horasRetrabalho.totalMes > 0 ? `${horasRetrabalho.totalMes.toFixed(1)}h` : '—'}
                                </p>
                                <p className={styles.qualityTvStatLabel}>Horas no Mês</p>
                            </div>
                            <div className={styles.qualityTvStatCard}>
                                <p className={styles.qualityTvStatValue} style={{ color: '#0369a1' }}>
                                    {retrabalhoStats?.totalOcorrencias ?? '—'}
                                </p>
                                <p className={styles.qualityTvStatLabel}>Ocorrências</p>
                            </div>
                            <div className={styles.qualityTvStatCard}>
                                <p className={styles.qualityTvStatValue} style={{ color: '#b45309' }}>
                                    {retrabalhoStats?.itensdistintos ?? '—'}
                                </p>
                                <p className={styles.qualityTvStatLabel}>Itens Distintos</p>
                            </div>
                        </div>

                        {/* Causas 4M */}
                        {causas4M && causas4M.length > 0 && (
                            <div className={styles.qualityTv4mSection}>
                                <h4 className={styles.qualityTv4mTitle}>Causas 4M</h4>
                                <div className={styles.qualityTv4mGrid}>
                                    {(['METHOD', 'MAN', 'MATERIAL', 'MACHINE'] as const).map(key => {
                                        const entry = causas4M.find(c => c.causa === key);
                                        const color = causa4mColors[key];
                                        return (
                                            <div key={key} className={styles.qualityTv4mCard} style={{ borderColor: color }}>
                                                <p className={styles.qualityTv4mLabel} style={{ color }}>{causa4mLabels[key]}</p>
                                                <p className={styles.qualityTv4mValue} style={{ color }}>{entry?.total ?? 0}</p>
                                                <p className={styles.qualityTv4mHoras}>{entry ? `${entry.horas.toFixed(1)}h` : '—'}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Top NCs + Top Solicitantes lado a lado */}
                        <div className={styles.qualityTvParetoRow}>
                            {topNCs && topNCs.length > 0 && (
                                <div className={styles.qualityTvParetoBlock}>
                                    <h4 className={styles.qualityTvParetoTitle}>Top Não Conformidades</h4>
                                    <div className={styles.paretoList}>
                                        {topNCs.slice(0, 4).map((n, i) => {
                                            const barPct = maxNcHoras > 0 ? (n.horas / maxNcHoras) * 100 : 0;
                                            return (
                                                <div key={i} className={styles.paretoRow}>
                                                    <span className={styles.paretoRank}>#{i + 1}</span>
                                                    <span className={styles.paretoName}>{n.nc}</span>
                                                    <div className={styles.paretoBarWrap}>
                                                        <div className={styles.paretoBarFill} style={{ width: `${barPct}%`, background: '#7c3aed' }} />
                                                    </div>
                                                    <span className={styles.paretoCount}>{n.horas.toFixed(1)}h</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {topSolicitantes && topSolicitantes.length > 0 && (
                                <div className={styles.qualityTvParetoBlock}>
                                    <h4 className={styles.qualityTvParetoTitle}>Por Solicitante</h4>
                                    <div className={styles.paretoList}>
                                        {topSolicitantes.slice(0, 4).map((s, i) => {
                                            const barPct = maxSolHoras > 0 ? (s.horas / maxSolHoras) * 100 : 0;
                                            return (
                                                <div key={i} className={styles.paretoRow}>
                                                    <span className={styles.paretoRank}>#{i + 1}</span>
                                                    <span className={styles.paretoName}>{s.solicitante}</span>
                                                    <div className={styles.paretoBarWrap}>
                                                        <div className={styles.paretoBarFill} style={{ width: `${barPct}%`, background: '#0369a1' }} />
                                                    </div>
                                                    <span className={styles.paretoCount}>{s.horas.toFixed(1)}h</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Tabela de retrabalhos enriquecida */}
                        <div className={styles.qualityTvTableWrapRetrabalho}>
                            <table className={styles.qualityTvTable}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '13%' }}>Data</th>
                                        <th style={{ width: '22%' }}>Descrição</th>
                                        <th style={{ width: '20%' }}>NC</th>
                                        <th style={{ width: '16%' }}>Causa</th>
                                        <th style={{ width: '19%' }}>Solicitante</th>
                                        <th style={{ width: '10%' }}>Horas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {retrabalhos.slice(0, 6).map((r, i) => (
                                        <tr key={i}>
                                            <td>{formatDateBR(r.data)}</td>
                                            <td>{r.descricao}</td>
                                            <td>{r.nao_conformidade}</td>
                                            <td>{r.causa_provavel ?? '—'}</td>
                                            <td>{r.solicitante ?? '—'}</td>
                                            <td>{r.horas_retrabalho || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderDeliveryCost = () => {
        const dc = data?.deliveryCost;
        if (!dc) return null;

        const { faturamento, eficiencia } = dc;
        const fat = faturamento; // shorthand, may be null

        return (
            <div className={styles.slideContent}>
                {fat && (
                    <div className={styles.efficiencyHeader} style={{ marginTop: 0, marginBottom: '0.6rem' }}>
                        <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
                            {t('reuniao_diaria.billing_title', 'Indicadores de Resultados')}
                        </h3>
                        <span className={styles.efficiencyDate}>
                            (Atualizado em: {formatDateBR(fat.dataRef)})
                        </span>
                    </div>
                )}
                {/* Row 1: KPI cards — faturamento (always visible) */}
                <div className={`${styles.kpiGrid} ${data?.departamento === 'logistica' ? styles.kpiGridCompact : ''}`}>
                    <div className={styles.kpiCard}>
                        <p className={styles.kpiValue} style={{ color: '#16a34a' }}>
                            {fat ? formatK(fat.faturadoAcumulado * 1000) : '—'}
                        </p>
                        <p className={styles.kpiLabel}>
                            {t('reuniao_diaria.billing_acum', 'Faturamento Acumulado')}
                        </p>
                    </div>
                    {/* Meta Goals Container - 2 Columns */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: data?.departamento === 'logistica' ? '0' : '0.6rem' }}>
                        {/* MTD Card */}
                        <div className={styles.kpiCard} style={{ padding: data?.departamento === 'logistica' ? '0.75rem' : '1.5rem' }}>
                            <p className={styles.kpiLabel} style={{ margin: data?.departamento === 'logistica' ? '0 0 0.5rem' : '0 0 1rem', fontSize: '0.85rem' }}>
                                {t('reuniao_diaria.mtd_goal', 'Meta MTD')}
                            </p>
                            <p className={styles.kpiValue} style={{
                                color: fat?.pctMetaMtd !== null && fat?.pctMetaMtd !== undefined ? efficiencyColor(fat.pctMetaMtd) : '#64748b',
                                margin: data?.departamento === 'logistica' ? '0 0 0.4rem' : '0 0 0.8rem',
                                fontSize: data?.departamento === 'logistica' ? '2.2rem' : '3.2rem'
                            }}>
                                {fat?.pctMetaMtd !== null && fat?.pctMetaMtd !== undefined ? `${fat.pctMetaMtd}%` : '—'}
                            </p>
                            {fat?.metaMtd && (
                                <>
                                    <div className={styles.metaProgressWrap} style={{ height: '10px', marginBottom: data?.departamento === 'logistica' ? '0.4rem' : '0.8rem' }}>
                                        <div
                                            className={styles.metaProgressFill}
                                            style={{
                                                width: `${Math.min(fat.pctMetaMtd ?? 0, 100)}%`,
                                                background: efficiencyColor(fat.pctMetaMtd ?? null),
                                            }}
                                        />
                                    </div>
                                    <p className={styles.kpiSub} style={{ margin: 0, fontSize: '0.8rem', fontWeight: 500 }}>
                                        <strong>{formatK(fat.faturadoAcumulado * 1000)}</strong> / {formatK(fat.metaMtd * 1000)}
                                    </p>
                                </>
                            )}
                        </div>

                        {/* Total Goal Card */}
                        <div className={styles.kpiCard} style={{ padding: data?.departamento === 'logistica' ? '0.75rem' : '1.5rem' }}>
                            <p className={styles.kpiLabel} style={{ margin: data?.departamento === 'logistica' ? '0 0 0.5rem' : '0 0 1rem', fontSize: '0.85rem' }}>
                                {t('reuniao_diaria.total_goal', 'Meta Total')}
                            </p>
                            <p className={styles.kpiValue} style={{
                                color: fat ? efficiencyColor(fat.pctMeta) : '#64748b',
                                margin: data?.departamento === 'logistica' ? '0 0 0.4rem' : '0 0 0.8rem',
                                fontSize: data?.departamento === 'logistica' ? '2.2rem' : '3.2rem'
                            }}>
                                {fat?.pctMeta !== null && fat?.pctMeta !== undefined ? `${fat.pctMeta}%` : '—'}
                            </p>
                            {fat?.metaFinanceira && (
                                <>
                                    <div className={styles.metaProgressWrap} style={{ height: '10px', marginBottom: data?.departamento === 'logistica' ? '0.4rem' : '0.8rem' }}>
                                        <div
                                            className={styles.metaProgressFill}
                                            style={{
                                                width: `${Math.min(fat.pctMeta || 0, 100)}%`,
                                                background: efficiencyColor(fat.pctMeta),
                                            }}
                                        />
                                    </div>
                                    <p className={styles.kpiSub} style={{ margin: 0, fontSize: '0.8rem', fontWeight: 500 }}>
                                        <strong>{formatK(fat.faturadoAcumulado * 1000)}</strong> / {formatK(fat.metaFinanceira * 1000)}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                    <div className={styles.kpiCard}>
                        <p className={styles.kpiValue} style={{ color: '#2563eb' }}>
                            {fat ? `${fat.ottrYtd}%` : '—'}
                        </p>
                        <p className={styles.kpiLabel}>OTTR YTD</p>
                        {metas && metas.metaOttr > 0 && fat && (
                            <>
                                <p className={styles.kpiSub} style={{ margin: '0.5rem 0 0.25rem', fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>
                                    Meta: <span style={{ color: '#2563eb', fontWeight: 700 }}>{metas.metaOttr}%</span>
                                </p>
                                <div
                                    className={styles.metaProgressBar}
                                    style={{
                                        width: '100%',
                                        height: '8px',
                                        background: '#e5e7eb',
                                        borderRadius: 4,
                                        overflow: 'hidden',
                                    }}
                                >
                                    <div
                                        className={styles.metaProgressFill}
                                        style={{
                                            width: `${Math.min((fat.ottrYtd / metas.metaOttr) * 100, 100)}%`,
                                            height: '100%',
                                            background: fat.ottrYtd >= metas.metaOttr ? '#10b981' : '#3b82f6',
                                            transition: 'width 0.3s',
                                        }}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Row 2: Secondary KPIs */}
                <div className={`${styles.kpiGrid} ${data?.departamento === 'logistica' ? styles.kpiGridCompact : ''}`}>
                    <div className={styles.kpiCard}>
                        <p className={styles.kpiValue} style={{ color: '#d97706' }}>
                            {fat ? formatK(fat.exportacaoAcumulado * 1000) : '—'}
                        </p>
                        <p className={styles.kpiLabel}>
                            {t('reuniao_diaria.export_acum', 'Exportação Acumulada')}
                        </p>
                        {metas && metas.metaExportacao > 0 && fat && (
                            <>
                                <p className={styles.kpiSub} style={{ margin: '0.5rem 0 0.25rem', fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>
                                    Meta: <span style={{ color: '#d97706', fontWeight: 700 }}>{formatK(metas.metaExportacao * 1000)}</span>
                                </p>
                                <div
                                    className={styles.metaProgressBar}
                                    style={{
                                        width: '100%',
                                        height: '8px',
                                        background: '#e5e7eb',
                                        borderRadius: 4,
                                        overflow: 'hidden',
                                    }}
                                >
                                    <div
                                        className={styles.metaProgressFill}
                                        style={{
                                            width: `${Math.min((fat.exportacaoAcumulado / metas.metaExportacao) * 100, 100)}%`,
                                            height: '100%',
                                            background: fat.exportacaoAcumulado >= metas.metaExportacao ? '#10b981' : '#d97706',
                                            transition: 'width 0.3s',
                                        }}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                    <div className={styles.kpiCard}>
                        <p className={styles.kpiValue} style={{ color: fat && fat.devolucoesDia > 0 ? '#dc2626' : '#64748b' }}>
                            {fat ? formatK(fat.devolucoesDia * 1000) : '—'}
                        </p>
                        <p className={styles.kpiLabel}>
                            {t('reuniao_diaria.returns_day', 'Devoluções Acumuladas')}
                        </p>
                    </div>
                    <div className={styles.kpiCard}>
                        <p className={styles.kpiValue} style={{ color: '#64748b' }}>
                            {fat?.ottrUltimoMes !== null && fat?.ottrUltimoMes !== undefined ? `${fat.ottrUltimoMes}%` : '—'}
                        </p>
                        <p className={styles.kpiLabel}>
                            {t('reuniao_diaria.ottr_prev_month', 'OTTR (Último Mês)')}
                        </p>
                    </div>
                </div>

                {/* Row 2.5: Backlog alerts */}
                {fat && (fat.linhasAtraso > 0 || fat.backlogAtraso > 0 || (fat.devolucoesDia > 0 && fat.faturadoAcumulado > 0)) && (
                    <div className={styles.alertRow}>
                        {fat.linhasAtraso > 0 && (
                            <div className={styles.alertCard}>
                                <FiAlertTriangle className={styles.alertIcon} />
                                <div>
                                    <span className={styles.alertValue}>{fat.linhasAtraso}</span>
                                    <span className={styles.alertLabel}>
                                        {t('reuniao_diaria.lines_delay', 'Linhas em Atraso')}
                                    </span>
                                </div>
                            </div>
                        )}
                        {fat.backlogAtraso > 0 && (
                            <div className={styles.alertCard}>
                                <FiTrendingDown className={styles.alertIcon} />
                                <div>
                                    <span className={styles.alertValue}>{fat.backlogAtraso}</span>
                                    <span className={styles.alertLabel}>
                                        {t('reuniao_diaria.backlog_delay', 'Linhas de Backlog em Atraso')}
                                    </span>
                                </div>
                            </div>
                        )}
                        {fat.devolucoesDia > 0 && fat.faturadoAcumulado > 0 && (
                            <div className={styles.alertCard} style={{ borderColor: '#d97706' }}>
                                <FiTrendingUp className={styles.alertIcon} style={{ color: '#d97706' }} />
                                <div>
                                    <span className={styles.alertValue}>
                                        {(fat.devolucoesDia / fat.faturadoAcumulado * 100).toFixed(2)}%
                                    </span>
                                    <span className={styles.alertLabel}>
                                        {t('reuniao_diaria.returns_ratio', 'Devoluções / Faturamento')}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Row 3: Production efficiency */}
                {eficiencia && (
                    <>
                        <div className={styles.efficiencyHeader}>
                            <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
                                {t('reuniao_diaria.production_efficiency', 'Eficiência de Produção')}
                            </h3>
                            <span className={styles.efficiencyDate}>
                                ({formatDateBR(eficiencia.dataRef)})
                            </span>
                            {eficiencia.eficienciaGeral !== null && (
                                <span className={styles.efficiencyOverall} style={{ color: efficiencyColor(eficiencia.eficienciaGeral) }}>
                                    {t('reuniao_diaria.overall_efficiency', 'Geral')}: {eficiencia.eficienciaGeral}%
                                </span>
                            )}
                            {eficiencia.isAggregated && (
                                <div className={styles.stackedLegend} style={{ marginLeft: 'auto', marginTop: 0, gap: '12px' }}>
                                    <div className={styles.legendItem}>
                                        <div className={styles.legendDot} style={{ background: '#10b981' }} />
                                        <span>Sexta (Símbolo)</span>
                                    </div>
                                    <div className={styles.legendItem}>
                                        <div className={styles.legendDot} style={{ background: '#3b82f6' }} />
                                        <span>Sábado</span>
                                    </div>
                                    <div className={styles.legendItem}>
                                        <div className={styles.legendDot} style={{ background: '#8b5cf6' }} />
                                        <span>Domingo</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className={styles.efficiencyGrid}>
                            {eficiencia.maquinas.map((m, i) => (
                                <div key={i} className={styles.efficiencyCard}>
                                    <span className={styles.efficiencyName}>{m.maquina}</span>
                                    {m.horasMeta ? (
                                        <>
                                            {eficiencia.isAggregated && m.breakdown && m.breakdown.length > 0 ? (
                                                <div className={styles.efficiencyBarWrapper} style={{ display: 'flex' }}>
                                                    {m.breakdown.map((b, idx) => {
                                                        const widthPct = (b.horas / m.horasMeta!) * 100;
                                                        if (widthPct <= 0) return null;

                                                        // Safe date parsing timezone independent
                                                        const dateStr = b.dataRef.includes('T') ? b.dataRef : `${b.dataRef}T12:00:00`;
                                                        const dayOfWeek = new Date(dateStr).getDay();

                                                        let segmentColor = efficiencyColor((b.horas / m.horasMeta!) * 100);
                                                        if (dayOfWeek === 6) {
                                                            segmentColor = '#3b82f6'; // Sábado -> Azul
                                                        } else if (dayOfWeek === 0) {
                                                            segmentColor = '#8b5cf6'; // Domingo -> Roxo
                                                        }

                                                        return (
                                                            <div
                                                                key={b.dataRef}
                                                                style={{
                                                                    width: `${widthPct}%`,
                                                                    height: '100%',
                                                                    background: segmentColor,
                                                                    borderRight: idx < m.breakdown!.length - 1 ? '1px solid rgba(255,255,255,0.4)' : 'none'
                                                                }}
                                                                title={`${new Date(dateStr).toLocaleDateString('pt-BR', { weekday: 'short' })}: ${b.horas.toFixed(1)}h`}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className={styles.efficiencyBarWrapper}>
                                                    <div
                                                        className={styles.efficiencyBar}
                                                        style={{
                                                            width: `${Math.min((m.pct || 0), 100)}%`,
                                                            background: efficiencyColor(m.pct),
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '60px' }}>
                                                <span className={styles.efficiencyPct} style={{ color: efficiencyColor(m.pct), lineHeight: 1 }}>
                                                    {m.pct !== null ? `${m.pct}%` : '—'}
                                                </span>
                                                <span className={styles.efficiencyHours}>
                                                    {(m.horasRealizadas || 0).toFixed(1)}h / {(m.horasMeta || 0).toFixed(1)}h
                                                </span>
                                            </div>
                                        </>
                                    ) : (
                                        <span className={styles.noMeta}>
                                            {(m.horasRealizadas || 0).toFixed(1)}h ({t('reuniao_diaria.no_meta', 'sem meta')})
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* Logistics panels for logistica department */}
                {data?.departamento === 'logistica' && dc.logisticaDelivery && (
                    <div className={styles.logisticaTvLayout}>
                        {/* Panel 1: Notas de Embarque */}
                        <div className={styles.logisticaTvPanel}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                <p className={styles.logisticaTvPanelTitle} style={{ borderColor: '#f59e0b', color: '#f59e0b', margin: 0, paddingBottom: 0, borderBottom: 'none', flex: 1 }}>
                                    {t('reuniao_diaria.notas_embarque_title', 'Notas de Embarque')}
                                </p>
                                {dc.logisticaDelivery.notasEmbarque?.uploadedAt && (
                                    <p className={styles.logisticaTvUpdateLabel}>
                                        {formatLastUpdate(dc.logisticaDelivery.notasEmbarque.uploadedAt)}
                                    </p>
                                )}
                            </div>
                            <div style={{ height: '2px', background: '#f59e0b', borderRadius: '1px', marginBottom: '0.5rem' }} />
                            {dc.logisticaDelivery.notasEmbarque ? (
                                <>
                                    <div>
                                        <p className={styles.logisticaTvBigValue} style={{ color: '#0f172a' }}>
                                            {dc.logisticaDelivery.notasEmbarque.totalNotas}
                                        </p>
                                        <p className={styles.logisticaTvLabel}>
                                            {t('reuniao_diaria.total_notas', 'Total de Notas')}
                                        </p>
                                    </div>

                                    <div className={styles.logisticaTvInferiorGrid}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                            <div>
                                                <p className={styles.logisticaTvMidValue} style={{ color: dc.logisticaDelivery.notasEmbarque.notasAtrasadas > 0 ? '#dc2626' : '#64748b' }}>
                                                    {dc.logisticaDelivery.notasEmbarque.notasAtrasadas}
                                                </p>
                                                <p className={styles.logisticaTvLabel}>
                                                    {t('reuniao_diaria.notas_atrasadas', 'Em Atraso (3d+)')}
                                                </p>
                                            </div>
                                            {dc.logisticaDelivery.notasEmbarque.valorRisco > 0 ? (
                                                <div>
                                                    <p className={styles.logisticaTvMidValue} style={{ color: '#dc2626', fontSize: '1.6rem' }}>
                                                        {formatK(dc.logisticaDelivery.notasEmbarque.valorRisco)}
                                                    </p>
                                                    <p className={styles.logisticaTvLabel}>
                                                        {t('reuniao_diaria.valor_risco', 'Valor em Risco')}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div style={{ visibility: 'hidden' }}>
                                                    <p className={styles.logisticaTvMidValue}>0</p>
                                                    <p className={styles.logisticaTvLabel}>Placeholder</p>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                            <div className={styles.logisticaTvBox}>
                                                <p className={styles.logisticaTvBoxValue}>
                                                    {formatK(dc.logisticaDelivery.notasEmbarque.valorTotalNet)}
                                                </p>
                                                <p className={styles.logisticaTvBoxLabel}>
                                                    {t('reuniao_diaria.valor_total', 'Valor Total')}
                                                </p>
                                            </div>
                                            <div className={styles.logisticaTvBox}>
                                                <p className={styles.logisticaTvBoxValue} style={{ color: dc.logisticaDelivery.notasEmbarque.totalNotas > 0 && (dc.logisticaDelivery.notasEmbarque.notasAtrasadas / dc.logisticaDelivery.notasEmbarque.totalNotas) * 100 > 20 ? '#dc2626' : '#0f172a' }}>
                                                    {dc.logisticaDelivery.notasEmbarque.totalNotas > 0 ? `${((dc.logisticaDelivery.notasEmbarque.notasAtrasadas / dc.logisticaDelivery.notasEmbarque.totalNotas) * 100).toFixed(0)}%` : '0%'}
                                                </p>
                                                <p className={styles.logisticaTvBoxLabel}>
                                                    {t('reuniao_diaria.pct_atraso', '% Atraso')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <p className={styles.logisticaTvDistHeader}>
                                            {t('reuniao_diaria.dist_atraso', 'Distribuição por Atraso')}
                                        </p>
                                        {[
                                            { key: 'faixa0_2', label: '0–2 dias', color: '#22c55e' },
                                            { key: 'faixa3_7', label: '3–7 dias', color: '#f59e0b' },
                                            { key: 'faixa8_14', label: '8–14 dias', color: '#f97316' },
                                            { key: 'faixa15_30', label: '15–30 dias', color: '#ef4444' },
                                            { key: 'faixa30Mais', label: '30+ dias', color: '#8b5cf6' },
                                        ].map(f => {
                                            const count = dc.logisticaDelivery!.notasEmbarque!.distribuicao[f.key as keyof typeof dc.logisticaDelivery.notasEmbarque.distribuicao];
                                            const total = dc.logisticaDelivery!.notasEmbarque!.totalNotas;
                                            const pct = total > 0 ? (count / total) * 100 : 0;
                                            return (
                                                <div key={f.key} className={styles.logisticaTvDistRow}>
                                                    <span className={styles.logisticaTvDistLabel}>{f.label}</span>
                                                    <div className={styles.logisticaTvDistBar}>
                                                        <div className={styles.logisticaTvDistBarFill} style={{ width: `${pct}%`, background: f.color }} />
                                                    </div>
                                                    <span className={styles.logisticaTvDistCount}>{count}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            ) : (
                                <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                    {t('reuniao_diaria.sem_dados_painel', 'Sem dados carregados')}
                                </p>
                            )}
                        </div>

                        {/* Panel 2: Princ. 1 */}
                        <div className={styles.logisticaTvPanel}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                <p className={styles.logisticaTvPanelTitle} style={{ borderColor: '#3b82f6', color: '#3b82f6', margin: 0, paddingBottom: 0, borderBottom: 'none', flex: 1 }}>
                                    {t('reuniao_diaria.princ1_title', 'Princ. 1 (Estoque)')}
                                </p>
                                {dc.logisticaDelivery.princ1?.uploadedAt && (
                                    <p className={styles.logisticaTvUpdateLabel}>
                                        {formatLastUpdate(dc.logisticaDelivery.princ1.uploadedAt)}
                                    </p>
                                )}
                            </div>
                            <div style={{ height: '2px', background: '#3b82f6', borderRadius: '1px', marginBottom: '0.5rem' }} />
                            {dc.logisticaDelivery.princ1 ? (
                                <>
                                    <div>
                                        <p className={styles.logisticaTvBigValue} style={{ color: '#0f172a' }}>
                                            {dc.logisticaDelivery.princ1.totalItens}
                                        </p>
                                        <p className={styles.logisticaTvLabel}>
                                            {t('reuniao_diaria.total_itens', 'Total de Itens')}
                                        </p>
                                    </div>

                                    <div className={styles.logisticaTvInferiorGrid}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                            <div>
                                                <p className={styles.logisticaTvMidValue} style={{ color: dc.logisticaDelivery.princ1.qtdAtrasados > 0 ? '#dc2626' : '#64748b' }}>
                                                    {dc.logisticaDelivery.princ1.qtdAtrasados}
                                                </p>
                                                <p className={styles.logisticaTvLabel}>
                                                    {t('reuniao_diaria.qtd_atrasados', 'Itens Atrasados')}
                                                </p>
                                            </div>
                                            <div>
                                                <p className={styles.logisticaTvMidValue} style={{ color: dc.logisticaDelivery.princ1.qtdCriticos > 0 ? '#dc2626' : '#64748b' }}>
                                                    {dc.logisticaDelivery.princ1.qtdCriticos}
                                                </p>
                                                <p className={styles.logisticaTvLabel}>
                                                    {t('reuniao_diaria.qtd_criticos', 'Críticos (15d+)')}
                                                </p>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                            <div className={styles.logisticaTvBox}>
                                                <p className={styles.logisticaTvBoxValue}>
                                                    {dc.logisticaDelivery.princ1.estoqueTotal}
                                                </p>
                                                <p className={styles.logisticaTvBoxLabel}>
                                                    {t('reuniao_diaria.estoque_total', 'Estoque Total')}
                                                </p>
                                            </div>
                                            <div className={styles.logisticaTvBox}>
                                                <p className={styles.logisticaTvBoxValue}>
                                                    {dc.logisticaDelivery.princ1.atrasoMedio}d
                                                </p>
                                                <p className={styles.logisticaTvBoxLabel}>
                                                    {t('reuniao_diaria.atraso_medio_label', 'Atraso Médio')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <p className={styles.logisticaTvDistHeader}>
                                            {t('reuniao_diaria.dist_atraso', 'Distribuição por Atraso')}
                                        </p>
                                        {[
                                            { key: 'faixa0_2', label: '0–2 dias', color: '#22c55e' },
                                            { key: 'faixa3_7', label: '3–7 dias', color: '#f59e0b' },
                                            { key: 'faixa8_14', label: '8–14 dias', color: '#f97316' },
                                            { key: 'faixa15_30', label: '15–30 dias', color: '#ef4444' },
                                            { key: 'faixa30Mais', label: '30+ dias', color: '#8b5cf6' },
                                        ].map(f => {
                                            const count = dc.logisticaDelivery!.princ1!.distribuicao[f.key as keyof typeof dc.logisticaDelivery.princ1.distribuicao];
                                            const total = dc.logisticaDelivery!.princ1!.totalItens;
                                            const pct = total > 0 ? (count / total) * 100 : 0;
                                            return (
                                                <div key={f.key} className={styles.logisticaTvDistRow}>
                                                    <span className={styles.logisticaTvDistLabel}>{f.label}</span>
                                                    <div className={styles.logisticaTvDistBar}>
                                                        <div className={styles.logisticaTvDistBarFill} style={{ width: `${pct}%`, background: f.color }} />
                                                    </div>
                                                    <span className={styles.logisticaTvDistCount}>{count}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            ) : (
                                <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                    {t('reuniao_diaria.sem_dados_painel', 'Sem dados carregados')}
                                </p>
                            )}
                        </div>

                        {/* Panel 3: Proposto */}
                        <div className={styles.logisticaTvPanel}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                <p className={styles.logisticaTvPanelTitle} style={{ borderColor: '#22c55e', color: '#22c55e', margin: 0, paddingBottom: 0, borderBottom: 'none', flex: 1 }}>
                                    {t('reuniao_diaria.proposto_title', 'Fat. Proposto')}
                                </p>
                                {dc.logisticaDelivery.proposto?.uploadedAt && (
                                    <p className={styles.logisticaTvUpdateLabel}>
                                        {formatLastUpdate(dc.logisticaDelivery.proposto.uploadedAt)}
                                    </p>
                                )}
                            </div>
                            <div style={{ height: '2px', background: '#22c55e', borderRadius: '1px', marginBottom: '0.5rem' }} />
                            {dc.logisticaDelivery.proposto ? (
                                <>
                                    <div>
                                        <p className={styles.logisticaTvBigValue} style={{ color: '#0f172a' }}>
                                            {dc.logisticaDelivery.proposto.totalRegistros}
                                        </p>
                                        <p className={styles.logisticaTvLabel}>
                                            {t('reuniao_diaria.total_registros', 'Total de Registros')}
                                        </p>
                                    </div>

                                    <div className={styles.logisticaTvInferiorGrid}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                            <div>
                                                <p className={styles.logisticaTvMidValue} style={{ color: '#0f172a' }}>
                                                    {dc.logisticaDelivery.proposto.ovsUnicas}
                                                </p>
                                                <p className={styles.logisticaTvLabel}>
                                                    {t('reuniao_diaria.ovs_unicas', 'OVs Únicas')}
                                                </p>
                                            </div>
                                            <div>
                                                <p className={styles.logisticaTvMidValue} style={{ color: dc.logisticaDelivery.proposto.itensCriticos > 0 ? '#dc2626' : '#64748b' }}>
                                                    {dc.logisticaDelivery.proposto.itensCriticos}
                                                </p>
                                                <p className={styles.logisticaTvLabel}>
                                                    {t('reuniao_diaria.itens_criticos_31', 'Críticos (31d+)')}
                                                </p>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                            <div className={styles.logisticaTvBox}>
                                                <p className={styles.logisticaTvBoxValue}>
                                                    {formatK(dc.logisticaDelivery.proposto.valorTotalProposto)}
                                                </p>
                                                <p className={styles.logisticaTvBoxLabel}>
                                                    {t('reuniao_diaria.valor_proposto', 'Valor Proposto')}
                                                </p>
                                            </div>
                                            <div className={styles.logisticaTvBox}>
                                                <p className={styles.logisticaTvBoxValue} style={{ color: dc.logisticaDelivery.proposto.totalRegistros > 0 && (dc.logisticaDelivery.proposto.itensCriticos / dc.logisticaDelivery.proposto.totalRegistros) * 100 > 20 ? '#dc2626' : '#0f172a' }}>
                                                    {dc.logisticaDelivery.proposto.totalRegistros > 0 ? `${((dc.logisticaDelivery.proposto.itensCriticos / dc.logisticaDelivery.proposto.totalRegistros) * 100).toFixed(0)}%` : '0%'}
                                                </p>
                                                <p className={styles.logisticaTvBoxLabel}>
                                                    {t('reuniao_diaria.pct_critico', '% Crítico')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <p className={styles.logisticaTvDistHeader}>
                                            {t('reuniao_diaria.dist_atraso', 'Distribuição por Atraso')}
                                        </p>
                                        {[
                                            { key: 'faixa0_2', label: '0–2 dias', color: '#22c55e' },
                                            { key: 'faixa3_7', label: '3–7 dias', color: '#f59e0b' },
                                            { key: 'faixa8_14', label: '8–14 dias', color: '#f97316' },
                                            { key: 'faixa15_30', label: '15–30 dias', color: '#ef4444' },
                                            { key: 'faixa30Mais', label: '30+ dias', color: '#8b5cf6' },
                                        ].map(f => {
                                            const count = dc.logisticaDelivery!.proposto!.distribuicao[f.key as keyof typeof dc.logisticaDelivery.proposto.distribuicao];
                                            const total = dc.logisticaDelivery!.proposto!.totalRegistros;
                                            const pct = total > 0 ? (count / total) * 100 : 0;
                                            return (
                                                <div key={f.key} className={styles.logisticaTvDistRow}>
                                                    <span className={styles.logisticaTvDistLabel}>{f.label}</span>
                                                    <div className={styles.logisticaTvDistBar}>
                                                        <div className={styles.logisticaTvDistBarFill} style={{ width: `${pct}%`, background: f.color }} />
                                                    </div>
                                                    <span className={styles.logisticaTvDistCount}>{count}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            ) : (
                                <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                    {t('reuniao_diaria.sem_dados_painel', 'Sem dados carregados')}
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderPeople = () => (
        <div className={styles.peopleSlide}>
            <img src="/values.png" alt="Pessoas" className={styles.peopleImage} />
        </div>
    );

    const SLIDE_LABELS: Record<SlideId, string> = {
        S: 'S',
        Q: 'Q',
        DC: 'D&C',
        P: 'P',
    };

    const SLIDE_TITLES: Record<SlideId, string> = {
        S: t('reuniao_diaria.slide.safety', 'Safety'),
        Q: t('reuniao_diaria.slide.quality', 'Quality'),
        DC: t('reuniao_diaria.slide.dc', 'Delivery & Cost'),
        P: t('reuniao_diaria.slide.people', 'People'),
    };

    const SLIDE_RENDERERS: Record<SlideId, () => React.ReactNode> = {
        S: renderSafety,
        Q: renderQuality,
        DC: renderDeliveryCost,
        P: renderPeople,
    };

    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.loadingSpinner} />
                {t('common.loading', 'Carregando...')}
            </div>
        );
    }

    return (
        <div className={styles.presContainer} ref={containerRef}>
            {/* Header */}
            <div className={styles.presHeader}>
                <div className={styles.presHeaderLeft}>
                    <button className={styles.presBackBtn} onClick={() => navigate('/reuniao-diaria')}>
                        <FiArrowLeft size={20} />
                    </button>
                    <span className={styles.presDept}>{DEPT_LABELS[dep] || dep}</span>
                    <span className={styles.presDate}>{data ? formatDateBR(data.dataRef) : '—'}</span>
                </div>

                <div className={styles.presHeaderRight}>
                    <div className={styles.sqdcpIndicator}>
                        {SLIDES.map((id, i) => (
                            <button
                                key={id}
                                className={`${styles.sqdcpLetter} ${SLIDE_CSS[id]} ${i === slideIdx ? styles.active : ''}`}
                                onClick={() => { setSlideIdx(i); setAutoPlay(false); }}
                                style={id === 'DC' ? { fontSize: 12, letterSpacing: -1 } : undefined}
                            >
                                {SLIDE_LABELS[id]}
                            </button>
                        ))}
                    </div>
                    <button
                        className={`${styles.autoPlayBtn} ${autoPlay ? styles.playing : ''}`}
                        onClick={() => setAutoPlay((v) => !v)}
                        title={autoPlay ? 'Pausar' : 'Auto-play'}
                    >
                        {autoPlay ? <FiPause size={16} /> : <FiPlay size={16} />}
                    </button>
                    <button className={styles.fullscreenBtn} onClick={toggleFullscreen}>
                        {isFullscreen ? <FiMinimize2 size={18} /> : <FiMaximize2 size={18} />}
                    </button>
                </div>
            </div>

            {/* Progress */}
            <div className={styles.progressBar}>
                <div
                    className={styles.progressFill}
                    style={{
                        width: `${((slideIdx + 1) / SLIDES.length) * 100}%`,
                        background: SLIDE_COLORS[currentSlide],
                    }}
                />
            </div>

            {/* Navigation arrows */}
            <button
                className={`${styles.navArrow} ${styles.navArrowLeft}`}
                onClick={() => { setSlideIdx((i) => (i - 1 + SLIDES.length) % SLIDES.length); setAutoPlay(false); }}
            >
                <FiChevronLeft size={24} />
            </button>
            <button
                className={`${styles.navArrow} ${styles.navArrowRight}`}
                onClick={() => { setSlideIdx((i) => (i + 1) % SLIDES.length); setAutoPlay(false); }}
            >
                <FiChevronRight size={24} />
            </button>

            {/* Slide content */}
            <div className={styles.slideArea}>
                <h2 className={styles.slideTitle}>
                    <span className={`${styles.slideTitleBadge} ${BADGE_CSS[currentSlide]}`}>
                        {SLIDE_LABELS[currentSlide]}
                    </span>
                    {SLIDE_TITLES[currentSlide]}
                </h2>

                {SLIDE_RENDERERS[currentSlide]()}
            </div>
        </div>
    );
}
