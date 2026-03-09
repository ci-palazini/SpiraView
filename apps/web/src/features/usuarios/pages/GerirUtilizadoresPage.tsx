// src/features/usuarios/pages/GerirUtilizadoresPage.tsx
import React, { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import styles from './GerirUtilizadoresPage.module.css';
import Modal from '../../../shared/components/Modal';
import { Input, Select, Button } from '../../../shared/components';
import { FiPlus, FiEdit, FiTrash2, FiBarChart2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Skeleton from '../../../shared/components/Skeleton';
import {
    listarUsuarios,
    criarUsuario,
    atualizarUsuario,
    excluirUsuario,
    obterEstatisticasUsuario,
    EstatisticasUsuario,
    listarRolesOptions
} from '../../../services/apiClient';

// ---------- Types ----------
interface User {
    role?: string;
    email?: string;
}

interface GerirUtilizadoresPageProps {
    user: User;
}

interface UserRow {
    id: string;
    nome: string;
    usuario?: string;
    email?: string;
    email_real?: string;
    role?: string;
    funcao?: string;
    matricula?: string;
}

type RoleFilter = 'all' | 'gestor' | 'manutentor' | 'operador';

// ---------- Helpers ----------
const FUNCAO_MAP_FALLBACK: Record<string, string> = {
    'gestor industrial': 'Gestor Industrial',
    manutentor: 'Manutentor',
    operador: 'Operador',
};

// ---------- Component ----------
const GerirUtilizadoresPage = ({ user }: GerirUtilizadoresPageProps) => {
    const { t } = useTranslation();

    const [utilizadores, setUtilizadores] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [roleFiltro, setRoleFiltro] = useState<string>('all');

    // modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modoEdicao, setModoEdicao] = useState(false);
    const [usuarioEditandoId, setUsuarioEditandoId] = useState<string | null>(null);

    // form
    const [nome, setNome] = useState('');
    const [usuario, setUsuario] = useState('');
    const [emailReal, setEmailReal] = useState('');
    const [senha, setSenha] = useState('');
    const [role, setRole] = useState('operador');
    const [matricula, setMatricula] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // stats modal
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [statsData, setStatsData] = useState<EstatisticasUsuario | null>(null);
    const [loadingStats, setLoadingStats] = useState(false);

    // roles list (tipo simplificado para dropdown)
    type RoleOption = { id: string; nome: string };
    const [roles, setRoles] = useState<RoleOption[]>([]);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const auth = { email: user?.email, role: user?.role };
                const [lista, rolesList] = await Promise.all([
                    listarUsuarios({ role: roleFiltro !== 'all' ? roleFiltro : undefined }),
                    listarRolesOptions(auth)
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

    // Helper para obter label do role dinâmico
    const getRoleLabel = (roleSlug?: string) => {
        if (!roleSlug) return '-';
        const roleObj = roles.find(r => r.nome.toLowerCase() === roleSlug.toLowerCase());
        return roleObj ? roleObj.nome : (FUNCAO_MAP_FALLBACK[roleSlug.toLowerCase()] || roleSlug);
    };

    // Helper para gerar cor consistente baseada no nome do role
    const generateRoleColor = (str: string) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = Math.abs(hash) % 360;
        return `hsl(${h}, 70%, 45%)`; // Cor sólida e legível para o DOT
    };

    const handleSalvarUtilizador = async (e: FormEvent) => {
        e.preventDefault();

        const nomeCompleto = nome.trim();
        if (!nomeCompleto) {
            toast.error(t('users.toasts.nameRequired'));
            return;
        }

        const nomeUsuario = (usuario || '').trim() || nomeCompleto.toLowerCase().replace(/\s+/g, '.');
        const emailGerado = `${nomeUsuario}@spiraview.ci`;

        // Busca o nome correto do role para usar como "funcao" e armazena na API
        const roleObj = roles.find(r => r.nome.toLowerCase() === role.toLowerCase());
        const funcao = roleObj ? roleObj.nome : (FUNCAO_MAP_FALLBACK[role] ?? 'Custom');

        setIsSaving(true);
        try {
            if (modoEdicao && usuarioEditandoId) {
                const payload: Partial<UserRow> & { role: string; funcao: string; usuario: string; matricula?: string; email_real?: string } = {
                    nome: nomeCompleto,
                    usuario: nomeUsuario,
                    email_real: emailReal.trim() || undefined,
                    role,
                    funcao,
                };
                // Adiciona matrícula apenas para operadores
                if (role.toLowerCase() === 'operador') {
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
                    email_real?: string;
                    role: string;
                    funcao: string;
                    senha?: string;
                    matricula?: string;
                } = {
                    nome: nomeCompleto,
                    usuario: nomeUsuario,
                    email: emailGerado,
                    email_real: emailReal.trim() || undefined,
                    role,
                    funcao,
                };
                // Adiciona matrícula apenas para operadores
                if (role.toLowerCase() === 'operador' && matricula.trim()) {
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
            setEmailReal('');
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
        setEmailReal('');
        setSenha('');
        setRole('operador'); // Default seguro
        setMatricula('');
    };

    const abrirModalEdicao = (userRow: UserRow) => {
        setNome(userRow.nome || '');
        setUsuario(userRow.usuario || '');
        setEmailReal(userRow.email_real || '');
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
        // Gestor e Admin não costumam ter estatísticas individuais de produção (mas outros roles podem ter)
        // Lógica: Se for gestor ou admin, ignora. Outros roles entram.
        const roleLower = (userRow.role || '').toLowerCase();
        if (roleLower === 'gestor industrial' || roleLower === 'admin') return;

        setLoadingStats(true);
        setIsStatsModalOpen(true);
        setStatsData(null);

        try {
            const data = await obterEstatisticasUsuario(userRow.id, { role: user?.role, email: user?.email });
            setStatsData(data);
        } catch (error) {
            console.error('Erro ao obter estatísticas:', error);
            // toast.error(t('users.toasts.statsError', 'Erro ao carregar estatísticas'));
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
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => setRoleFiltro(e.target.value)}
                        >
                            <option value="all">{t('users.roles.all')}</option>
                            {/* Roles Dinâmicos do banco de dados */}
                            {roles.map((r) => (
                                <option key={r.id} value={r.nome.toLowerCase()}>
                                    {r.nome}
                                </option>
                            ))}
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
                                    <Skeleton variant="rectangular" width={50} height={24} style={{ borderRadius: '4px' }} />
                                    <Skeleton variant="rectangular" width={80} height={24} style={{ borderRadius: '8px' }} />
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
                                const r = (userRow.role || '').toLowerCase();
                                const isStandard = ['gestor industrial', 'manutentor', 'operador'].includes(r);

                                // Se for standard, usa classe específica (tem dot via CSS fixo)
                                // Se for custom, usa classe genérica e passa cor via style (dot via CSS dinâmico)
                                const roleClass = r === 'gestor industrial'
                                    ? styles.roleGestorIndustrial
                                    : r === 'manutentor'
                                        ? styles.roleManutentor
                                        : r === 'operador'
                                            ? styles.roleOperador
                                            : styles.roleBadge; // usa base

                                // Cor dinâmica para o 'dot' apenas se não for standard
                                const customStyle = !isStandard ? {
                                    '--role-dot-color': generateRoleColor(r)
                                } as React.CSSProperties : undefined;

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
                                        <span
                                            className={`${styles.roleBadge} ${roleClass}`}
                                            style={customStyle}
                                        >
                                            {/* O conteúdo é apenas o label, o DOT vem do CSS ::before */}
                                            {getRoleLabel(userRow.role)}
                                        </span>
                                        <div className={styles.actions}>
                                            {userRow.role !== 'gestor industrial' && userRow.role !== 'admin' && (
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

                    <Input
                        id="emailReal"
                        label={t('users.form.emailReal', 'Email Real (Opcional)')}
                        type="email"
                        value={emailReal}
                        onChange={(e) => setEmailReal(e.target.value)}
                        placeholder="nome@exemplo.com"
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
                            <option value="operador">Carregando...</option>
                        )}
                    </Select>

                    {role.toLowerCase() === 'operador' && (
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
                            <Skeleton key={i} variant="rectangular" height={60} style={{ borderRadius: '8px' }} />
                        ))}
                    </div>
                ) : statsData ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                        {(statsData.role === 'operador' || role.toLowerCase() === 'operador') && (
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
                        {(statsData.role === 'manutentor' || role.toLowerCase() === 'manutentor') && (
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
