// src/components/OperatorDashboard.tsx
import { useEffect, useMemo, useState, useCallback, useRef, FormEvent, ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import styles from './OperatorDashboard.module.css';
import { FiPlusCircle, FiTool, FiAlertTriangle } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { statusKey } from '../i18n/format';
import type { User } from '../App';

import {
    listarMaquinas,
    listarChamados,
    listarChamadosPorMaquina,
    criarChamado,
} from '../services/apiClient';
import useSSE from '../hooks/useSSE';

interface Maquina {
    id: string;
    nome?: string;
    tag?: string;
}

interface Chamado {
    id: string;
    maquina?: string;
    descricao?: string;
    status?: string;
    criado_em?: string;
    dataAbertura?: string;
}

interface ChamadoAtivo {
    id: string;
    descricao?: string;
    status: string;
    criado_em?: string;
    maquina?: string;
}

type StatusBadgeMap = Record<string, string>;

const STATUS_BADGE: StatusBadgeMap = {
    Aberto: 'aberto',
    'Em Andamento': 'emandamento',
    'Concluido': 'concluido',
};

// Prioridade de exibição: Aberto > Em Andamento > demais
const STATUS_PRIORITY: Record<string, number> = {
    aberto: 0,
    em_andamento: 1,
};

function statusPriority(status: string | undefined): number {
    if (!status) return 2;
    const s = status.toLowerCase();
    if (s.includes('abert')) return STATUS_PRIORITY['aberto'];
    if (s.includes('andamento')) return STATUS_PRIORITY['em_andamento'];
    return 2; // concluído, cancelado, etc.
}

function sortChamados(arr: Chamado[]): Chamado[] {
    return [...arr].sort((a, b) => {
        const pa = statusPriority(a.status);
        const pb = statusPriority(b.status);
        if (pa !== pb) return pa - pb;
        // Dentro do mesmo status: mais recente primeiro
        const da = new Date(String(a.criado_em || a.dataAbertura || 0).replace(/ /g, 'T')).getTime();
        const db = new Date(String(b.criado_em || b.dataAbertura || 0).replace(/ /g, 'T')).getTime();
        return db - da;
    });
}

function normalizeStatusKey(status: string | undefined): 'aberto' | 'emandamento' | 'concluido' | 'outro' {
    if (!status) return 'outro';
    const s = status.toLowerCase();
    if (s.includes('concluid')) return 'concluido';
    if (s.includes('andamento')) return 'emandamento';
    if (s.includes('abert')) return 'aberto';
    return 'outro';
}

interface OperatorDashboardProps {
    user: User;
}

export default function OperatorDashboard({ user }: OperatorDashboardProps) {
    const { t, i18n } = useTranslation();

    const [maquinaId, setMaquinaId] = useState('');
    const [descricao, setDescricao] = useState('');
    const [formLoading, setFormLoading] = useState(false);

    const [maquinas, setMaquinas] = useState<Maquina[]>([]);
    const [activeChamados, setActiveChamados] = useState<Chamado[]>([]);
    const [completedChamados, setCompletedChamados] = useState<Chamado[]>([]);
    const [listLoading, setListLoading] = useState(true);

    // Paginação
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const isLoadingChamados = useRef(false);

    // Estado do modal de alerta de duplicatas
    const [showAlertaModal, setShowAlertaModal] = useState(false);
    const [pendingMachineId, setPendingMachineId] = useState('');
    const [checkingDuplicates, setCheckingDuplicates] = useState(false);
    const [chamadosAbertos, setChamadosAbertos] = useState<ChamadoAtivo[]>([]);

    const dtFmt = useMemo(
        () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }),
        [i18n.language]
    );

    const operadorEmail = useMemo(() => String(user?.email || '').toLowerCase(), [user?.email]);

    const formatTS = (val: string | undefined): string => {
        if (!val) return '...';
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(val)) {
            const d = new Date(val.replace(/ /g, 'T'));
            return isNaN(d.getTime()) ? val : dtFmt.format(d);
        }
        const d = new Date(val);
        return isNaN(d.getTime()) ? '...' : dtFmt.format(d);
    };

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const itens = await listarMaquinas({ escopo: 'manutencao' }).catch(() => []);
                if (!alive) return;
                const ordenadas = (itens || [])
                    .filter((m: Maquina) => m?.id && (m?.nome || m?.tag))
                    .sort((a: Maquina, b: Maquina) =>
                        String(a.nome || '').localeCompare(String(b.nome || ''), 'pt')
                    );
                setMaquinas(ordenadas);
            } catch (e) {
                console.error('Falha ao carregar máquinas:', e);
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    const carregarChamados = useCallback(async (targetPage = 1) => {
        if (isLoadingChamados.current) return;
        isLoadingChamados.current = true;
        try {
            const isLoadMore = targetPage > 1;
            if (isLoadMore) {
                setLoadingMore(true);
            } else {
                setListLoading(true);
            }

            const pageSize = 20;

            if (!isLoadMore) {
                // Se não é Load More, carrega os ativos (Aberto e Em Andamento)
                const [abertosResp, emAndamentoResp] = await Promise.all([
                    listarChamados({ tipo: 'corretiva', status: 'Aberto', pageSize: 100 }).catch(() => ({ items: [] })),
                    listarChamados({ tipo: 'corretiva', status: 'Em Andamento', pageSize: 100 }).catch(() => ({ items: [] }))
                ]);

                const abertos = Array.isArray(abertosResp?.items) ? abertosResp.items : [];
                const emAndamento = Array.isArray(emAndamentoResp?.items) ? emAndamentoResp.items : [];

                setActiveChamados(sortChamados([...abertos, ...emAndamento]));
            }

            // Carrega os concluídos paginados
            const concluidosResp = await listarChamados({
                tipo: 'corretiva',
                status: 'Concluido',
                page: targetPage,
                pageSize
            }).catch(() => null);

            let novosConcluidos: Chamado[] = [];
            if (!concluidosResp) {
                setHasMore(false);
            } else {
                novosConcluidos = Array.isArray(concluidosResp.items) ? concluidosResp.items : [];
                setHasMore(novosConcluidos.length >= pageSize);
            }

            setCompletedChamados(prev => {
                const combined = isLoadMore ? [...prev, ...novosConcluidos] : novosConcluidos;
                // Remove duplicatas
                const ids = new Set();
                return combined.filter(c => {
                    if (ids.has(c.id)) return false;
                    ids.add(c.id);
                    return true;
                });
            });

            setPage(targetPage);
        } catch (e) {
            console.error('Erro ao carregar chamados:', e);
        } finally {
            setListLoading(false);
            setLoadingMore(false);
            isLoadingChamados.current = false;
        }
    }, []);

    useEffect(() => {
        if (!operadorEmail) return;
        carregarChamados(1);
    }, [operadorEmail, carregarChamados]);

    useSSE('chamados', () => carregarChamados(1));

    /**
     * Ao selecionar uma máquina, verifica se há chamados corretivos ativos.
     * Se houver, exibe o modal de alerta antes de prosseguir.
     */
    const handleMachineChange = useCallback(async (e: ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        if (!id) {
            setMaquinaId('');
            return;
        }

        setCheckingDuplicates(true);
        try {
            const todosRaw = await listarChamadosPorMaquina(id, { tipo: 'corretiva' });
            const todos: ChamadoAtivo[] = todosRaw.map((c) => ({
                id: c.id,
                descricao: c.descricao,
                status: c.status ?? 'Aberto',
                criado_em: (c as any).criado_em,
                maquina: c.maquina,
            }));

            // Filtra apenas os ativos (a API já garante tipo=corretiva)
            const ativos = todos.filter((c) => {
                const sk = normalizeStatusKey(c.status);
                return sk === 'aberto' || sk === 'emandamento';
            });

            if (ativos.length > 0) {
                setChamadosAbertos(ativos);
                setPendingMachineId(id);
                setShowAlertaModal(true);
            } else {
                setMaquinaId(id);
            }
        } catch (err) {
            console.warn('[OperatorDashboard] Erro ao verificar duplicatas:', err);
            setMaquinaId(id);
        } finally {
            setCheckingDuplicates(false);
        }
    }, []);

    const handleModalConfirm = useCallback(() => {
        setMaquinaId(pendingMachineId);
        setShowAlertaModal(false);
        setPendingMachineId('');
        setChamadosAbertos([]);
    }, [pendingMachineId]);

    const handleModalCancel = useCallback(() => {
        setShowAlertaModal(false);
        setPendingMachineId('');
        setChamadosAbertos([]);
    }, []);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!maquinaId || !descricao.trim()) {
            toast.error(t('operatorDashboard.form.required'));
            return;
        }
        setFormLoading(true);
        try {
            const maquina = maquinas.find((m) => m.id === maquinaId);
            await criarChamado(
                {
                    tipo: 'corretiva',
                    maquinaId,
                    maquinaNome: maquina?.nome || undefined,
                    descricao,
                    criadoPorEmail: operadorEmail,
                    status: 'Aberto',
                },
                { role: 'operador', email: operadorEmail }
            );
            toast.success(
                t('operatorDashboard.form.opened', { machine: maquina?.nome || t('common.machine') })
            );
            setMaquinaId('');
            setDescricao('');
            carregarChamados(1); // Ao abrir um novo chamado, reseta para a página 1
        } catch (error) {
            console.error('Erro ao criar chamado: ', error);
            toast.error(t('operatorDashboard.form.error'));
        } finally {
            setFormLoading(false);
        }
    };

    return (
        <div className={styles.dashboard}>
            {/* Modal de alerta: chamados corretivos já abertos */}
            {showAlertaModal && (
                <div
                    className={styles.backdrop}
                    onClick={(e) => e.target === e.currentTarget && handleModalCancel()}
                >
                    <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="modal-titulo-op">
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle} id="modal-titulo-op">
                                <FiAlertTriangle />
                                {t('operatorDashboard.modal.title')}
                            </h2>
                            <p className={styles.modalSubtitle}>
                                {chamadosAbertos.length === 1
                                    ? t('operatorDashboard.modal.subtitleOne')
                                    : t('operatorDashboard.modal.subtitleMany', { count: chamadosAbertos.length })}{' '}
                                {t('operatorDashboard.modal.question')}
                            </p>
                        </div>

                        <div className={styles.modalChamadosList}>
                            {chamadosAbertos.map((c) => {
                                const sk = normalizeStatusKey(c.status);
                                const badgeClass =
                                    sk === 'emandamento'
                                        ? styles.modalStatusEmAndamento
                                        : styles.modalStatusAberto;
                                const statusLabel = sk === 'emandamento' ? t('operatorDashboard.modal.inProgress') : t('operatorDashboard.modal.open');
                                return (
                                    <div key={c.id} className={styles.modalChamadoItem}>
                                        <div className={styles.modalChamadoInfo}>
                                            <div
                                                className={styles.modalChamadoDescricao}
                                                title={c.descricao || ''}
                                            >
                                                {c.descricao
                                                    ? c.descricao.length > 80
                                                        ? c.descricao.slice(0, 80) + '…'
                                                        : c.descricao
                                                    : t('operatorDashboard.modal.noDescription')}
                                            </div>
                                            {c.criado_em && (
                                                <div className={styles.modalChamadoMeta}>
                                                    {t('operatorDashboard.modal.openedAt', { date: c.criado_em })}
                                                </div>
                                            )}
                                        </div>
                                        <span className={`${styles.modalStatusBadge} ${badgeClass}`}>
                                            {statusLabel}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className={styles.modalFooter}>
                            <button type="button" className={styles.cancelBtn} onClick={handleModalCancel}>
                                {t('operatorDashboard.modal.cancel')}
                            </button>
                            <button type="button" className={styles.confirmBtn} onClick={handleModalConfirm}>
                                {t('operatorDashboard.modal.proceed')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Card: abrir chamado */}
            <div className={styles.card}>
                <h2 className={styles.cardTitle}>
                    <FiPlusCircle className={styles.titleIcon} />
                    {t('operatorDashboard.form.title')}
                </h2>

                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label htmlFor="maquina-op">{t('operatorDashboard.form.selectMachine')}</label>
                        <select
                            id="maquina-op"
                            value={maquinaId}
                            onChange={handleMachineChange}
                            className={styles.select}
                            required
                            disabled={checkingDuplicates}
                        >
                            <option value="" disabled>
                                {checkingDuplicates
                                    ? t('common.loading')
                                    : t('operatorDashboard.form.choosePlaceholder')}
                            </option>
                            {maquinas.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.nome || m.tag || m.id}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="descricao-op">{t('operatorDashboard.form.problem')}</label>
                        <textarea
                            id="descricao-op"
                            value={descricao}
                            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDescricao(e.target.value)}
                            className={styles.textarea}
                            placeholder={t('operatorDashboard.form.problemPlaceholder')}
                            rows={4}
                            required
                        />
                    </div>

                    <button type="submit" className={styles.submitButton} disabled={formLoading || checkingDuplicates}>
                        {formLoading ? t('operatorDashboard.form.sending') : t('operatorDashboard.form.open')}
                    </button>
                </form>
            </div>

            {/* Card: todos os chamados corretivos */}
            <div className={styles.card}>
                <h2 className={styles.cardTitle}>
                    <FiTool className={styles.titleIcon} />
                    {t('operatorDashboard.list.title')}
                </h2>

                {listLoading ? (
                    <div className={styles.loadingState}>{t('operatorDashboard.list.loading')}</div>
                ) : activeChamados.length === 0 && completedChamados.length === 0 ? (
                    <div className={styles.emptyState}>{t('operatorDashboard.list.empty')}</div>
                ) : (
                    <div className={styles.historyContainer}>
                        <ul className={styles.chamadoList}>
                            {[...activeChamados, ...completedChamados].map((chamado) => (
                                <Link
                                    to={`/maquinas/chamado/${chamado.id}`}
                                    key={chamado.id}
                                    className={styles.chamadoLink}
                                >
                                    <li className={styles.chamadoItem}>
                                        <div className={styles.chamadoInfo}>
                                            <strong>
                                                {t('operatorDashboard.list.machine', { name: chamado.maquina })}
                                            </strong>
                                            <small>
                                                {t('operatorDashboard.list.openedAt', {
                                                    date: formatTS(chamado.criado_em || chamado.dataAbertura),
                                                })}
                                            </small>
                                            <div className={styles.descriptionPreview}>{chamado.descricao}</div>
                                        </div>
                                        <div
                                            className={`${styles.statusBadge} ${styles[normalizeStatusKey(chamado.status)] || ''}`}
                                        >
                                            {chamado.status}
                                        </div>
                                    </li>
                                </Link>
                            ))}
                        </ul>
                        {/* Botão de carregar mais (paginação) */}
                        {hasMore && completedChamados.length > 0 && !listLoading && (
                            <button
                                className={styles.loadMoreBtn}
                                onClick={() => carregarChamados(page + 1)}
                                disabled={loadingMore}
                            >
                                {loadingMore ? t('common.loading', 'Carregando...') : t('common.loadMore', 'Carregar mais')}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
