// src/features/usuarios/pages/GerirUtilizadoresPage.tsx
import React, { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import styles from './GerirUtilizadoresPage.module.css';
import Modal from '../../../shared/components/Modal';
import { Input, Select, Button } from '../../../shared/components';
import { FiPlus, FiEdit, FiTrash2, FiBarChart2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Skeleton from '@mui/material/Skeleton';
import {
    listarUsuarios,
    criarUsuario,
    atualizarUsuario,
    excluirUsuario,
    obterEstatisticasUsuario,
    EstatisticasUsuario,
    listarRoles,
    Role
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
    matricula?: string;
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
    const [matricula, setMatricula] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // stats modal
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [statsData, setStatsData] = useState<EstatisticasUsuario | null>(null);
    const [loadingStats, setLoadingStats] = useState(false);

    // roles list
    const [roles, setRoles] = useState<Role[]>([]);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const auth = { email: user?.email, role: user?.role };
                const [lista, rolesList] = await Promise.all([
                    listarUsuarios({ role: roleFiltro !== 'all' ? roleFiltro : undefined }),
                    listarRoles(auth)
                ]);
                if (!alive) return;
                setUtilizadores(
                    (lista as UserRow[]).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt'))
                );
                setRoles(rolesList);
            } catch (e) {
                console.error('Erro ao listar utilizadores:', e);
                toast.error(t('users.toasts.listError'));
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [roleFiltro, t, user?.email, user?.role]);

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
                const payload: Partial<UserRow> & { role: string; funcao: string; usuario: string; matricula?: string } = {
                    nome: nomeCompleto,
                    usuario: nomeUsuario,
                    role,
                    funcao,
                };
                // Adiciona matrícula apenas para operadores
                if (role === 'operador') {
                    payload.matricula = matricula.trim() || undefined;
                }
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
                    matricula?: string;
                } = {
                    nome: nomeCompleto,
                    usuario: nomeUsuario,
                    email: emailGerado,
                    role,
                    funcao,
                };
                // Adiciona matrícula apenas para operadores
                if (role === 'operador' && matricula.trim()) {
                    payload.matricula = matricula.trim();
                }
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
            setMatricula('');
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
        setMatricula('');
    };

    const abrirModalEdicao = (userRow: UserRow) => {
        setNome(userRow.nome || '');
        setUsuario(userRow.usuario || '');
        setRole(userRow.role || 'operador');
        setMatricula(userRow.matricula || '');
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

    const handleVerEstatisticas = async (userRow: UserRow) => {
        if (userRow.role === 'gestor') return; // Gestor não tem estatísticas

        setLoadingStats(true);
        setIsStatsModalOpen(true);
        setStatsData(null);

        try {
            const data = await obterEstatisticasUsuario(userRow.id, { role: user?.role, email: user?.email });
            setStatsData(data);
        } catch (error) {
            console.error('Erro ao obter estatísticas:', error);
            toast.error(t('users.toasts.statsError', 'Erro ao carregar estatísticas'));
        } finally {
            setLoadingStats(false);
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

                <Button size="sm" onClick={abrirModalCriacao}>
                    <FiPlus />
                    {t('users.actions.create')}
                </Button>
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
                    <>
                        {/* Skeleton do header da tabela */}
                        <div className={styles.userListHeader}>
                            <Skeleton variant="text" width={100} height={20} />
                            <Skeleton variant="text" width={100} height={20} />
                            <Skeleton variant="text" width={60} height={20} />
                            <Skeleton variant="text" width={80} height={20} />
                            <Skeleton variant="text" width={60} height={20} style={{ marginLeft: 'auto' }} />
                        </div>

                        {/* Skeleton da lista de usuários */}
                        <ul className={styles.userList} style={{ padding: 0, margin: 0 }}>
                            {[1, 2, 3, 4, 5].map((i) => (
                                <li key={i} className={styles.userItem}>
                                    <Skeleton variant="text" width="40%" height={24} />
                                    <Skeleton variant="text" width="25%" height={20} />
                                    <Skeleton variant="rectangular" width={50} height={24} sx={{ borderRadius: 1 }} />
                                    <Skeleton variant="rectangular" width={80} height={24} sx={{ borderRadius: 2 }} />
                                    <div className={styles.actions}>
                                        <Skeleton variant="circular" width={32} height={32} />
                                        <Skeleton variant="circular" width={32} height={32} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </>
                ) : (
                    <>
                        <div className={styles.userListHeader}>
                            <span>{t('users.table.fullName')}</span>
                            <span>{t('users.table.username')}</span>
                            <span>{t('users.table.matricula', 'Matrícula')}</span>
                            <span>{t('users.table.function')}</span>
                            <span style={{ textAlign: 'right' }}>
                                {t('users.table.actions')}
                            </span>
                        </div>

                        <ul className={styles.userList}>
                            {utilizadores.map((userRow) => {
                                const roleClass = userRow.role === 'gestor'
                                    ? styles.roleGestor
                                    : userRow.role === 'manutentor'
                                        ? styles.roleManutentor
                                        : styles.roleOperador;
                                return (
                                    <li key={userRow.id} className={styles.userItem}>
                                        <strong>{userRow.nome}</strong>
                                        <span>{userRow.usuario}</span>
                                        <span>
                                            {userRow.matricula ? (
                                                <span className={styles.matriculaBadge}>{userRow.matricula}</span>
                                            ) : (
                                                <span className={styles.matriculaEmpty}>—</span>
                                            )}
                                        </span>
                                        <span className={`${styles.roleBadge} ${roleClass}`}>
                                            {userRow.funcao}
                                        </span>
                                        <div className={styles.actions}>
                                            {userRow.role !== 'gestor' && (
                                                <button
                                                    className={styles.actionButton}
                                                    title={t('users.actions.stats', 'Ver estatísticas')}
                                                    onClick={() => handleVerEstatisticas(userRow)}
                                                >
                                                    <FiBarChart2 />
                                                </button>
                                            )}
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
                                );
                            })}
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
                    <Input
                        id="nome"
                        label={t('users.form.fullName')}
                        type="text"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        required
                    />

                    <Input
                        id="usuario"
                        label={t('users.form.usernameOptional', 'Nome de usuário (login) – opcional')}
                        type="text"
                        value={usuario}
                        onChange={(e) => setUsuario(e.target.value)}
                        placeholder={t('users.form.usernamePlaceholder', 'ex: gabriel.palazini')}
                    />

                    {!modoEdicao && (
                        <Input
                            id="senha"
                            label={t('users.form.tempPassword')}
                            type="password"
                            value={senha}
                            onChange={(e) => setSenha(e.target.value)}
                            minLength={6}
                        />
                    )}

                    <Select
                        id="role"
                        label={t('users.form.role')}
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                    >
                        {roles.length > 0 ? (
                            roles.map(r => (
                                <option key={r.id} value={r.nome.toLowerCase()}>
                                    {r.nome}
                                </option>
                            ))
                        ) : (
                            <>
                                <option value="operador">{t('users.roles.operator')}</option>
                                <option value="manutentor">{t('users.roles.maintainer')}</option>
                                <option value="gestor">{t('users.roles.manager')}</option>
                            </>
                        )}
                    </Select>

                    {role === 'operador' && (
                        <Input
                            id="matricula"
                            label={t('users.form.matricula', 'Matrícula')}
                            type="text"
                            value={matricula}
                            onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                setMatricula(val);
                            }}
                            placeholder={t('users.form.matriculaPlaceholder', 'Ex: 1234')}
                            maxLength={4}
                            inputMode="numeric"
                        />
                    )}

                    <Button type="submit" loading={isSaving} style={{ marginTop: 16 }}>
                        {modoEdicao ? t('users.form.saveChanges') : t('users.form.createUser')}
                    </Button>
                </form>
            </Modal>

            {/* Modal de Estatísticas */}
            <Modal
                isOpen={isStatsModalOpen}
                onClose={() => setIsStatsModalOpen(false)}
                title={statsData?.usuario?.nome ? `${t('users.stats.title', 'Estatísticas')} - ${statsData.usuario.nome}` : t('users.stats.title', 'Estatísticas')}
            >
                {loadingStats ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {[1, 2, 3, 4].map(i => (
                            <Skeleton key={i} variant="rectangular" height={60} sx={{ borderRadius: 2 }} />
                        ))}
                    </div>
                ) : statsData ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                        {statsData.role === 'operador' && (
                            <>
                                <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', borderRadius: 12, padding: 16, border: '1px solid #bfdbfe' }}>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: '#1e40af' }}>
                                        {statsData.estatisticas.checklistsTotal || 0}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#3b82f6' }}>
                                        {t('users.stats.checklistsTotal', 'Checklists enviados')}
                                    </div>
                                </div>
                                <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', borderRadius: 12, padding: 16, border: '1px solid #bbf7d0' }}>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: '#166534' }}>
                                        {statsData.estatisticas.checklistsMes || 0}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#22c55e' }}>
                                        {t('users.stats.checklistsMes', 'Últimos 30 dias')}
                                    </div>
                                </div>
                                <div style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', borderRadius: 12, padding: 16, border: '1px solid #fcd34d' }}>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: '#a16207' }}>
                                        {statsData.estatisticas.chamadosAbertos || 0}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#eab308' }}>
                                        {t('users.stats.chamadosAbertos', 'Chamados abertos')}
                                    </div>
                                </div>
                                <div style={{ background: 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)', borderRadius: 12, padding: 16, border: '1px solid #fca5a5' }}>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: '#b91c1c' }}>
                                        {statsData.estatisticas.itensProblema || 0}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#ef4444' }}>
                                        {t('users.stats.itensProblema', 'Itens com problema')}
                                    </div>
                                </div>
                            </>
                        )}
                        {statsData.role === 'manutentor' && (
                            <>
                                <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', borderRadius: 12, padding: 16, border: '1px solid #bfdbfe' }}>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: '#1e40af' }}>
                                        {statsData.estatisticas.chamadosAtribuidos || 0}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#3b82f6' }}>
                                        {t('users.stats.chamadosAtribuidos', 'Chamados atribuídos')}
                                    </div>
                                </div>
                                <div style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', borderRadius: 12, padding: 16, border: '1px solid #fcd34d' }}>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: '#a16207' }}>
                                        {statsData.estatisticas.emAndamento || 0}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#eab308' }}>
                                        {t('users.stats.emAndamento', 'Em andamento')}
                                    </div>
                                </div>
                                <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', borderRadius: 12, padding: 16, border: '1px solid #bbf7d0' }}>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: '#166534' }}>
                                        {statsData.estatisticas.concluidos || 0}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#22c55e' }}>
                                        {t('users.stats.concluidos', 'Concluídos')}
                                    </div>
                                </div>
                                <div style={{ background: 'linear-gradient(135deg, #faf5ff 0%, #e9d5ff 100%)', borderRadius: 12, padding: 16, border: '1px solid #c4b5fd' }}>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: '#7c3aed' }}>
                                        {statsData.estatisticas.concluidosMes || 0}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#a78bfa' }}>
                                        {t('users.stats.concluidosMes', 'Concluídos no mês')}
                                    </div>
                                </div>
                                <div style={{ gridColumn: 'span 2', background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)', borderRadius: 12, padding: 16, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: '#374151' }}>
                                        {statsData.estatisticas.tempoMedioHoras || '0'}h
                                    </div>
                                    <div style={{ fontSize: 13, color: '#6b7280' }}>
                                        {t('users.stats.tempoMedio', 'Tempo médio de resolução')}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <p style={{ color: '#6b7280', textAlign: 'center' }}>
                        {t('users.stats.noData', 'Nenhuma estatística disponível')}
                    </p>
                )}
            </Modal>
        </>
    );
};

export default GerirUtilizadoresPage;
