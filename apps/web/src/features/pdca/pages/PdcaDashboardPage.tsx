import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { http } from '../../../services/apiClient';
import PageHeader from '../../../shared/components/PageHeader';
import styles from './PdcaDashboardPage.module.css';
import {
    Factory,
    Wrench,
    Shield,
    TrendingUp,
    TrendingDown,
    Plus,
    ClipboardList,
    AlertCircle,
    DollarSign,
    Calendar
} from 'lucide-react';
import toast from 'react-hot-toast';

interface DashboardData {
    periodo: { inicio: string; fim: string; dias: number };
    producao: {
        horasProduzidas: number;
        horasAnterior: number;
        variacao: number;
        variacaoPositiva: boolean;
        ultimoDia: { data: string; horas: number } | null;
    };
    manutencao: {
        chamadosAbertos: number;
        chamadosAnterior: number;
        variacao: number;
        variacaoPositiva: boolean;
        ultimoChamado: { id: string; descricao: string; maquina: string; data: string } | null;
    };
    qualidade: {
        custoRefugo: number;
        custoAnterior: number;
        quantidadeRefugo: number;
        variacao: number;
        variacaoPositiva: boolean;
        ultimosCasos: {
            ncr: string;
            data: string;
            item: string;
            descricao: string;
            custo: number;
            responsavel: string;
            origem: string;
        }[];
    };
    faturamento: {
        acumuladoMes: number;
        acumuladoMesAnterior: number;
        meta: number;
        percentualMeta: number;
        mesReferencia: string;
        mesAnteriorReferencia: string;
        variacaoMesAnterior: number;
        variacaoPositiva: boolean;
    };
    pdca: {
        planosAbertos: number;
        planosEmAndamento: number;
        planosConcluidos: number;
        acoesPendentes: number;
    };
}

export default function PdcaDashboardPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(7);

    // New Plan Modal
    const [showModal, setShowModal] = useState(false);
    const [titulo, setTitulo] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        loadData();
    }, [days]);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await http.get<DashboardData>(`/pdca/dashboard?days=${days}`);
            setData(res);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleDateString('pt-BR');
        } catch {
            return dateStr;
        }
    };

    const handleCreatePlan = async () => {
        if (!titulo.trim()) {
            toast.error(t('pdca.titleRequired', 'Título é obrigatório'));
            return;
        }
        setCreating(true);
        try {
            const res = await http.post<{ id: string }>('/pdca/planos', { data: { titulo } });
            toast.success(t('pdca.planCreated', 'Plano de ação criado!'));
            setShowModal(false);
            setTitulo('');
            navigate(`/pdca/planos/${res.id}`);
        } catch (err) {
            console.error(err);
            toast.error(t('pdca.createError', 'Erro ao criar plano'));
        } finally {
            setCreating(false);
        }
    };

    // Renderiza variação com cores baseadas no campo variacaoPositiva do backend
    const renderVariation = (variation: number, isPositive: boolean) => {
        if (variation === 0) {
            return <span className={`${styles.kpiVariation} ${styles.neutral}`}>0%</span>;
        }

        const isUp = variation > 0;
        const colorClass = isPositive ? styles.positive : styles.negative;

        return (
            <span className={`${styles.kpiVariation} ${colorClass}`}>
                {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {isUp ? '+' : ''}{Math.round(variation)}%
            </span>
        );
    };

    return (
        <>
            <PageHeader
                title={t('pdca.dashboardTitle', 'PDCA - Visão Consolidada')}
                subtitle={t('pdca.dashboardSubtitle', 'Acompanhe os indicadores e gerencie planos de ação')}
                actions={
                    <button className={styles.newPlanBtn} onClick={() => setShowModal(true)}>
                        <Plus size={20} />
                        {t('pdca.newPlan', 'Novo Plano de Ação')}
                    </button>
                }
            />

            <div className={styles.container}>
                <div className={styles.content}>
                    {/* Period Selector */}
                    <div className={styles.periodSelector}>
                        <span className={styles.periodLabel}>{t('common.period', 'Período')}:</span>
                        <div className={styles.periodButtons}>
                            {[7, 15, 30].map(d => (
                                <button
                                    key={d}
                                    className={`${styles.periodBtn} ${days === d ? styles.active : ''}`}
                                    onClick={() => setDays(d)}
                                >
                                    {d} {t('pdca.days', 'dias')}
                                </button>
                            ))}
                        </div>
                    </div>

                    {loading ? (
                        <div className={styles.loading}>{t('common.loading', 'Carregando...')}</div>
                    ) : (
                        <>
                            {/* KPI Cards */}
                            <div className={styles.kpiGrid}>
                                {/* Produção - maior = melhor */}
                                <div className={styles.kpiCard}>
                                    <div className={styles.kpiHeader}>
                                        <div className={`${styles.kpiIcon} ${styles.blue}`}>
                                            <Factory size={24} />
                                        </div>
                                        <span className={styles.kpiTitle}>{t('pdca.production', 'Produção')}</span>
                                    </div>
                                    <div className={styles.kpiValue}>{data?.producao?.horasProduzidas || 0}h</div>
                                    <div className={styles.kpiSubInfo}>
                                        {data?.producao?.ultimoDia && (
                                            <span className={styles.kpiDetail}>
                                                <Calendar size={12} />
                                                {formatDate(data.producao.ultimoDia.data)}: {data.producao.ultimoDia.horas}h
                                            </span>
                                        )}
                                        <span className={styles.kpiComparison}>
                                            vs {data?.producao?.horasAnterior || 0}h ({days} dias anteriores)
                                        </span>
                                    </div>
                                    {renderVariation(
                                        data?.producao?.variacao || 0,
                                        data?.producao?.variacaoPositiva ?? true
                                    )}
                                </div>

                                {/* Manutenção - menos chamados = melhor */}
                                <div className={styles.kpiCard}>
                                    <div className={styles.kpiHeader}>
                                        <div className={`${styles.kpiIcon} ${styles.yellow}`}>
                                            <Wrench size={24} />
                                        </div>
                                        <span className={styles.kpiTitle}>{t('pdca.maintenance', 'Chamados Abertos')}</span>
                                    </div>
                                    <div className={styles.kpiValue}>{data?.manutencao?.chamadosAbertos || 0}</div>
                                    <div className={styles.kpiSubInfo}>
                                        {data?.manutencao?.ultimoChamado && (
                                            <span className={styles.kpiDetail} title={data.manutencao.ultimoChamado.descricao}>
                                                <AlertCircle size={12} />
                                                {data.manutencao.ultimoChamado.maquina || 'Máquina'}
                                            </span>
                                        )}
                                        <span className={styles.kpiComparison}>
                                            vs {data?.manutencao?.chamadosAnterior || 0} ({days} dias antes)
                                        </span>
                                    </div>
                                    {renderVariation(
                                        data?.manutencao?.variacao || 0,
                                        data?.manutencao?.variacaoPositiva ?? true
                                    )}
                                </div>

                                {/* Qualidade - menos custo = melhor */}
                                <div className={styles.kpiCard}>
                                    <div className={styles.kpiHeader}>
                                        <div className={`${styles.kpiIcon} ${styles.red}`}>
                                            <Shield size={24} />
                                        </div>
                                        <span className={styles.kpiTitle}>{t('pdca.qualityCost', 'Custo de Refugo')}</span>
                                    </div>
                                    <div className={styles.kpiValue}>{formatCurrency(data?.qualidade?.custoRefugo || 0)}</div>
                                    <div className={styles.kpiSubInfo}>
                                        <span className={styles.kpiDetail}>
                                            {data?.qualidade?.quantidadeRefugo || 0} {t('pdca.occurrences', 'ocorrências')}
                                        </span>
                                        <span className={styles.kpiComparison}>
                                            vs {formatCurrency(data?.qualidade?.custoAnterior || 0)} ({days} dias anteriores)
                                        </span>
                                    </div>
                                    {renderVariation(
                                        data?.qualidade?.variacao || 0,
                                        data?.qualidade?.variacaoPositiva ?? true
                                    )}
                                </div>

                                {/* Faturamento - maior = melhor (acumulado mensal) */}
                                <div className={styles.kpiCard}>
                                    <div className={styles.kpiHeader}>
                                        <div className={`${styles.kpiIcon} ${styles.green}`}>
                                            <DollarSign size={24} />
                                        </div>
                                        <span className={styles.kpiTitle}>{t('pdca.billing', 'Faturamento')}</span>
                                    </div>
                                    <div className={styles.kpiValue}>{formatCurrency(data?.faturamento?.acumuladoMes || 0)}</div>
                                    <div className={styles.kpiSubInfo}>
                                        <span className={styles.kpiDetail}>
                                            <Calendar size={12} />
                                            {t('pdca.monthlyAccumulated', 'Acumulado')} {data?.faturamento?.mesReferencia}
                                        </span>
                                        {data?.faturamento?.meta && data.faturamento.meta > 0 && (
                                            <span className={styles.kpiDetail}>
                                                {t('pdca.metaProgress', 'Meta')}: {data.faturamento.percentualMeta}%
                                            </span>
                                        )}
                                        <span className={styles.kpiComparison}>
                                            vs {formatCurrency(data?.faturamento?.acumuladoMesAnterior || 0)} ({data?.faturamento?.mesAnteriorReferencia})
                                        </span>
                                    </div>
                                    {renderVariation(
                                        data?.faturamento?.variacaoMesAnterior || 0,
                                        data?.faturamento?.variacaoPositiva ?? true
                                    )}
                                </div>
                            </div>

                            {/* PDCA Summary */}
                            <div className={styles.section}>
                                <h2 className={styles.sectionTitle}>
                                    <ClipboardList size={20} />
                                    {t('pdca.actionPlans', 'Planos de Ação')}
                                </h2>
                                <div className={styles.pdcaSummary}>
                                    <div className={`${styles.pdcaCard} ${styles.open}`}>
                                        <div className={styles.pdcaCount}>{data?.pdca?.planosAbertos || 0}</div>
                                        <div className={styles.pdcaLabel}>{t('pdca.statusOpen', 'Abertos')}</div>
                                    </div>
                                    <div className={`${styles.pdcaCard} ${styles.progress}`}>
                                        <div className={styles.pdcaCount}>{data?.pdca?.planosEmAndamento || 0}</div>
                                        <div className={styles.pdcaLabel}>{t('pdca.statusProgress', 'Em Andamento')}</div>
                                    </div>
                                    <div className={`${styles.pdcaCard} ${styles.done}`}>
                                        <div className={styles.pdcaCount}>{data?.pdca?.planosConcluidos || 0}</div>
                                        <div className={styles.pdcaLabel}>{t('pdca.statusDone', 'Concluídos')}</div>
                                    </div>
                                    <div className={`${styles.pdcaCard} ${styles.pending}`}>
                                        <div className={styles.pdcaCount}>{data?.pdca?.acoesPendentes || 0}</div>
                                        <div className={styles.pdcaLabel}>{t('pdca.pendingActions', 'Ações Pendentes')}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Últimos Casos de Refugo - NCR como título */}
                            {data?.qualidade?.ultimosCasos && data.qualidade.ultimosCasos.length > 0 && (
                                <div className={styles.section}>
                                    <h2 className={styles.sectionTitle}>
                                        <AlertCircle size={20} />
                                        {t('pdca.recentCases', 'Últimos Casos de Refugo')}
                                    </h2>
                                    <div className={styles.casesGrid}>
                                        {data.qualidade.ultimosCasos.slice(0, 6).map((caso, idx) => (
                                            <div key={idx} className={styles.caseCard}>
                                                <div className={styles.caseHeader}>
                                                    <span className={styles.caseNcr}>
                                                        {caso.ncr || `#${idx + 1}`}
                                                    </span>
                                                    <span className={styles.caseCost}>{formatCurrency(caso.custo)}</span>
                                                </div>
                                                <div className={styles.caseDetails}>
                                                    <span className={styles.caseItem}>{caso.item} - {caso.descricao || '-'}</span>
                                                    <span>{t('pdca.responsible', 'Responsável')}: {caso.responsavel || '-'}</span>
                                                    <span>{formatDate(caso.data)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* New Plan Modal */}
                {showModal && (
                    <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
                        <div className={styles.modal} onClick={e => e.stopPropagation()}>
                            <h2 className={styles.modalTitle}>{t('pdca.newPlanTitle', 'Novo Plano de Ação')}</h2>
                            <div className={styles.formGroup}>
                                <label>{t('pdca.planTitle', 'Título do Plano')}</label>
                                <input
                                    type="text"
                                    value={titulo}
                                    onChange={e => setTitulo(e.target.value)}
                                    placeholder={t('pdca.planTitlePlaceholder', 'Ex: Reduzir refugo de válvulas...')}
                                    autoFocus
                                />
                            </div>
                            <div className={styles.modalActions}>
                                <button className={styles.btnSecondary} onClick={() => setShowModal(false)}>
                                    {t('common.cancel', 'Cancelar')}
                                </button>
                                <button
                                    className={styles.btnPrimary}
                                    onClick={handleCreatePlan}
                                    disabled={creating || !titulo.trim()}
                                >
                                    {creating ? t('common.creating', 'Criando...') : t('pdca.createPlan', 'Criar Plano')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
