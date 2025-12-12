// src/features/usuarios/pages/GerirUtilizadoresPage.tsx
import React, { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import styles from './GerirUtilizadoresPage.module.css';
import Modal from '../../../shared/components/Modal';
import { FiPlus, FiEdit, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
    listarUsuarios,
    criarUsuario,
    atualizarUsuario,
    excluirUsuario
} from '../../../services/apiClient';

// ---------- Types ----------
interface User {
    role?: string;
    email?: string;
}

export interface GerirUtilizadoresPageProps {
    user: User;
}

interface UserRow {
    id: string;
    nome: string;
    usuario?: string;
    email?: string;
    role?: string;
    funcao?: string;
}

type RoleFilter = 'all' | 'gestor' | 'manutentor' | 'operador';

// ---------- Helpers ----------
const FUNCAO_MAP: Record<string, string> = {
    gestor: 'Gestor',
    manutentor: 'Manutentor',
    operador: 'Operador',
};

// ---------- Component ----------
const GerirUtilizadoresPage = ({ user }: GerirUtilizadoresPageProps) => {
    const { t } = useTranslation();

    const [utilizadores, setUtilizadores] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [roleFiltro, setRoleFiltro] = useState<RoleFilter>('all');

    // modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modoEdicao, setModoEdicao] = useState(false);
    const [usuarioEditandoId, setUsuarioEditandoId] = useState<string | null>(null);

    // form
    const [nome, setNome] = useState('');
    const [usuario, setUsuario] = useState('');
    const [senha, setSenha] = useState('');
    const [role, setRole] = useState('operador');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const lista: UserRow[] = await listarUsuarios({ role: roleFiltro !== 'all' ? roleFiltro : undefined });
                if (!alive) return;
                setUtilizadores(
                    lista.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt'))
                );
            } catch (e) {
                console.error('Erro ao listar utilizadores:', e);
                toast.error(t('users.toasts.listError'));
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [roleFiltro, t]);

    const handleSalvarUtilizador = async (e: FormEvent) => {
        e.preventDefault();

        const nomeCompleto = nome.trim();
        if (!nomeCompleto) {
            toast.error(t('users.toasts.nameRequired'));
            return;
        }

        const nomeUsuario = (usuario || '').trim() || nomeCompleto.toLowerCase().replace(/\s+/g, '.');
        const emailGerado = `${nomeUsuario}@manutencao.local`;

        const funcao = FUNCAO_MAP[role] ?? 'Operador';

        setIsSaving(true);
        try {
            if (modoEdicao && usuarioEditandoId) {
                const payload: Partial<UserRow> & { role: string; funcao: string; usuario: string } = {
                    nome: nomeCompleto,
                    usuario: nomeUsuario,
                    role,
                    funcao,
                };
                const updated: UserRow = await atualizarUsuario(usuarioEditandoId, payload, {
                    role: user?.role,
                    email: user?.email
                });
                setUtilizadores((prev) =>
                    prev
                        .map((u) => (u.id === usuarioEditandoId ? { ...u, ...updated } : u))
                        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
                );
                toast.success(t('users.toasts.updated'));
            } else {
                const payload: {
                    nome: string;
                    usuario: string;
                    email: string;
                    role: string;
                    funcao: string;
                    senha?: string;
                } = {
                    nome: nomeCompleto,
                    usuario: nomeUsuario,
                    email: emailGerado,
                    role,
                    funcao,
                };
                if (senha?.trim()?.length >= 6) {
                    payload.senha = senha.trim();
                }
                const saved: UserRow = await criarUsuario(payload, {
                    role: user?.role,
                    email: user?.email
                });
                setUtilizadores((prev) => {
                    const next =
                        roleFiltro === 'all' || saved.role === roleFiltro
                            ? [...prev, saved]
                            : prev;
                    return next.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
                });
                toast.success(t('users.toasts.created', { name: nomeCompleto }));
            }

            // reset form
            setIsSaving(false);
            setNome('');
            setUsuario('');
            setSenha('');
            setRole('operador');
            setModoEdicao(false);
            setUsuarioEditandoId(null);
            setIsModalOpen(false);
        } catch (error) {
            console.error('Falha ao salvar usuário:', error);
            toast.error(t('users.toasts.saveError'));
            setIsSaving(false);
        }
    };

    const abrirModalCriacao = () => {
        setIsModalOpen(true);
        setModoEdicao(false);
        setUsuarioEditandoId(null);
        setNome('');
        setUsuario('');
        setSenha('');
        setRole('operador');
    };

    const abrirModalEdicao = (userRow: UserRow) => {
        setNome(userRow.nome || '');
        setUsuario(userRow.usuario || '');
        setRole(userRow.role || 'operador');
        setModoEdicao(true);
        setUsuarioEditandoId(userRow.id);
        setSenha('');
        setIsModalOpen(true);
    };

    const handleExcluirUtilizador = async (uid: string, nomeAlvo: string) => {
        if (!window.confirm(t('users.confirm.delete', { name: nomeAlvo }))) return;
        try {
            await excluirUsuario(uid, { role: user?.role, email: user?.email });
            setUtilizadores((prev) => prev.filter((u) => u.id !== uid));
            toast.success(t('users.toasts.deleted'));
        } catch (error) {
            console.error('Erro ao excluir utilizador:', error);
            toast.error((error as Error).message || t('users.toasts.deleteError'));
        }
    };

    return (
        <>
            {/* Header padrão (cardzinho) */}
            <header className={styles.pageHeader}>
                <div className={styles.pageHeaderLeft}>
                    <h1 className={styles.pageTitle}>{t('users.title')}</h1>
                    <p className={styles.subtitle}>
                        {t(
                            'users.subtitle',
                            'Gerencie os usuários do sistema, seus papéis e credenciais internas.'
                        )}
                    </p>
                </div>

                <button className={styles.button} onClick={abrirModalCriacao}>
                    <FiPlus />
                    {t('users.actions.create')}
                </button>
            </header>

            {/* Card principal de conteúdo */}
            <div className={styles.userListContainer}>
                {/* Toolbar de filtro dentro do card */}
                <div className={styles.userListToolbar}>
                    <div className={styles.filterGroup}>
                        <label htmlFor="roleFiltro" className={styles.filterLabel}>
                            {t('users.form.role')}
                        </label>
                        <select
                            id="roleFiltro"
                            className={`${styles.select} ${styles.filterSelect}`}
                            value={roleFiltro}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => setRoleFiltro(e.target.value as RoleFilter)}
                        >
                            <option value="all">{t('users.roles.all')}</option>
                            <option value="gestor">{t('users.roles.manager')}</option>
                            <option value="manutentor">{t('users.roles.maintainer')}</option>
                            <option value="operador">{t('users.roles.operator')}</option>
                        </select>
                    </div>
                </div>

                {loading ? (
                    <p>{t('users.loading')}</p>
                ) : (
                    <>
                        <div className={styles.userListHeader}>
                            <span>{t('users.table.fullName')}</span>
                            <span>{t('users.table.username')}</span>
                            <span>{t('users.table.function')}</span>
                            <span style={{ textAlign: 'right' }}>
                                {t('users.table.actions')}
                            </span>
                        </div>

                        <ul className={styles.userList}>
                            {utilizadores.map((userRow) => (
                                <li key={userRow.id} className={styles.userItem}>
                                    <strong>{userRow.nome}</strong>
                                    <span>{userRow.usuario}</span>
                                    <span>{userRow.funcao}</span>
                                    <div className={styles.actions}>
                                        <button
                                            className={styles.actionButton}
                                            title={t('users.actions.edit')}
                                            onClick={() => abrirModalEdicao(userRow)}
                                        >
                                            <FiEdit />
                                        </button>
                                        <button
                                            className={`${styles.actionButton} ${styles.deleteButton}`}
                                            title={t('users.actions.delete')}
                                            onClick={() =>
                                                handleExcluirUtilizador(userRow.id, userRow.nome)
                                            }
                                        >
                                            <FiTrash2 />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </div>

            {/* Modal de criação/edição */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={
                    modoEdicao
                        ? t('users.modal.editTitle')
                        : t('users.modal.createTitle')
                }
            >
                <form onSubmit={handleSalvarUtilizador}>
                    <div className={styles.formGroup}>
                        <label htmlFor="nome">{t('users.form.fullName')}</label>
                        <input
                            id="nome"
                            type="text"
                            className={styles.input}
                            value={nome}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setNome(e.target.value)}
                            required
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="usuario">
                            {t(
                                'users.form.usernameOptional',
                                'Nome de usuário (login) – opcional'
                            )}
                        </label>
                        <input
                            id="usuario"
                            type="text"
                            className={styles.input}
                            value={usuario}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setUsuario(e.target.value)}
                            placeholder={t(
                                'users.form.usernamePlaceholder',
                                'ex: gabriel.palazini'
                            )}
                        />
                    </div>

                    {!modoEdicao && (
                        <div className={styles.formGroup}>
                            <label htmlFor="senha">{t('users.form.tempPassword')}</label>
                            <input
                                id="senha"
                                type="password"
                                className={styles.input}
                                value={senha}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setSenha(e.target.value)}
                                minLength={6}
                            />
                        </div>
                    )}

                    <div className={styles.formGroup}>
                        <label htmlFor="role">{t('users.form.role')}</label>
                        <select
                            id="role"
                            className={styles.select}
                            value={role}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => setRole(e.target.value)}
                        >
                            <option value="operador">{t('users.roles.operator')}</option>
                            <option value="manutentor">{t('users.roles.maintainer')}</option>
                            <option value="gestor">{t('users.roles.manager')}</option>
                        </select>
                    </div>

                    <button type="submit" className={styles.button} disabled={isSaving}>
                        {isSaving
                            ? t('users.form.saving')
                            : modoEdicao
                                ? t('users.form.saveChanges')
                                : t('users.form.createUser')}
                    </button>
                </form>
            </Modal>
        </>
    );
};

export default GerirUtilizadoresPage;
