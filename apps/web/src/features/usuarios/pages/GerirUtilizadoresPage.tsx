// src/features/usuarios/pages/GerirUtilizadoresPage.tsx
import React, { useState, useEffect, FormEvent, ChangeEvent, useMemo, useRef } from 'react';
import styles from './GerirUtilizadoresPage.module.css';
import Modal from '../../../shared/components/Modal';
import { Input, Select, Button } from '../../../shared/components';
import { FiPlus, FiEdit, FiTrash2, FiBarChart2, FiSearch } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Skeleton from '../../../shared/components/Skeleton';
import PageHeader from '../../../shared/components/PageHeader';
import {
    listarUsuarios,
    criarUsuario,
    atualizarUsuario,
    excluirUsuario,
    obterEstatisticasUsuario,
    EstatisticasUsuario,
    listarRolesOptions,
    verificarDisponibilidadeUsuario,
    listarPaginasPermissao,
    PaginaPermissao,
    NivelPermissao
} from '../../../services/apiClient';
import useDebounce from '../../../hooks/useDebounce';

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
    role?: string;
    funcao?: string;
    matricula?: string;
    permissoes?: Record<string, NivelPermissao>;
}

type RoleFilter = 'all' | 'gestor' | 'manutentor' | 'operador';

// ---------- Helpers ----------
const FUNCAO_MAP_FALLBACK: Record<string, string> = {
    'gestor industrial': 'Gestor Industrial',
    manutentor: 'Manutentor',
    operador: 'Operador',
};

/**
 * Normalize a full name into a login slug.
 * "João da Silva" → "joao.silva"
 * Rules:
 *   1. NFD decompose → strip combining diacritics (Unicode category Mn)
 *   2. Lowercase
 *   3. Remove characters that are not a-z, 0-9, or spaces
 *   4. Split by whitespace → take first and last word
 *   5. Join with "."
 */
function gerarSlug(nomeCompleto: string): string {
    const normalizado = nomeCompleto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')   // strip diacritics
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')        // strip non-alphanumeric (keeps spaces)
        .trim();

    const palavras = normalizado.split(/\s+/).filter(Boolean);
    if (palavras.length === 0) return '';
    if (palavras.length === 1) return palavras[0];

    return `${palavras[0]}.${palavras[palavras.length - 1]}`;
}

function gerarSugestoes(slug: string, existentes: { usuario?: string }[]): string[] {
    const ocupados = new Set(existentes.map(u => (u.usuario || '').toLowerCase()));
    const resultado: string[] = [];
    // Try slug2, slug3, slug4 first
    for (let i = 2; resultado.length < 3 && i <= 10; i++) {
        const candidato = `${slug}${i}`;
        if (!ocupados.has(candidato)) resultado.push(candidato);
    }
    // If still need more, try slug.alt, slug.jr, slug.b
    const extras = ['.alt', '.jr', '.b'];
    for (const sufixo of extras) {
        if (resultado.length >= 3) break;
        const candidato = `${slug}${sufixo}`;
        if (!ocupados.has(candidato)) resultado.push(candidato);
    }
    return resultado.slice(0, 3);
}

// ---------- Component ----------
const GerirUtilizadoresPage = ({ user }: GerirUtilizadoresPageProps) => {
    const { t } = useTranslation();

    const [utilizadores, setUtilizadores] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [roleFiltro, setRoleFiltro] = useState<string>('all');
    const [busca, setBusca] = useState('');

    // modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modoEdicao, setModoEdicao] = useState(false);
    const [usuarioEditandoId, setUsuarioEditandoId] = useState<string | null>(null);

    // form
    const [nome, setNome] = useState('');
    const [usuario, setUsuario] = useState('');
    const [emailInput, setEmailInput] = useState('');
    const [senha, setSenha] = useState('');
    const [role, setRole] = useState('operador');
    const [matricula, setMatricula] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Username availability check
    type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';
    const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
    const [sugestoes, setSugestoes] = useState<string[]>([]);

    // Duplicate name warning
    const [nomeWarning, setNomeWarning] = useState<string | null>(null);
    const usuarioManuallyEditedRef = useRef(false);

    // stats modal
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [statsData, setStatsData] = useState<EstatisticasUsuario | null>(null);
    const [loadingStats, setLoadingStats] = useState(false);

    // permissions editor modal
    const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
    const [usuarioEditandoPermissoes, setUsuarioEditandoPermissoes] = useState<UserRow | null>(null);
    const [permissoesEditando, setPermissoesEditando] = useState<Record<string, NivelPermissao>>({});
    const [savingPermissoes, setSavingPermissoes] = useState(false);
    const [paginas, setPaginas] = useState<PaginaPermissao[]>([]);

    // roles list (tipo simplificado para dropdown)
    type RoleOption = { id: string; nome: string };
    const [roles, setRoles] = useState<RoleOption[]>([]);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const auth = { email: user?.email, role: user?.role };
                const [lista, rolesList, paginasList] = await Promise.all([
                    listarUsuarios({ role: roleFiltro !== 'all' ? roleFiltro : undefined }),
                    listarRolesOptions(auth),
                    listarPaginasPermissao(auth)
                ]);
                if (!alive) return;
                setUtilizadores(
                    (lista as UserRow[]).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt'))
                );
                setRoles(rolesList);
                setPaginas(paginasList);
            } catch (e) {
                console.error('Erro ao listar utilizadores:', e);
                toast.error(t('users.toasts.listError'));
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [roleFiltro, t, user?.email, user?.role]);

    const utilizadoresFiltrados = useMemo(() => {
        const termo = busca.trim().toLowerCase();
        if (!termo) return utilizadores;
        return utilizadores.filter(u =>
            u.nome.toLowerCase().includes(termo) ||
            (u.usuario || '').toLowerCase().includes(termo) ||
            (u.email || '').toLowerCase().includes(termo)
        );
    }, [utilizadores, busca]);

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

    const handleNomeChange = (e: ChangeEvent<HTMLInputElement>) => {
        const novoNome = e.target.value;
        setNome(novoNome);

        // Auto-populate usuario only if the field is still unmodified
        if (!modoEdicao && !usuarioManuallyEditedRef.current) {
            setUsuario(gerarSlug(novoNome));
        }

        // Duplicate name check against already-loaded list
        const nomeLower = novoNome.trim().toLowerCase();
        if (nomeLower.length >= 3) {
            const match = utilizadores.find(
                u => u.nome.toLowerCase() === nomeLower && u.id !== usuarioEditandoId
            );
            setNomeWarning(match ? t('users.validation.duplicateName', { nome: match.nome }) : null);
        } else {
            setNomeWarning(null);
        }
    };

    const handleUsuarioChange = (e: ChangeEvent<HTMLInputElement>) => {
        usuarioManuallyEditedRef.current = true;
        setUsuario(e.target.value);
    };

    // Debounced availability check effect
    const debouncedUsuario = useDebounce(usuario, 600);

    useEffect(() => {
        const slug = debouncedUsuario.trim().toLowerCase();

        // Skip check if: modal is closed, slug is empty, or too short
        if (!isModalOpen || slug.length < 2) {
            setUsernameStatus('idle');
            setSugestoes([]);
            return;
        }

        // In edit mode, if the slug is the same as the original, it's "already owned" — show as available
        if (modoEdicao) {
            const original = utilizadores.find(u => u.id === usuarioEditandoId);
            if (original?.usuario?.toLowerCase() === slug) {
                setUsernameStatus('available');
                setSugestoes([]);
                return;
            }
        }

        let cancelled = false;
        setUsernameStatus('checking');

        verificarDisponibilidadeUsuario(slug, { role: user?.role, email: user?.email })
            .then(result => {
                if (cancelled) return;
                if (result.disponivel) {
                    setUsernameStatus('available');
                    setSugestoes([]);
                } else {
                    setUsernameStatus('taken');
                    // Generate suggestions client-side using the loaded list
                    setSugestoes(gerarSugestoes(slug, utilizadores));
                }
            })
            .catch(() => {
                if (!cancelled) setUsernameStatus('error');
            });

        return () => { cancelled = true; };
    }, [debouncedUsuario, isModalOpen, modoEdicao, usuarioEditandoId, utilizadores, user?.role, user?.email]);

    const handleSalvarUtilizador = async (e: FormEvent) => {
        e.preventDefault();

        const nomeCompleto = nome.trim();
        if (!nomeCompleto) {
            toast.error(t('users.toasts.nameRequired'));
            return;
        }

        if (usernameStatus === 'taken') {
            toast.error(t('users.form.usernameTaken'));
            return;
        }

        const nomeUsuario = (usuario || '').trim() || gerarSlug(nomeCompleto);

        // Busca o nome correto do role para usar como "funcao" e armazena na API
        const roleObj = roles.find(r => r.nome.toLowerCase() === role.toLowerCase());
        const funcao = roleObj ? roleObj.nome : (FUNCAO_MAP_FALLBACK[role] ?? 'Custom');

        setIsSaving(true);
        try {
            if (modoEdicao && usuarioEditandoId) {
                const payload: Partial<UserRow> & { role: string; funcao: string; usuario: string; matricula?: string; email?: string } = {
                    nome: nomeCompleto,
                    usuario: nomeUsuario,
                    email: emailInput.trim() || undefined,
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
                    email?: string;
                    role: string;
                    funcao: string;
                    senha?: string;
                    matricula?: string;
                } = {
                    nome: nomeCompleto,
                    usuario: nomeUsuario,
                    email: emailInput.trim() || undefined,
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
            setEmailInput('');
            setSenha('');
            setRole('operador');
            setMatricula('');
            setModoEdicao(false);
            setUsuarioEditandoId(null);
            setIsModalOpen(false);
            setUsernameStatus('idle');
            setSugestoes([]);
            setNomeWarning(null);
            usuarioManuallyEditedRef.current = false;
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
        setEmailInput('');
        setSenha('');
        setRole('operador'); // Default seguro
        setMatricula('');
        setUsernameStatus('idle');
        setSugestoes([]);
        setNomeWarning(null);
        usuarioManuallyEditedRef.current = false;
    };

    const abrirModalEdicao = (userRow: UserRow) => {
        setNome(userRow.nome || '');
        setUsuario(userRow.usuario || '');
        setEmailInput(userRow.email || '');
        setRole(userRow.role || 'operador');
        setMatricula(userRow.matricula || '');
        setModoEdicao(true);
        setUsuarioEditandoId(userRow.id);
        setSenha('');
        setIsModalOpen(true);
        setUsernameStatus('idle');
        setSugestoes([]);
        setNomeWarning(null);
        usuarioManuallyEditedRef.current = true;
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

    const handleEditarPermissoes = (userRow: UserRow) => {
        setUsuarioEditandoPermissoes(userRow);
        setPermissoesEditando(userRow.permissoes || {});
        setIsPermissionsModalOpen(true);
    };

    const handleSalvarPermissoes = async () => {
        if (!usuarioEditandoPermissoes) return;

        setSavingPermissoes(true);
        try {
            await atualizarUsuario(usuarioEditandoPermissoes.id, {
                permissoes: permissoesEditando,
                role: usuarioEditandoPermissoes.role?.toLowerCase()
            }, { role: user?.role, email: user?.email });

            // Atualizar lista local
            setUtilizadores(prev =>
                prev.map(u =>
                    u.id === usuarioEditandoPermissoes.id
                        ? { ...u, permissoes: permissoesEditando }
                        : u
                )
            );

            setIsPermissionsModalOpen(false);
            toast.success(t('users.toasts.permissionsSaved', 'Permissões atualizadas com sucesso'));

            // Se as permissões do usuário logado foram alteradas, fazer logout automático
            // para forçar re-autenticação com as novas permissões
            if (usuarioEditandoPermissoes.id === user?.email) {
                setTimeout(() => {
                    window.location.href = '/logout';
                }, 1500);
            }
        } catch (error) {
            console.error('Erro ao salvar permissões:', error);
            toast.error((error as Error).message || t('users.toasts.error', 'Erro ao atualizar permissões'));
        } finally {
            setSavingPermissoes(false);
        }
    };

    const setPermissao = (pageKey: string, nivel: NivelPermissao) => {
        setPermissoesEditando(prev => ({
            ...prev,
            [pageKey]: nivel
        }));
    };

    const paginasPorGrupo = useMemo(() => {
        const groups: Record<string, PaginaPermissao[]> = {};
        paginas.forEach(p => {
            if (!groups[p.grupo]) groups[p.grupo] = [];
            groups[p.grupo].push(p);
        });
        return groups;
    }, [paginas]);

    return (
        <>
            {/* Header padrão */}
            <PageHeader
                title={t('users.title')}
                subtitle={t('users.subtitle', 'Gerencie os usuários do sistema, seus papéis e credenciais internas.')}
                actions={
                    <Button size="sm" onClick={abrirModalCriacao}>
                        <FiPlus />
                        {t('users.actions.create')}
                    </Button>
                }
            />

            {/* Card principal de conteúdo */}
            <div className={styles.userListContainer}>
                {/* Toolbar de filtro dentro do card */}
                <div className={styles.userListToolbar}>
                    <div className={styles.filterGroup}>
                        <div className={styles.searchWrapper}>
                            <FiSearch className={styles.searchIcon} />
                            <input
                                type="text"
                                className={`${styles.input} ${styles.searchInput}`}
                                placeholder={t('users.search.placeholder', 'Buscar por nome, usuário ou e-mail...')}
                                value={busca}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setBusca(e.target.value)}
                            />
                        </div>
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
                    {!loading && (
                        <span className={styles.userCount}>
                            {utilizadoresFiltrados.length === utilizadores.length
                                ? t('users.count', '{{total}} usuários', { total: utilizadores.length })
                                : t('users.countFiltered', '{{shown}} de {{total}}', { shown: utilizadoresFiltrados.length, total: utilizadores.length })}
                        </span>
                    )}
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
                            {utilizadoresFiltrados.length === 0 && (
                                <li className={styles.emptyState}>
                                    {t('users.search.noResults', 'Nenhum usuário encontrado para "{{busca}}"', { busca })}
                                </li>
                            )}
                            {utilizadoresFiltrados.map((userRow) => {
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
                                        <div className={styles.nameCell}>
                                            <strong>{userRow.nome}</strong>
                                            {userRow.email && (
                                                <span className={styles.emailSecondary}>{userRow.email}</span>
                                            )}
                                        </div>
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
                                                title={t('users.actions.permissions', 'Editar permissões')}
                                                onClick={() => handleEditarPermissoes(userRow)}
                                            >
                                                <FiEdit style={{ transform: 'rotate(90deg)' }} />
                                            </button>
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
                onClose={() => {
                    setIsModalOpen(false);
                    setUsernameStatus('idle');
                    setSugestoes([]);
                    setNomeWarning(null);
                    usuarioManuallyEditedRef.current = false;
                }}
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
                        onChange={handleNomeChange}
                        required
                    />
                    {nomeWarning && (
                        <p className={styles.fieldWarning}>{nomeWarning}</p>
                    )}

                    <div className={styles.fieldGroup}>
                        <Input
                            id="usuario"
                            label={t('users.form.usernameOptional', 'Nome de usuário (login) – opcional')}
                            type="text"
                            value={usuario}
                            onChange={handleUsuarioChange}
                            placeholder={t('users.form.usernamePlaceholder', 'ex: gabriel.palazini')}
                        />
                        {usernameStatus === 'checking' && (
                            <p className={styles.fieldHint}>{t('users.form.checkingUsername')}</p>
                        )}
                        {usernameStatus === 'available' && (
                            <p className={styles.fieldSuccess}>{t('users.form.usernameAvailable')}</p>
                        )}
                        {usernameStatus === 'taken' && (
                            <p className={styles.fieldError}>
                                {t('users.form.usernameTaken')}
                                {sugestoes.length > 0 && (
                                    <>
                                        {' '}{t('users.form.usernameSuggestions')}
                                        {sugestoes.map(s => (
                                            <button
                                                key={s}
                                                type="button"
                                                className={styles.suggestionChip}
                                                onClick={() => {
                                                    setUsuario(s);
                                                    usuarioManuallyEditedRef.current = true;
                                                }}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </>
                                )}
                            </p>
                        )}
                    </div>

                    <Input
                        id="email"
                        label={t('users.form.email', 'Email')}
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
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

            {/* Modal de Permissões */}
            <Modal
                isOpen={isPermissionsModalOpen}
                onClose={() => {
                    setIsPermissionsModalOpen(false);
                    setUsuarioEditandoPermissoes(null);
                    setPermissoesEditando({});
                }}
                title={usuarioEditandoPermissoes ? `Editar Permissões - ${usuarioEditandoPermissoes.nome}` : 'Editar Permissões'}
            >
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                    maxHeight: '70vh',
                    overflowY: 'auto'
                }}>
                    <div style={{
                        borderTop: '1px solid #e2e8f0',
                        paddingTop: '16px'
                    }}>
                        <h4 style={{
                            margin: '0 0 16px',
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            color: '#1e293b'
                        }}>
                            Permissões por Página
                        </h4>

                        {Object.entries(paginasPorGrupo).map(([grupo, pags]) => (
                            <div key={grupo} style={{ marginBottom: '20px' }}>
                                <h5 style={{
                                    margin: '0 0 12px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    color: '#64748b',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    paddingBottom: '8px',
                                    borderBottom: '1px solid #e2e8f0'
                                }}>
                                    {grupo}
                                </h5>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {pags.map(pag => (
                                        <div
                                            key={pag.key}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '8px 12px',
                                                background: '#f8fafc',
                                                borderRadius: '8px',
                                                gap: '12px'
                                            }}
                                        >
                                            <span style={{
                                                fontSize: '0.85rem',
                                                color: '#334155',
                                                flex: 1
                                            }}>
                                                {pag.nome}
                                            </span>
                                            <div style={{
                                                display: 'flex',
                                                gap: '4px'
                                            }}>
                                                {(['nenhum', 'ver', 'editar'] as NivelPermissao[]).map(nivel => {
                                                    const isActive = permissoesEditando[pag.key] === nivel || (nivel === 'nenhum' && !permissoesEditando[pag.key]);
                                                    return (
                                                        <label
                                                            key={nivel}
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                padding: '6px 12px',
                                                                borderRadius: '6px',
                                                                fontSize: '0.75rem',
                                                                fontWeight: 500,
                                                                cursor: 'pointer',
                                                                transition: 'all 0.15s ease',
                                                                background: isActive ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : '#e2e8f0',
                                                                color: isActive ? '#ffffff' : '#64748b',
                                                                border: '2px solid transparent',
                                                                userSelect: 'none'
                                                            }}
                                                        >
                                                            <input
                                                                type="radio"
                                                                name={`perm_${pag.key}`}
                                                                checked={isActive}
                                                                onChange={() => setPermissao(pag.key, nivel)}
                                                                style={{ display: 'none' }}
                                                            />
                                                            {nivel === 'nenhum' ? 'Nenhum' : nivel === 'ver' ? 'Ver' : 'Editar'}
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '12px',
                        paddingTop: '16px',
                        borderTop: '1px solid #e2e8f0',
                        marginTop: 'auto'
                    }}>
                        <button
                            onClick={() => setIsPermissionsModalOpen(false)}
                            disabled={savingPermissoes}
                            style={{
                                padding: '10px 20px',
                                borderRadius: '8px',
                                fontSize: '0.9rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                border: 'none',
                                background: '#f1f5f9',
                                color: '#64748b',
                                opacity: savingPermissoes ? 0.6 : 1
                            }}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSalvarPermissoes}
                            disabled={savingPermissoes}
                            style={{
                                padding: '10px 20px',
                                borderRadius: '8px',
                                fontSize: '0.9rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                border: 'none',
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                color: '#ffffff',
                                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                                opacity: savingPermissoes ? 0.6 : 1
                            }}
                        >
                            {savingPermissoes ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
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
