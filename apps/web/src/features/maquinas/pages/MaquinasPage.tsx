// src/features/maquinas/pages/MaquinasPage.tsx
import React, { useState, useEffect, useMemo, FormEvent, ChangeEvent, MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import {
    getMaquinas,
    listarChamados,
    criarMaquina,
    deletarMaquina,
    renomearMaquina,
} from '../../../services/apiClient';
import toast from 'react-hot-toast';
import styles from './MaquinasPage.module.css';
import Modal from '../../../shared/components/Modal';
import PageHeader from '../../../shared/components/PageHeader';
import { FiPlus, FiMoreVertical, FiEdit2, FiTrash2 } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

// ---------- Types ----------
interface User {
    role?: string;
    email?: string;
}

export interface MaquinasPageProps {
    user?: User;
}

interface Maquina {
    id: string;
    nome: string;
    tag?: string;
}

interface MaquinaComStatus extends Maquina {
    statusDestaque: string | null;
}

interface Chamado {
    id: string;
    tipo?: string;
    maquina?: string;
}

// ---------- Helpers ----------
function getStoredUser(): User | null {
    try {
        return JSON.parse(localStorage.getItem('usuario') || 'null');
    } catch {
        return null;
    }
}

// ---------- Component ----------
const MaquinasPage = ({ user: userProp }: MaquinasPageProps) => {
    const { t } = useTranslation();

    // se vier pelo MainLayout, usa a prop; senão, cai no localStorage (compatibilidade)
    const user = userProp || getStoredUser();
    const role = (user?.role || '').toLowerCase();
    const isGestor = role === 'gestor' || role === 'admin';

    const [maquinas, setMaquinas] = useState<Maquina[]>([]);
    const [chamadosAtivos, setChamadosAtivos] = useState<Chamado[]>([]);
    const [loading, setLoading] = useState(true);

    // modal: criar
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [nomeNovaMaquina, setNomeNovaMaquina] = useState('');

    // menu/ação: editar/excluir
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [alvo, setAlvo] = useState<Maquina | null>(null);
    const [deleting, setDeleting] = useState(false);

    // modal: editar
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editNome, setEditNome] = useState('');
    const [editSyncTag, setEditSyncTag] = useState(true);
    const [savingEdit, setSavingEdit] = useState(false);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        (async () => {
            try {
                // 1) Máquinas
                const lista: Maquina[] = await getMaquinas();
                if (!alive) return;
                setMaquinas(lista);

                // 2) Chamados ativos
                const [abertos, emAndamento] = await Promise.all([
                    listarChamados({ status: 'Aberto', page: 1, pageSize: 200 }),
                    listarChamados({ status: 'Em Andamento', page: 1, pageSize: 200 }),
                ]);
                const itemsAbertos: Chamado[] = (abertos as { items?: Chamado[] }).items ?? abertos;
                const itemsAnd: Chamado[] = (emAndamento as { items?: Chamado[] }).items ?? emAndamento;
                const porId = new Map<string, Chamado>();
                [...itemsAbertos, ...itemsAnd].forEach((c) => porId.set(c.id, c));
                if (!alive) return;
                setChamadosAtivos([...porId.values()]);
            } catch (e) {
                console.error(e);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    const maquinasComStatus: MaquinaComStatus[] = useMemo(() => {
        const statusPorMaquina: Record<string, string> = {};
        const prioridade: Record<string, number> = { corretiva: 3, preventiva: 2, preditiva: 1 };

        chamadosAtivos.forEach((chamado) => {
            const tipo = chamado.tipo || 'corretiva';
            const nomeMaquina = chamado.maquina || '';
            if (
                !statusPorMaquina[nomeMaquina] ||
                prioridade[tipo] > prioridade[statusPorMaquina[nomeMaquina]]
            ) {
                statusPorMaquina[nomeMaquina] = tipo;
            }
        });

        return maquinas
            .map((m) => ({ ...m, statusDestaque: statusPorMaquina[m.nome] || null }))
            .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
    }, [maquinas, chamadosAtivos]);

    const getStatusClass = (status: string | null): string => {
        if (status === 'corretiva') return styles.statusCorretiva;
        if (status === 'preventiva') return styles.statusPreventiva;
        if (status === 'preditiva') return styles.statusPreditiva;
        return '';
    };

    const toggleMenu = (id: string) => {
        setOpenMenuId((prev) => (prev === id ? null : id));
    };

    const handleCriarMaquina = async (e: FormEvent) => {
        e.preventDefault();
        const nome = nomeNovaMaquina.trim();
        if (!nome) {
            toast.error(t('maquinas.toasts.emptyName'));
            return;
        }

        try {
            const nova: Maquina = await criarMaquina(
                { nome },
                { role: user?.role, email: user?.email }
            );
            setMaquinas((prev) =>
                [...prev, nova].sort((a, b) =>
                    String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
                )
            );
            toast.success(t('maquinas.toasts.created', { name: nova.nome }));
            setIsModalOpen(false);
            setNomeNovaMaquina('');
        } catch (err) {
            const status = (err as { status?: number })?.status;
            let msg = t('maquinas.toasts.createError') || 'Erro ao criar.';
            if (status === 409)
                msg = t('maquinas.toasts.createDuplicated') || 'Já existe uma máquina com esse nome.';
            toast.error(msg);
            console.error(err);
        }
    };

    const confirmarExclusao = (maquina: Maquina, e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setAlvo(maquina);
        setIsDeleteOpen(true);
        setOpenMenuId(null);
    };

    const excluir = async () => {
        if (!alvo) return;
        setDeleting(true);

        try {
            await deletarMaquina(alvo.id, { role: user?.role, email: user?.email });
            setMaquinas((prev) => prev.filter((m) => m.id !== alvo.id));
            toast.success(t('maquinas.toasts.deleted', { name: alvo.nome }));
            setIsDeleteOpen(false);
            setAlvo(null);
        } catch (err) {
            toast.error(t('maquinas.toasts.deleteError') || 'Erro ao excluir.');
            console.error(err);
        } finally {
            setDeleting(false);
        }
    };

    const abrirEditar = (maquina: Maquina, e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setAlvo(maquina);
        setEditNome(maquina.nome);
        setEditSyncTag(true);
        setIsEditOpen(true);
        setOpenMenuId(null);
    };

    const salvarEdicao = async (e: FormEvent) => {
        e.preventDefault();
        if (!alvo) return;

        const novoNome = editNome.trim();
        if (!novoNome) {
            toast.error(t('maquinas.toasts.emptyName'));
            return;
        }

        setSavingEdit(true);
        try {
            const atualizado: Maquina = await renomearMaquina(
                alvo.id,
                { nome: novoNome, syncTag: editSyncTag },
                { role: user?.role, email: user?.email }
            );
            setMaquinas((prev) => {
                const next = prev.map((m) =>
                    m.id === alvo.id ? { ...m, ...atualizado } : m
                );
                return next.sort((a, b) =>
                    String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
                );
            });

            toast.success(t('maquinas.toasts.renamed', { name: atualizado.nome }));
            setIsEditOpen(false);
            setAlvo(null);
        } catch (err) {
            const status = (err as { status?: number })?.status;
            let msg = t('maquinas.toasts.renameError') || 'Erro ao renomear.';
            if (status === 409)
                msg = t('maquinas.toasts.renameDuplicated') || 'Já existe uma máquina com esse nome/tag.';
            toast.error(msg);
            console.error(err);
        } finally {
            setSavingEdit(false);
        }
    };

    return (
        <>
            <PageHeader
                title={t('maquinas.title')}
                subtitle={t('maquinas.subtitle', t('maquinas.cardHint'))}
            />

            <div className={styles.contentArea}>

                {loading ? (
                    <p className={styles.loadingText}>{t('maquinas.loading')}</p>
                ) : (
                    <>
                        {/* Legenda em card branco */}
                        <div className={styles.legendContainer}>
                            <div className={styles.legendItem}>
                                <div className={`${styles.legendColorBox} ${styles.statusCorretiva}`} />
                                <span>{t('maquinas.legend.corretiva')}</span>
                            </div>
                            <div className={styles.legendItem}>
                                <div className={`${styles.legendColorBox} ${styles.statusPreventiva}`} />
                                <span>{t('maquinas.legend.preventiva')}</span>
                            </div>
                            <div className={styles.legendItem}>
                                <div className={`${styles.legendColorBox} ${styles.statusPreditiva}`} />
                                <span>{t('maquinas.legend.preditiva')}</span>
                            </div>
                        </div>

                        {/* Grid de máquinas */}
                        <div className={styles.grid}>
                            {maquinasComStatus.map((maquina) => (
                                <div
                                    key={maquina.id}
                                    className={`${styles.card} ${getStatusClass(maquina.statusDestaque)}`}
                                >
                                    {/* botão 3 pontinhos (apenas gestor/admin) */}
                                    {isGestor && (
                                        <button
                                            className={styles.menuButton}
                                            aria-label={t('maquinas.actions')}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                toggleMenu(maquina.id);
                                            }}
                                            title={t('maquinas.actions')}
                                        >
                                            <FiMoreVertical />
                                        </button>
                                    )}

                                    {/* dropdown */}
                                    {isGestor && openMenuId === maquina.id && (
                                        <div
                                            className={styles.menu}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <button
                                                className={styles.menuItem}
                                                onClick={(e) => abrirEditar(maquina, e)}
                                            >
                                                <FiEdit2 /> {t('common.edit')}
                                            </button>
                                            <button
                                                className={`${styles.menuItem} ${styles.danger}`}
                                                onClick={(e) => confirmarExclusao(maquina, e)}
                                            >
                                                <FiTrash2 /> {t('common.delete')}
                                            </button>
                                        </div>
                                    )}

                                    {/* conteúdo clicável do card */}
                                    <Link
                                        to={`/maquinas/${maquina.id}`}
                                        className={styles.cardLink}
                                    >
                                        <h2>{maquina.nome}</h2>
                                        <p>{t('maquinas.cardHint')}</p>
                                    </Link>
                                </div>
                            ))}

                            {/* CARD DE ADICIONAR */}
                            {isGestor && (
                                <div
                                    className={`${styles.card} ${styles.addCard}`}
                                    onClick={() => setIsModalOpen(true)}
                                    role="button"
                                    aria-label={t('maquinas.modal.title')}
                                    title={t('maquinas.modal.title')}
                                >
                                    <FiPlus className={styles.addIcon} />
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* modal: criar máquina */}
                <Modal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    title={t('maquinas.modal.title')}
                >
                    <form onSubmit={handleCriarMaquina}>
                        <div className={styles.modalField}>
                            <label htmlFor="nome-maquina" className={styles.modalLabel}>
                                {t('maquinas.modal.nameLabel')}
                            </label>
                            <input
                                id="nome-maquina"
                                type="text"
                                value={nomeNovaMaquina}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setNomeNovaMaquina(e.target.value)}
                                className={styles.modalInput}
                                required
                            />
                        </div>
                        <button type="submit" className={styles.modalPrimaryButton}>
                            {t('maquinas.modal.save')}
                        </button>
                    </form>
                </Modal>

                {/* modal: editar machine */}
                <Modal
                    isOpen={isEditOpen}
                    onClose={() => setIsEditOpen(false)}
                    title={t('maquinas.edit.title', { name: alvo?.nome ?? '' })}
                >
                    <form onSubmit={salvarEdicao}>
                        <div className={styles.modalField}>
                            <label htmlFor="edit-nome" className={styles.modalLabel}>
                                {t('maquinas.edit.label')}
                            </label>
                            <input
                                id="edit-nome"
                                type="text"
                                value={editNome}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setEditNome(e.target.value)}
                                className={styles.modalInput}
                                required
                            />
                        </div>

                        <label className={styles.modalCheckboxRow}>
                            <input
                                type="checkbox"
                                checked={editSyncTag}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setEditSyncTag(e.target.checked)}
                            />
                            {t('maquinas.edit.syncTag')}
                        </label>

                        <div className={styles.modalActions}>
                            <button
                                type="button"
                                className={styles.modalSecondaryButton}
                                onClick={() => setIsEditOpen(false)}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={savingEdit}
                                className={styles.modalPrimaryButton}
                            >
                                {savingEdit ? t('common.saving') : t('common.save')}
                            </button>
                        </div>
                    </form>
                </Modal>

                {/* modal: confirmar exclusão */}
                <Modal
                    isOpen={isDeleteOpen}
                    onClose={() => setIsDeleteOpen(false)}
                    title={t('maquinas.confirmDelete.title', { name: alvo?.nome ?? '' })}
                >
                    <p className={styles.modalText}>
                        {t('maquinas.confirmDelete.text')}
                    </p>
                    <div className={styles.modalActions}>
                        <button
                            className={styles.modalSecondaryButton}
                            onClick={() => setIsDeleteOpen(false)}
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            className={styles.modalDangerButton}
                            onClick={excluir}
                            disabled={deleting}
                        >
                            {t('common.delete')}
                        </button>
                    </div>
                </Modal>
            </div>
        </>
    );
};

export default MaquinasPage;
