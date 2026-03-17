// src/features/producao/pages/ProducaoColaboradoresPage.tsx
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    FiUsers,
    FiTarget,
    FiTrendingUp,
    FiCalendar,
    FiRefreshCw,
    FiUserPlus,
    FiEdit2,
    FiSearch,
    FiCheck,
    FiBarChart2
} from 'react-icons/fi';

import PageHeader from '../../../shared/components/PageHeader';
import Modal from '../../../shared/components/Modal';
import {
    fetchFuncionariosResumo,
    upsertFuncionarioMeta,
    listarUsuarios,
} from '../../../services/apiClient';
import type { Usuario } from '../../../types/api';

import styles from './ProducaoColaboradoresPage.module.css';

/* ==========================
   Tipos
   ========================== */
type FuncionarioMeta = {
    id?: number;
    matricula: string;
    nome: string;
    meta_diaria_horas: number;
    ativo: boolean;
};

type FuncionarioDia = {
    data_wip: string;
    matricula: string;
    produzido_h: number;
};

type FuncionarioMes = {
    ano_mes: string;
    matricula: string;
    produzido_h: number;
};

type LinhaUI = FuncionarioMeta & {
    meta_acumulada: number;
    meta_mensal: number;
    real_dia: number;
    real_mes: number;
    perf_dia: number | null;
    perf_mes: number | null;
};

/* ==========================
   Helpers
   ========================== */
function startOfDayLocal(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function monthStart(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

function dateToISO(d: Date) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function ymKeyFromDate(d: Date) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
}

function monthToAnoMesISO(d: Date) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
}

function parseLocalDateString(input: string | null | undefined): Date | null {
    if (!input) return null;
    let s = input.trim();
    if (/^\d{4}-\d{2}$/.test(s)) {
        const [y, m] = s.split('-').map(Number);
        return new Date(y, m - 1, 1);
    }
    const t = s.indexOf('T');
    if (t >= 0) s = s.slice(0, t);
    let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
}

function businessDaysInMonth(year: number, monthZeroBased: number) {
    const first = new Date(year, monthZeroBased, 1);
    const last = new Date(year, monthZeroBased + 1, 0);
    let count = 0;
    for (let d = first.getDate(); d <= last.getDate(); d += 1) {
        const wd = new Date(year, monthZeroBased, d).getDay();
        if (wd >= 1 && wd <= 5) count += 1;
    }
    return count;
}

// Conta dias úteis desde o início do mês até a data especificada (inclusive)
function businessDaysUntilDate(date: Date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const targetDay = date.getDate();
    let count = 0;
    for (let d = 1; d <= targetDay; d++) {
        const wd = new Date(year, month, d).getDay();
        if (wd >= 1 && wd <= 5) count += 1;
    }
    return count;
}

/* Persistência local */
const STORAGE_KEY = 'func_meta_params_v1';
type MesParams = { diasCorridos: number; diasUteisMes: number };
type MesParamsMap = { [ym: string]: MesParams };

function loadMonthParams(refDate: Date): MesParams | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const map = JSON.parse(raw) as MesParamsMap;
        return map[ymKeyFromDate(refDate)] ?? null;
    } catch {
        return null;
    }
}

function saveMonthParams(refDate: Date, diasCorridos: number, diasUteisMes: number) {
    if (typeof window === 'undefined') return;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const map: MesParamsMap = raw ? JSON.parse(raw) : {};
        map[ymKeyFromDate(refDate)] = { diasCorridos, diasUteisMes };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        // silent
    }
}

/* ==========================
   Tipos
   ========================== */
interface User {
    role?: string;
    email?: string;
}

interface ProducaoColaboradoresPageProps {
    user: User;
}

/* ==========================
   Componente Principal
   ========================== */
export default function ProducaoColaboradoresPage({ user }: ProducaoColaboradoresPageProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const today = startOfDayLocal(new Date());

    // Estados de filtro
    const [mesRef, setMesRef] = useState<Date>(() => monthStart(today));
    const [diaRef, setDiaRef] = useState<Date>(() => today);
    const [diasCorridos, setDiasCorridos] = useState<number>(() => {
        const persisted = loadMonthParams(monthStart(today));
        return persisted?.diasCorridos ?? businessDaysUntilDate(today);
    });
    const [diasUteisMes, setDiasUteisMes] = useState<number>(() => {
        const persisted = loadMonthParams(monthStart(today));
        return persisted?.diasUteisMes ?? businessDaysInMonth(today.getFullYear(), today.getMonth());
    });

    // Dados
    const [metas, setMetas] = useState<FuncionarioMeta[]>([]);
    const [dadosDia, setDadosDia] = useState<FuncionarioDia[]>([]);
    const [dadosMes, setDadosMes] = useState<FuncionarioMes[]>([]);
    const [loading, setLoading] = useState(false);

    // Modal de edição (editar meta de um colaborador já monitorado)
    const [editState, setEditState] = useState<{
        id?: number;
        matricula: string;
        nome: string;
        meta_diaria_horas: number;
        ativo: boolean;
    } | null>(null);
    const [saving, setSaving] = useState(false);

    // Modal de seleção de operadores
    const [showSelectModal, setShowSelectModal] = useState(false);
    const [operadores, setOperadores] = useState<Usuario[]>([]);
    const [loadingOperadores, setLoadingOperadores] = useState(false);
    const [searchOperador, setSearchOperador] = useState('');
    const [selectedOperador, setSelectedOperador] = useState<Usuario | null>(null);
    const [novaMeta, setNovaMeta] = useState(8);

    /* --- Carregar dados --- */
    const carregarDados = useCallback(async () => {
        setLoading(true);
        try {
            const resumo = await fetchFuncionariosResumo(
                dateToISO(diaRef),
                monthToAnoMesISO(mesRef),
            );
            const metasResp = resumo?.metas ?? [];
            const diaResp = resumo?.dia ?? [];
            const mesResp = resumo?.mes ?? [];

            setMetas(
                metasResp.map((m) => ({
                    id: m.id,
                    matricula: m.matricula,
                    nome: m.nome || m.matricula,
                    meta_diaria_horas: Number(m.meta_diaria_horas) || 0,
                    ativo: Boolean(m.ativo),
                }))
            );
            setDadosDia(
                diaResp.map((r) => ({
                    data_wip: r.data_wip,
                    matricula: r.matricula,
                    produzido_h: Number(r.produzido_h) || 0,
                }))
            );
            setDadosMes(
                mesResp.map((r) => ({
                    ano_mes: r.ano_mes,
                    matricula: r.matricula,
                    produzido_h: Number(r.produzido_h) || 0,
                }))
            );
        } catch (e) {
            console.error(e);
            toast.error(t('producao.colaboradores.toasts.loadError', 'Erro ao carregar dados'));
        } finally {
            setLoading(false);
        }
    }, [mesRef, diaRef]);

    useEffect(() => {
        carregarDados();
    }, [carregarDados]);

    useEffect(() => {
        saveMonthParams(mesRef, diasCorridos, diasUteisMes);
    }, [mesRef, diasCorridos, diasUteisMes]);

    /* --- Carregar operadores quando abrir modal de seleção --- */
    const abrirModalSelecao = async () => {
        setShowSelectModal(true);
        setSelectedOperador(null);
        setSearchOperador('');
        setNovaMeta(8);

        if (operadores.length === 0) {
            setLoadingOperadores(true);
            try {
                const users = await listarUsuarios({ role: 'operador' }, { role: user.role, email: user.email });
                setOperadores(users.filter(u => u.matricula)); // Só operadores com matrícula
            } catch (e) {
                console.error(e);
                toast.error(t('producao.colaboradores.toasts.loadOperatorsError', 'Erro ao carregar operadores'));
            } finally {
                setLoadingOperadores(false);
            }
        }
    };

    // Operadores filtrados pela busca e que não estão já monitorados
    const operadoresFiltrados = useMemo(() => {
        const matriculasMonitoradas = new Set(metas.map(m => m.matricula));
        const term = searchOperador.toLowerCase();

        return operadores.filter(op => {
            // Não mostrar quem já está monitorado
            if (matriculasMonitoradas.has(op.matricula || '')) return false;

            // Filtrar por busca
            if (!term) return true;
            return (
                op.nome?.toLowerCase().includes(term) ||
                op.matricula?.toLowerCase().includes(term)
            );
        });
    }, [operadores, metas, searchOperador]);

    /* --- Adicionar operador para monitoramento --- */
    const handleAdicionarOperador = async () => {
        if (!selectedOperador || !selectedOperador.matricula) return;

        setSaving(true);
        try {
            await upsertFuncionarioMeta({
                matricula: selectedOperador.matricula,
                nome: selectedOperador.nome || selectedOperador.matricula,
                meta_diaria_horas: novaMeta,
                ativo: true,
            }, { role: user.role, email: user.email });
            toast.success(t('producao.colaboradores.toasts.addSuccess', { name: selectedOperador.nome || selectedOperador.matricula, defaultValue: '{{name}} adicionado ao monitoramento!' }));
            await carregarDados();
            setShowSelectModal(false);
            setSelectedOperador(null);
        } catch (e) {
            console.error(e);
            toast.error(t('producao.colaboradores.toasts.addError', 'Erro ao adicionar operador'));
        } finally {
            setSaving(false);
        }
    };

    /* --- Abrir detalhe de um colaborador (Navegar) --- */
    const abrirDetalhe = (f: LinhaUI) => {
        const anoMes = ymKeyFromDate(mesRef);
        navigate(`/producao/colaboradores/${f.matricula}?mes=${anoMes}`);
    };

    /* --- Modal de edição handlers --- */
    const abrirEditar = (f: FuncionarioMeta) => {
        setEditState({
            id: f.id,
            matricula: f.matricula,
            nome: f.nome,
            meta_diaria_horas: Number(f.meta_diaria_horas) || 0,
            ativo: f.ativo,
        });
    };

    const fecharModal = () => {
        if (saving) return;
        setEditState(null);
    };

    const handleSalvar = async () => {
        if (!editState) return;

        setSaving(true);
        try {
            await upsertFuncionarioMeta({
                id: editState.id,
                matricula: editState.matricula.trim(),
                nome: editState.nome.trim() || editState.matricula.trim(),
                meta_diaria_horas: Number(editState.meta_diaria_horas) || 0,
                ativo: editState.ativo,
            }, { role: user.role, email: user.email });
            toast.success(t('producao.colaboradores.toasts.updateSuccess', 'Meta atualizada com sucesso!'));
            await carregarDados();
            setEditState(null);
        } catch (e) {
            console.error(e);
            toast.error(t('producao.colaboradores.toasts.saveError', 'Erro ao salvar'));
        } finally {
            setSaving(false);
        }
    };

    /* --- Montagem das linhas --- */
    const linhas: LinhaUI[] = useMemo(() => {
        if (!metas.length) return [];

        const mapDia = new Map<string, number>();
        dadosDia.forEach((r) => {
            mapDia.set(r.matricula, (mapDia.get(r.matricula) ?? 0) + r.produzido_h);
        });

        const mapMes = new Map<string, number>();
        dadosMes.forEach((r) => {
            mapMes.set(r.matricula, (mapMes.get(r.matricula) ?? 0) + r.produzido_h);
        });

        return metas.map((f) => {
            const metaDia = Number(f.meta_diaria_horas) || 0;
            const realDia = mapDia.get(f.matricula) ?? 0;
            const realMes = mapMes.get(f.matricula) ?? 0;

            const metaAcum = metaDia * (diasCorridos || 0);
            const metaMensal = metaDia * (diasUteisMes || 0);

            const perfDia = metaDia > 0 ? (realDia / metaDia) * 100 : null;
            const perfMes = metaMensal > 0 ? (realMes / metaMensal) * 100 : null;

            return {
                ...f,
                meta_acumulada: metaAcum,
                meta_mensal: metaMensal,
                real_dia: realDia,
                real_mes: realMes,
                perf_dia: perfDia,
                perf_mes: perfMes,
            };
        });
    }, [metas, dadosDia, dadosMes, diasCorridos, diasUteisMes]);

    /* --- Totais --- */
    const totalMetaDiaria = useMemo(() => linhas.reduce((s, l) => s + l.meta_diaria_horas, 0), [linhas]);
    const totalMetaAcumulada = useMemo(() => linhas.reduce((s, l) => s + l.meta_acumulada, 0), [linhas]);
    const totalMetaMensal = useMemo(() => linhas.reduce((s, l) => s + l.meta_mensal, 0), [linhas]);
    const totalRealDia = useMemo(() => linhas.reduce((s, l) => s + l.real_dia, 0), [linhas]);
    const totalRealMensal = useMemo(() => linhas.reduce((s, l) => s + l.real_mes, 0), [linhas]);
    const perfDiaGlobal = useMemo(() => totalMetaDiaria > 0 ? (totalRealDia / totalMetaDiaria) * 100 : null, [totalMetaDiaria, totalRealDia]);
    const perfMesGlobal = useMemo(() => totalMetaMensal > 0 ? (totalRealMensal / totalMetaMensal) * 100 : null, [totalMetaMensal, totalRealMensal]);

    /* --- Stats cards --- */
    const stats = useMemo(() => [
        { label: t('producao.colaboradores.stats.active', 'Colaboradores Ativos'), value: linhas.filter(l => l.ativo).length, icon: <FiUsers />, color: 'cardBlue' },
        { label: t('producao.colaboradores.stats.totalGoal', 'Meta Mensal Total'), value: `${totalMetaMensal.toFixed(1)}h`, icon: <FiTarget />, color: 'cardOrange' },
        { label: t('producao.colaboradores.stats.totalReal', 'Realizado Mês'), value: `${totalRealMensal.toFixed(1)}h`, icon: <FiTrendingUp />, color: 'cardGreen' },
        { label: t('producao.colaboradores.stats.performance', 'Performance Mês'), value: perfMesGlobal != null ? `${perfMesGlobal.toFixed(1)}%` : '—', icon: <FiCalendar />, color: 'cardPurple' },
    ], [linhas, totalMetaMensal, totalRealMensal, perfMesGlobal, t]);

    /* --- Helpers de UI --- */
    const formatNum = (v: number, dec = 2) => Number.isFinite(v) ? v.toFixed(dec) : '—';

    const getPerfClass = (p: number | null) => {
        if (p == null || !Number.isFinite(p)) return '';
        if (p < 80) return styles.perfBad;
        if (p <= 100) return styles.perfWarning;
        return styles.perfGood;
    };

    /* --- Render --- */
    return (
        <>
            <PageHeader
                title={t('producao.colaboradores.title', 'Performance por Colaborador')}
                subtitle={t('producao.colaboradores.subtitle', 'Acompanhe a produção e metas individuais de cada operador.')}
            />

            <div className={styles.mainContainer}>
                {/* Stats Grid */}
                <div className={styles.statsGrid}>
                    {stats.map((stat, idx) => (
                        <div key={idx} className={`${styles.statCard} ${styles[stat.color]}`}>
                            <div className={styles.statIconWrapper}>{stat.icon}</div>
                            <div className={styles.statContent}>
                                <span className={styles.statLabel}>{stat.label}</span>
                                <strong className={styles.statValue}>{stat.value}</strong>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Control Bar */}
                <div className={styles.controlBar}>
                    <div className={styles.filterGroup}>
                        <div className={styles.filterField}>
                            <label className={styles.filterLabel}>{t('producao.colaboradores.filters.monthRef', 'Mês de Referência')}</label>
                            <input
                                type="month"
                                className={styles.filterInput}
                                value={mesRef.toISOString().slice(0, 7)}
                                onChange={(e) => {
                                    const d = parseLocalDateString(e.target.value);
                                    if (d) {
                                        setMesRef(d);
                                        const persisted = loadMonthParams(d);
                                        if (persisted) {
                                            setDiasCorridos(persisted.diasCorridos);
                                            setDiasUteisMes(persisted.diasUteisMes);
                                        } else {
                                            setDiasCorridos(1);
                                            setDiasUteisMes(businessDaysInMonth(d.getFullYear(), d.getMonth()));
                                        }
                                    }
                                }}
                            />
                        </div>

                        <div className={styles.filterField}>
                            <label className={styles.filterLabel}>{t('producao.colaboradores.filters.dayAnalysis', 'Dia para Análise')}</label>
                            <input
                                type="date"
                                className={styles.filterInput}
                                value={diaRef.toISOString().slice(0, 10)}
                                onChange={(e) => {
                                    const d = parseLocalDateString(e.target.value);
                                    if (!d) return;
                                    setDiaRef(d);
                                    if (d.getMonth() === mesRef.getMonth() && d.getFullYear() === mesRef.getFullYear()) {
                                        setDiasCorridos(d.getDate());
                                    }
                                }}
                            />
                        </div>

                        <div className={styles.filterField}>
                            <label className={styles.filterLabel}>{t('producao.colaboradores.filters.runningDays', 'Dias Corridos')}</label>
                            <input
                                type="number"
                                className={styles.filterInput}
                                value={diasCorridos}
                                onChange={(e) => setDiasCorridos(Number(e.target.value))}
                                min={0}
                                style={{ width: 80 }}
                            />
                        </div>

                        <div className={styles.filterField}>
                            <label className={styles.filterLabel}>{t('producao.colaboradores.filters.businessDays', 'Dias Úteis Mês')}</label>
                            <input
                                type="number"
                                className={styles.filterInput}
                                value={diasUteisMes}
                                onChange={(e) => setDiasUteisMes(Number(e.target.value))}
                                min={0}
                                style={{ width: 80 }}
                            />
                        </div>
                    </div>

                    <div className={styles.actionsWrapper}>
                        <button className={styles.secondaryButton} onClick={carregarDados} disabled={loading}>
                            <FiRefreshCw className={loading ? styles.spin : ''} /> {t('producao.colaboradores.filters.update', 'Atualizar')}
                        </button>
                        <button className={styles.primaryButton} onClick={abrirModalSelecao}>
                            <FiUserPlus /> {t('producao.colaboradores.filters.addOperator', 'Adicionar Operador')}
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className={styles.tableContainer}>
                    {loading && (
                        <div className={styles.loadingOverlay}>
                            <FiRefreshCw className={styles.spin} />
                        </div>
                    )}

                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>{t('producao.colaboradores.table.matricula', 'Matrícula')}</th>
                                <th>{t('producao.colaboradores.table.name', 'Nome')}</th>
                                <th className={styles.alignRight}>{t('producao.colaboradores.table.dailyGoal', 'Meta Dia (h)')}</th>
                                <th className={styles.alignRight}>{t('producao.colaboradores.table.accumGoal', 'Meta Acum (h)')}</th>
                                <th className={styles.alignRight}>{t('producao.colaboradores.table.monthGoal', 'Meta Mês (h)')}</th>
                                <th className={styles.alignRight}>{t('producao.colaboradores.table.realDay', 'Real Dia (h)')}</th>
                                <th className={styles.alignRight}>{t('producao.colaboradores.table.realMonth', 'Real Mês (h)')}</th>
                                <th className={styles.alignRight}>{t('producao.colaboradores.table.perfDay', 'Perf. Dia')}</th>
                                <th className={styles.alignRight}>{t('producao.colaboradores.table.perfMonth', 'Perf. Mês')}</th>
                                <th className={styles.alignCenter}>{t('producao.colaboradores.table.status', 'Status')}</th>
                                <th style={{ width: 80 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {!loading && linhas.length === 0 && (
                                <tr>
                                    <td colSpan={11}>
                                        <div className={styles.emptyState}>
                                            <FiUsers size={48} />
                                            <h3>{t('producao.colaboradores.table.empty.title', 'Nenhum operador monitorado')}</h3>
                                            <p>{t('producao.colaboradores.table.empty.text', 'Clique em "Adicionar Operador" para selecionar quais operadores deseja acompanhar.')}</p>
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {linhas.map((l) => (
                                <tr key={l.matricula}>
                                    <td><span className={styles.numericValue}>{l.matricula}</span></td>
                                    <td>{l.nome}</td>
                                    <td className={styles.alignRight}><span className={styles.numericValue}>{formatNum(l.meta_diaria_horas)}</span></td>
                                    <td className={styles.alignRight}><span className={styles.numericValue}>{formatNum(l.meta_acumulada)}</span></td>
                                    <td className={styles.alignRight}><span className={styles.numericValue}>{formatNum(l.meta_mensal)}</span></td>
                                    <td className={styles.alignRight}><span className={styles.numericValue}>{formatNum(l.real_dia)}</span></td>
                                    <td className={styles.alignRight}><span className={styles.numericValue}>{formatNum(l.real_mes)}</span></td>
                                    <td className={styles.alignRight}>
                                        <span className={`${styles.perfValue} ${getPerfClass(l.perf_dia)}`}>
                                            {l.perf_dia != null ? `${formatNum(l.perf_dia)}%` : '—'}
                                        </span>
                                    </td>
                                    <td className={styles.alignRight}>
                                        <span className={`${styles.perfValue} ${getPerfClass(l.perf_mes)}`}>
                                            {l.perf_mes != null ? `${formatNum(l.perf_mes)}%` : '—'}
                                        </span>
                                    </td>
                                    <td className={styles.alignCenter}>
                                        <span className={`${styles.statusBadge} ${l.ativo ? styles.badgeActive : styles.badgeInactive}`}>
                                            {l.ativo ? t('producao.colaboradores.table.active', 'Ativo') : t('producao.colaboradores.table.inactive', 'Inativo')}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button className={styles.iconButton} onClick={() => abrirDetalhe(l)} title={t('producao.colaboradores.table.viewDetails', 'Ver detalhes')} style={{ color: 'var(--color-primary)' }}><FiBarChart2 /></button>
                                            <button className={styles.iconButton} onClick={() => abrirEditar(l)} title={t('producao.colaboradores.table.editTitle', 'Editar meta')}>
                                                <FiEdit2 />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}

                            {linhas.length > 0 && (
                                <tr className={styles.totalRow}>
                                    <td colSpan={2}><strong>{t('producao.colaboradores.table.totals', 'Totais')}</strong></td>
                                    <td className={styles.alignRight}><span className={styles.numericValue}>{formatNum(totalMetaDiaria)}</span></td>
                                    <td className={styles.alignRight}><span className={styles.numericValue}>{formatNum(totalMetaAcumulada)}</span></td>
                                    <td className={styles.alignRight}><span className={styles.numericValue}>{formatNum(totalMetaMensal)}</span></td>
                                    <td className={styles.alignRight}><span className={styles.numericValue}>{formatNum(totalRealDia)}</span></td>
                                    <td className={styles.alignRight}><span className={styles.numericValue}>{formatNum(totalRealMensal)}</span></td>
                                    <td className={styles.alignRight}>
                                        <span className={`${styles.perfValue} ${getPerfClass(perfDiaGlobal)}`}>
                                            {perfDiaGlobal != null ? `${formatNum(perfDiaGlobal)}%` : '—'}
                                        </span>
                                    </td>
                                    <td className={styles.alignRight}>
                                        <span className={`${styles.perfValue} ${getPerfClass(perfMesGlobal)}`}>
                                            {perfMesGlobal != null ? `${formatNum(perfMesGlobal)}%` : '—'}
                                        </span>
                                    </td>
                                    <td colSpan={2}></td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de Seleção de Operador */}
            <Modal
                isOpen={showSelectModal}
                onClose={() => !saving && setShowSelectModal(false)}
                title={t('producao.colaboradores.modal.addTitle', 'Adicionar Operador ao Monitoramento')}
            >
                <div className={styles.modalForm}>
                    {/* Busca */}
                    <div className={styles.searchWrapper}>
                        <FiSearch className={styles.searchIcon} />
                        <input
                            type="text"
                            className={styles.searchInput}
                            placeholder={t('producao.colaboradores.modal.searchPlaceholder', 'Buscar por nome ou matrícula...')}
                            value={searchOperador}
                            onChange={(e) => setSearchOperador(e.target.value)}
                        />
                    </div>

                    {/* Lista de Operadores */}
                    <div className={styles.operadorList}>
                        {loadingOperadores ? (
                            <div className={styles.listLoading}>
                                <FiRefreshCw className={styles.spin} /> {t('producao.colaboradores.modal.loading', 'Carregando operadores...')}
                            </div>
                        ) : operadoresFiltrados.length === 0 ? (
                            <div className={styles.listEmpty}>
                                {searchOperador
                                    ? t('producao.colaboradores.modal.emptySearch', 'Nenhum operador encontrado com essa busca.')
                                    : t('producao.colaboradores.modal.allMonitored', 'Todos os operadores já estão sendo monitorados.')}
                            </div>
                        ) : (
                            operadoresFiltrados.map((op) => (
                                <div
                                    key={op.id}
                                    className={`${styles.operadorItem} ${selectedOperador?.id === op.id ? styles.selected : ''}`}
                                    onClick={() => setSelectedOperador(op)}
                                >
                                    <div className={styles.operadorInfo}>
                                        <span className={styles.operadorNome}>{op.nome}</span>
                                        <span className={styles.operadorMatricula}>{t('producao.colaboradores.modal.matricula', 'Mat: ')} {op.matricula}</span>
                                    </div>
                                    {selectedOperador?.id === op.id && (
                                        <FiCheck className={styles.checkIcon} />
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {/* Input de Meta */}
                    {selectedOperador && (
                        <div className={styles.modalField}>
                            <label className={styles.modalLabel}>
                                {t('producao.colaboradores.modal.dailyGoalLabel', { name: selectedOperador.nome, defaultValue: `Meta diária para ${selectedOperador.nome} (horas)` })}
                            </label>
                            <input
                                type="number"
                                className={styles.modalInput}
                                value={novaMeta}
                                onChange={(e) => setNovaMeta(Number(e.target.value))}
                                min={0}
                                step={0.5}
                            />
                        </div>
                    )}

                    <div className={styles.modalActions}>
                        <button
                            className={styles.modalSecondaryButton}
                            onClick={() => setShowSelectModal(false)}
                            disabled={saving}
                        >
                            {t('producao.colaboradores.modal.cancel', 'Cancelar')}
                        </button>
                        <button
                            className={styles.modalPrimaryButton}
                            onClick={handleAdicionarOperador}
                            disabled={saving || !selectedOperador}
                        >
                            {saving ? t('producao.colaboradores.modal.adding', 'Adicionando...') : t('producao.colaboradores.modal.add', 'Adicionar')}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Modal de Edição de Meta */}
            <Modal
                isOpen={!!editState}
                onClose={fecharModal}
                title={t('producao.colaboradores.modal.editTitle', { name: editState?.nome || '', defaultValue: `Editar Meta: ${editState?.nome || ''}` })}
            >
                <div className={styles.modalForm}>
                    <div className={styles.modalField}>
                        <label className={styles.modalLabel}>{t('producao.colaboradores.modal.matricula', 'Matrícula')}</label>
                        <input
                            type="text"
                            className={styles.modalInput}
                            value={editState?.matricula || ''}
                            disabled
                        />
                    </div>

                    <div className={styles.modalField}>
                        <label className={styles.modalLabel}>{t('producao.colaboradores.modal.name', 'Nome')}</label>
                        <input
                            type="text"
                            className={styles.modalInput}
                            value={editState?.nome || ''}
                            disabled
                        />
                    </div>

                    <div className={styles.modalField}>
                        <label className={styles.modalLabel}>{t('producao.colaboradores.modal.dailyGoal', 'Meta Diária (horas)')}</label>
                        <input
                            type="number"
                            className={styles.modalInput}
                            value={editState?.meta_diaria_horas || 0}
                            onChange={(e) => setEditState(prev => prev ? ({ ...prev, meta_diaria_horas: Number(e.target.value) }) : prev)}
                            disabled={saving}
                            min={0}
                            step={0.5}
                        />
                    </div>

                    <div className={styles.toggleRow}>
                        <span>{t('producao.colaboradores.modal.monitoring', 'Monitorando')}</span>
                        <button
                            type="button"
                            className={`${styles.toggle} ${editState?.ativo ? styles.toggleActive : ''}`}
                            onClick={() => setEditState(prev => prev ? ({ ...prev, ativo: !prev.ativo }) : prev)}
                            disabled={saving}
                        >
                            <span className={styles.toggleThumb} />
                        </button>
                    </div>

                    <div className={styles.modalActions}>
                        <button className={styles.modalSecondaryButton} onClick={fecharModal} disabled={saving}>
                            {t('producao.colaboradores.modal.cancel', 'Cancelar')}
                        </button>
                        <button className={styles.modalPrimaryButton} onClick={handleSalvar} disabled={saving}>
                            {saving ? t('producao.colaboradores.modal.saving', 'Salvando...') : t('producao.colaboradores.modal.save', 'Salvar')}
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
}

