// src/components/MainLayout.tsx
import { useState, useEffect, useMemo, useRef, ReactElement } from 'react';
import { Routes, Route, NavLink, Link, useNavigate, Navigate, useLocation } from 'react-router-dom';
import {
    FiHome,
    FiLogOut,
    FiCheckSquare,
    FiUser,
    FiCalendar,
    FiUsers,
    FiServer,
    FiMenu,
    FiX,
    FiBarChart2,
    FiPackage,
    FiClipboard,
    FiPieChart,
    FiPlusCircle,
    FiMessageSquare,
    FiFileText,
    FiAlertCircle,
    FiUploadCloud,
    FiChevronDown,
    FiShield,
    FiSettings,
} from 'react-icons/fi';
import { PiFactoryBold } from "react-icons/pi";
import { LuLayoutDashboard } from "react-icons/lu";
import styles from './MainLayout.module.css';

import OperatorDashboard from './OperatorDashboard';
import MaquinasPage from '../features/manutencao/maquinas/pages/MaquinasPage';
import MaquinaDetalhePage from '../features/manutencao/maquinas/pages/MaquinaDetalhePage';
import InicioPage from '../pages/InicioPage';
import ChamadoDetalhe from '../features/manutencao/chamados/pages/ChamadoDetalhe';
import HistoricoPage from '../features/manutencao/chamados/pages/HistoricoPage';
import PerfilPage from '../features/usuarios/pages/PerfilPage';
import AnaliseFalhasPage from '../features/manutencao/analytics/pages/AnaliseFalhasPage';
import GerirUtilizadoresPage from '../features/usuarios/pages/GerirUtilizadoresPage';
import CalendarioGeralPage from '../features/manutencao/utilidades/calendario/pages/CalendarioGeralPage';
import CausasRaizPage from '../features/manutencao/analytics/pages/CausasRaizPage';
import EstoquePage from '../features/manutencao/utilidades/estoque/pages/EstoquePage';
import HistoricoMovimentacoesPage from '../features/manutencao/utilidades/estoque/pages/HistoricoMovimentacoesPage';
import MeusChamados from '../features/manutencao/chamados/pages/MeusChamados';
import AbrirChamadoManutentor from '../features/manutencao/chamados/pages/AbrirChamadoManutentor';
import LanguageMenu from './LanguageMenu';
import PziniChatBot from '../features/manutencao/analytics/pages/PziniChatBot';
import ChecklistOverviewPage from '../features/manutencao/checklists/pages/ChecklistOverviewPage';
import ChamadosAbertosPage from '../features/manutencao/chamados/pages/ChamadosAbertosPage';
import ProducaoUploadPage from '../features/producao/pages/ProducaoUploadPage';
import ProducaoConfigPage from '../features/producao/pages/ProducaoConfigPage';
import ProducaoUploadDetalhePage from '../features/producao/pages/ProducaoUploadDetalhePage';
import ProducaoDashboardPage from '../features/producao/pages/ProducaoDashboardPage';
import ProducaoColaboradoresPage from '../features/producao/pages/ProducaoColaboradoresPage';
import RolesPage from '../features/configuracoes/pages/RolesPage';
import PlanejamentoDashboardPage from '../features/planejamento/pages/PlanejamentoDashboardPage';
import CapacidadeUploadPage from '../features/planejamento/pages/CapacidadeUploadPage';
import CapacidadeConfigPage from '../features/planejamento/pages/CapacidadeConfigPage';

import logo from '../assets/logo-sidebar.png';
import { useTranslation } from 'react-i18next';
import type { User } from '../App';

import { listarChamados, listarAgendamentos, connectSSE } from '../services/apiClient';
import { usePermissions } from '../hooks/usePermissions';

type UserRole = 'operador' | 'manutentor' | 'gestor' | 'gestor industrial' | '';

interface MainLayoutProps {
    user: User;
}

interface Agendamento {
    status?: string;
    start_ts?: string;
}

const MainLayout = ({ user }: MainLayoutProps) => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const role = useMemo<UserRole>(() => (user?.role || '').trim().toLowerCase() as UserRole, [user?.role]);

    // Sistema granular de permissões
    const perm = usePermissions(user);

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [hasOpenCalls, setHasOpenCalls] = useState(false);
    const [hasSoonDue, setHasSoonDue] = useState(false);
    const [myActiveCount, setMyActiveCount] = useState(0);
    const hasMyActiveCalls = myActiveCount > 0;

    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const userMenuRef = useRef<HTMLDivElement>(null);

    // Sidebar Groups State - with localStorage persistence
    const SIDEBAR_GROUPS_KEY = 'sidebar_groups_state';

    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
        try {
            const saved = localStorage.getItem(SIDEBAR_GROUPS_KEY);
            if (saved) return JSON.parse(saved);
        } catch { /* ignore */ }
        return { maintenance: false, production: false, planejamento: false };
    });

    const toggleGroup = (key: string) => {
        setOpenGroups(prev => {
            const isOpening = !prev[key];
            // Accordion: ao abrir um grupo, fecha os outros
            const next = isOpening
                ? Object.keys(prev).reduce((acc, k) => ({ ...acc, [k]: k === key }), {} as Record<string, boolean>)
                : { ...prev, [key]: false };
            try {
                localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(next));
            } catch { /* ignore */ }
            return next;
        });
    };

    const isPt = (i18n?.language || '').toLowerCase().startsWith('pt');

    const BetaTag = () => (
        <span
            style={{
                marginLeft: 10,
                padding: '0 6px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                alignSelf: 'center',
                lineHeight: '16px',
                background: '#ffffffff',
                color: '#000000ff',
                border: '1px solid #000000ff',
            }}
            title="Beta"
        >
            BETA
        </span>
    );

    const userInitials = useMemo(() => {
        const nome = ((user as { nome?: string })?.nome || '').trim();
        if (nome) {
            const parts = nome.split(/\s+/);
            if (parts.length >= 2) {
                return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
            }
            return nome.slice(0, 2).toUpperCase();
        }
        const email = (user?.email || '').trim();
        if (email) return email.slice(0, 2).toUpperCase();
        return '?';
    }, [(user as { nome?: string })?.nome, user?.email]);

    const refreshOpenCalls = async () => {
        try {
            const a = await listarChamados({ status: 'Aberto', pageSize: 1 });
            const e = await listarChamados({ status: 'Em Andamento', pageSize: 1 });
            setHasOpenCalls(((a?.total || 0) + (e?.total || 0)) > 0);
        } catch { /* ignore */ }
    };

    const refreshSoonDue = async () => {
        try {
            const now = new Date();
            const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const to = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
            const lista: Agendamento[] = await listarAgendamentos({
                from: from.toISOString(),
                to: to.toISOString(),
            });
            const qtd = (lista || []).filter(
                (a) => a.status === 'agendado' && a.start_ts && new Date(a.start_ts) <= to
            ).length;
            setHasSoonDue(qtd > 0);
        } catch { /* ignore */ }
    };

    const refreshMyActive = async () => {
        // Apenas quem tem permissão de 'meus_chamados' busca chamados ativos
        if (!perm.canView('meus_chamados') || !user?.email) {
            setMyActiveCount(0);
            return;
        }
        try {
            const a = await listarChamados({
                status: 'Aberto',
                manutentorEmail: user.email,
                pageSize: 1,
            });
            const e = await listarChamados({
                status: 'Em Andamento',
                manutentorEmail: user.email,
                pageSize: 1,
            });
            setMyActiveCount((a?.total || 0) + (e?.total || 0));
        } catch { /* ignore */ }
    };

    // Auto-expand sidebar group based on current path
    useEffect(() => {
        const path = location.pathname;
        let targetGroup: string | null = null;

        if (path.startsWith('/producao')) {
            targetGroup = 'production';
        } else if (path.startsWith('/planejamento')) {
            targetGroup = 'planejamento';
        } else if (
            path.startsWith('/maquinas') ||
            path.startsWith('/historico') ||
            path.startsWith('/checklists') ||
            path.startsWith('/estoque') ||
            path.startsWith('/calendario') ||
            path.startsWith('/chamados') ||
            path.startsWith('/abrir-chamado') ||
            path.startsWith('/meus-chamados') ||
            path.startsWith('/analise-falhas') ||
            path.startsWith('/causas-raiz')
        ) {
            targetGroup = 'maintenance';
        }

        // Accordion: fecha todos e abre apenas o grupo da rota atual
        if (targetGroup) {
            setOpenGroups(prev => {
                const next = Object.keys(prev).reduce((acc, k) => ({ ...acc, [k]: k === targetGroup }), {} as Record<string, boolean>);
                try {
                    localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(next));
                } catch { /* ignore */ }
                return next;
            });
        }
    }, [location.pathname]);

    useEffect(() => {
        let stopped = false;

        refreshOpenCalls();
        refreshSoonDue();
        refreshMyActive();

        const disconnect = connectSSE({
            chamados: () => {
                if (!stopped) {
                    refreshOpenCalls();
                    refreshMyActive();
                }
            },
            agendamentos: () => {
                if (!stopped) refreshSoonDue();
            },
        });
        return () => {
            stopped = true;
            disconnect();
        };
    }, [role, user?.email]);

    const handleLogout = () => {
        try {
            localStorage.removeItem('usuario');
            localStorage.removeItem('dadosTurno');
        } catch { /* ignore */ }
        window.dispatchEvent(new Event('auth-user-changed'));
        navigate('/login', { replace: true });
    };

    const getDashboardTitle = (): string => {
        // Usa role para título do dashboard (mantém por ser exibição cosmética)
        const roleNorm = (user?.role || '').toLowerCase();
        if (roleNorm === 'operador') return t('dashboard.operator');
        if (roleNorm === 'manutentor') return t('dashboard.maintainer');
        if (roleNorm === 'gestor industrial') return t('dashboard.manager');
        return user?.role || '—';
    };

    // Função para verificar permissões granulares por página
    const canAccessPage = (pageKey: string, element: ReactElement): ReactElement =>
        perm.canView(pageKey) ? element : <Navigate to="/" replace />;

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (!userMenuRef.current) return;
            if (!userMenuRef.current.contains(e.target as Node)) {
                setUserMenuOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setUserMenuOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, []);

    const SidebarGroup = ({
        id,
        label,
        icon: Icon,
        children
    }: {
        id: string;
        label: string;
        icon?: React.ElementType;
        children: React.ReactNode
    }) => {
        const isOpen = openGroups[id];
        return (
            <div className={styles.sidebarGroup}>
                <button
                    className={styles.groupHeader}
                    onClick={() => toggleGroup(id)}
                    aria-expanded={isOpen}
                >
                    <div className={styles.groupHeaderLabel}>
                        {Icon && <Icon style={{ fontSize: 20 }} />}
                        <span>{label}</span>
                    </div>
                    <FiChevronDown className={`${styles.chevron} ${isOpen ? styles.open : ''}`} />
                </button>
                <div className={`${styles.groupContent} ${isOpen ? styles.open : ''}`}>
                    {children}
                </div>
            </div>
        );
    };

    const NavContent = () => (
        <>
            <NavLink
                to="/"
                className={({ isActive }) =>
                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                }
                end
            >
                <FiHome className={styles.navIcon} />
                <span>{t('nav.home')}</span>
            </NavLink>

            {role === 'operador' && (
                <NavLink
                    to="/inicio-turno"
                    className={({ isActive }) =>
                        isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                    }
                >
                    <FiCheckSquare className={styles.navIcon} />
                    <span>{t('nav.startShift', 'Início de turno')}</span>
                </NavLink>
            )}

            {/* Manutenção - usa permissões granulares */}
            {perm.canViewAny(['maquinas', 'chamados_abertos', 'meus_chamados', 'abrir_chamado', 'calendario', 'checklists_diarios', 'historico_chamados', 'estoque', 'movimentacoes', 'analise_falhas', 'causas_raiz']) && (
                <SidebarGroup id="maintenance" label={t('layout.sections.maintenance', 'Manutenção')} icon={FiServer}>
                    {perm.canView('maquinas') && (
                        <NavLink
                            to="/maquinas"
                            className={({ isActive }) => {
                                const base = styles.navLink;
                                const active = isActive ? ` ${styles.activeLink}` : '';
                                const alert = hasOpenCalls ? ` ${styles.alertLink}` : '';
                                return `${base}${active}${alert}`.trim();
                            }}
                        >
                            <div style={{ position: 'relative' }}>
                                <FiServer className={styles.navIcon} />
                                {hasOpenCalls && <span className={styles.alertBadge} />}
                            </div>
                            <span>{t('nav.machines')}</span>
                        </NavLink>
                    )}

                    {perm.canView('chamados_abertos') && (
                        <NavLink
                            to="/chamados-abertos"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiAlertCircle className={styles.navIcon} />
                            <span>{t('nav.openTickets', 'Chamados Abertos')}</span>
                        </NavLink>
                    )}

                    {perm.canView('meus_chamados') && (
                        <NavLink
                            to="/meus-chamados"
                            className={({ isActive }) => {
                                const base = styles.navLink;
                                const active = isActive ? ` ${styles.activeLink}` : '';
                                const alert = hasMyActiveCalls ? ` ${styles.alertLink}` : '';
                                return `${base}${active}${alert}`.trim();
                            }}
                        >
                            <div style={{ position: 'relative' }}>
                                <FiClipboard className={styles.navIcon} />
                                {hasMyActiveCalls && (
                                    <span
                                        className={styles.alertBadge}
                                        title={`${myActiveCount} ${t('nav.activeCalls')}`}
                                    />
                                )}
                            </div>
                            <span>{t('nav.myCalls')}</span>
                        </NavLink>
                    )}

                    {perm.canView('abrir_chamado') && (
                        <NavLink
                            to="/abrir-chamado"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiPlusCircle className={styles.navIcon} />
                            <span>{t('nav.openCorrective')}</span>
                        </NavLink>
                    )}

                    {perm.canView('calendario') && (
                        <NavLink
                            to="/calendario-geral"
                            className={({ isActive }) => {
                                let cls = styles.navLink;
                                if (isActive) return `${cls} ${styles.activeLink}`;
                                if (hasSoonDue) return `${cls} ${styles.alertLink}`;
                                return cls;
                            }}
                        >
                            <FiCalendar className={styles.navIcon} />
                            <span>{t('nav.calendar')}</span>
                        </NavLink>
                    )}

                    {perm.canView('checklists_diarios') && (
                        <NavLink
                            to="/checklists-diarios"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiCheckSquare className={styles.navIcon} />
                            <span>{t('nav.dailyChecklists', 'Checklists diários')}</span>
                        </NavLink>
                    )}

                    {perm.canView('historico_chamados') && (
                        <NavLink
                            to="/historico"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiFileText className={styles.navIcon} />
                            <span>{t('nav.history')}</span>
                        </NavLink>
                    )}

                    {perm.canView('estoque') && (
                        <NavLink
                            to="/estoque"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiPackage className={styles.navIcon} />
                            <span>{t('nav.inventory')}</span>
                        </NavLink>
                    )}

                    {perm.canView('movimentacoes') && (
                        <NavLink
                            to="/estoque/movimentacoes"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiClipboard className={styles.navIcon} />
                            <span>{t('nav.stockMovements', 'Movimentações')}</span>
                        </NavLink>
                    )}

                    {/* Analytics dentro de Manutenção */}
                    {perm.canViewAny(['analise_falhas', 'causas_raiz']) && (
                        <>
                            <div style={{ margin: '8px 0', borderTop: '1px solid #e2e8f0' }} />
                            {perm.canView('analise_falhas') && (
                                <NavLink
                                    to="/analise-falhas"
                                    className={({ isActive }) =>
                                        isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                    }
                                >
                                    <FiBarChart2 className={styles.navIcon} />
                                    <span>{t('nav.failures')}</span>
                                </NavLink>
                            )}

                            {perm.canView('causas_raiz') && (
                                <NavLink
                                    to="/causas-raiz"
                                    className={({ isActive }) =>
                                        isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                    }
                                >
                                    <FiPieChart className={styles.navIcon} />
                                    <span>{t('nav.rootCauses')}</span>
                                </NavLink>
                            )}

                            {isPt && perm.canViewAny(['analise_falhas', 'causas_raiz']) && (
                                <NavLink
                                    to="/chatbot"
                                    className={({ isActive }) =>
                                        isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                    }
                                >
                                    <FiMessageSquare className={styles.navIcon} />
                                    <span>{t('nav.pzinibot', 'Pzini')}</span>
                                    <BetaTag />
                                </NavLink>
                            )}
                        </>
                    )}
                </SidebarGroup>
            )}

            {/* Produção - usa permissões granulares */}
            {perm.canViewAny(['producao_upload', 'producao_dashboard', 'producao_colaboradores', 'producao_config']) && (
                <SidebarGroup id="production" label={t('layout.sections.production', 'Produção')} icon={PiFactoryBold}>
                    {perm.canView('producao_dashboard') && (
                        <NavLink
                            to="/producao/dashboard"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <LuLayoutDashboard className={styles.navIcon} />
                            <span>{t('nav.productionDashboard', 'Dashboard')}</span>
                        </NavLink>
                    )}

                    {perm.canView('producao_colaboradores') && (
                        <NavLink
                            to="/producao/colaboradores"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiUsers className={styles.navIcon} />
                            <span>{t('nav.productionEmployees', 'Colaboradores')}</span>
                        </NavLink>
                    )}

                    {perm.canView('producao_upload') && (
                        <NavLink
                            to="/producao/upload"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiUploadCloud className={styles.navIcon} />
                            <span>{t('nav.productionUpload', 'Upload Produção')}</span>
                        </NavLink>
                    )}

                    {perm.canView('producao_config') && (
                        <NavLink
                            to="/producao/config"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiServer className={styles.navIcon} />
                            <span>{t('nav.productionConfig', 'Config. Máquinas')}</span>
                        </NavLink>
                    )}
                </SidebarGroup>
            )}

            {/* Planejamento - novo departamento */}
            {perm.canViewAny(['planejamento_dashboard', 'planejamento_upload', 'planejamento_config']) && (
                <SidebarGroup id="planejamento" label={t('layout.sections.planejamento', 'Planejamento')} icon={FiCalendar}>
                    {perm.canView('planejamento_dashboard') && (
                        <NavLink
                            to="/planejamento/dashboard"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <LuLayoutDashboard className={styles.navIcon} />
                            <span>{t('nav.planejamentoDashboard', 'Dashboard')}</span>
                        </NavLink>
                    )}
                    {perm.canView('planejamento_upload') && (
                        <NavLink
                            to="/planejamento/upload"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiUploadCloud className={styles.navIcon} />
                            <span>{t('nav.planejamentoUpload', 'Upload Capacidade')}</span>
                        </NavLink>
                    )}
                    {perm.canView('planejamento_config') && (
                        <NavLink
                            to="/planejamento/config"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiSettings className={styles.navIcon} />
                            <span>{t('nav.planejamentoConfig', 'Configuração')}</span>
                        </NavLink>
                    )}
                </SidebarGroup>
            )}

            {/* Administração - usa permissões granulares */}
            {perm.canViewAny(['usuarios', 'roles']) && (
                <>
                    <h3 className={styles.navSectionTitle}>
                        {t('layout.sections.managePeople', 'Administração')}
                    </h3>
                    {perm.canView('usuarios') && (
                        <NavLink
                            to="/gerir-utilizadores"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiUsers className={styles.navIcon} />
                            <span>{t('nav.manageUsers')}</span>
                        </NavLink>
                    )}
                    {perm.canView('roles') && (
                        <NavLink
                            to="/configuracoes/roles"
                            className={({ isActive }) =>
                                isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                            }
                        >
                            <FiShield className={styles.navIcon} />
                            <span>{t('nav.manageRoles', 'Níveis de Acesso')}</span>
                        </NavLink>
                    )}
                </>
            )}
        </>
    );

    return (
        <div className={styles.layout}>
            {/* SIDEBAR DESKTOP */}
            <aside className={styles.sidebar}>
                <div className={styles.sidebarHeader}>
                    <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
                        <img src={logo} alt="Logo da Empresa" className={styles.sidebarLogo} />
                    </Link>
                </div>
                <nav className={styles.nav}>
                    <NavContent />
                </nav>
            </aside>

            {/* OVERLAY MOBILE */}
            {isMobileMenuOpen && (
                <div
                    className={styles.overlay}
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* SIDEBAR MOBILE */}
            <aside
                className={`${styles.mobileNav} ${isMobileMenuOpen ? styles.open : ''}`}
            >
                <div className={styles.sidebarHeader}>
                    <Link to="/" onClick={() => setIsMobileMenuOpen(false)}>
                        <img src={logo} alt="Logo" className={styles.sidebarLogo} />
                    </Link>
                </div>
                <nav
                    className={styles.nav}
                    onClick={() => setIsMobileMenuOpen(false)}
                >
                    <NavContent />
                </nav>
            </aside>

            {/* CONTEÚDO PRINCIPAL */}
            <main className={styles.mainContent}>
                <header className={styles.header}>
                    <button
                        className={styles.hamburgerButton}
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    >
                        {isMobileMenuOpen ? <FiX /> : <FiMenu />}
                    </button>
                    <h1>{getDashboardTitle()}</h1>

                    <div className={styles.headerRight}>
                        <LanguageMenu className={styles.langMenu} />

                        <div className={styles.userMenuRoot} ref={userMenuRef}>
                            <button
                                className={styles.userAvatarButton}
                                onClick={() => setUserMenuOpen((v) => !v)}
                                aria-haspopup="menu"
                                aria-expanded={userMenuOpen}
                                title={(user as { nome?: string })?.nome || user?.email || ''}
                            >
                                <span className={styles.userAvatarCircle}>{userInitials}</span>
                            </button>

                            {userMenuOpen && (
                                <div className={styles.userMenu} role="menu">
                                    <button
                                        className={styles.userMenuItem}
                                        onClick={() => {
                                            setUserMenuOpen(false);
                                            navigate('/perfil');
                                        }}
                                        role="menuitem"
                                    >
                                        <FiUser className={styles.userMenuIcon} />
                                        <span>{t('nav.profile')}</span>
                                    </button>

                                    <button
                                        className={styles.userMenuItem}
                                        onClick={() => {
                                            setUserMenuOpen(false);
                                            handleLogout();
                                        }}
                                        role="menuitem"
                                    >
                                        <FiLogOut className={styles.userMenuIcon} />
                                        <span>{t('common.logout', 'Sair')}</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <Routes>
                    <Route
                        path="/"
                        element={
                            role === 'operador' ? (
                                <OperatorDashboard user={user} />
                            ) : (
                                <InicioPage user={user} />
                            )
                        }
                    />

                    <Route
                        path="/maquinas"
                        element={canAccessPage('maquinas', <MaquinasPage user={user} />)}
                    />
                    <Route
                        path="/maquinas/chamado/:id"
                        element={canAccessPage('maquinas', <ChamadoDetalhe user={user} />)}
                    />
                    <Route
                        path="/maquinas/:id"
                        element={canAccessPage('maquinas', <MaquinaDetalhePage user={user} />)}
                    />

                    <Route path="/perfil" element={<PerfilPage user={user} />} />

                    <Route
                        path="/meus-chamados"
                        element={canAccessPage('meus_chamados', <MeusChamados user={user} />)}
                    />

                    <Route
                        path="/historico"
                        element={canAccessPage('historico_chamados', <HistoricoPage />)}
                    />
                    <Route
                        path="/historico/chamado/:id"
                        element={canAccessPage('historico_chamados', <ChamadoDetalhe user={user} />)}
                    />

                    <Route
                        path="/chamados-abertos"
                        element={canAccessPage('chamados_abertos', <ChamadosAbertosPage />)}
                    />

                    <Route
                        path="/abrir-chamado"
                        element={canAccessPage('abrir_chamado', <AbrirChamadoManutentor user={user} />)}
                    />

                    <Route
                        path="/analise-falhas"
                        element={canAccessPage('analise_falhas', <AnaliseFalhasPage />)}
                    />

                    <Route
                        path="/causas-raiz"
                        element={canAccessPage('causas_raiz', <CausasRaizPage user={user} />)}
                    />

                    <Route
                        path="/calendario-geral"
                        element={canAccessPage('calendario', <CalendarioGeralPage user={user} />)}
                    />

                    <Route
                        path="/estoque"
                        element={canAccessPage('estoque', <EstoquePage user={user} />)}
                    />

                    <Route
                        path="/estoque/movimentacoes"
                        element={canAccessPage('movimentacoes', <HistoricoMovimentacoesPage user={user} />)}
                    />

                    <Route
                        path="/checklists-diarios"
                        element={canAccessPage('checklists_diarios', <ChecklistOverviewPage user={user} />)}
                    />

                    <Route
                        path="/gerir-utilizadores"
                        element={canAccessPage('usuarios', <GerirUtilizadoresPage user={user} />)}
                    />

                    <Route
                        path="/configuracoes/roles"
                        element={canAccessPage('roles', <RolesPage user={user} />)}
                    />

                    <Route
                        path="/producao/upload"
                        element={canAccessPage('producao_upload', <ProducaoUploadPage user={user} />)}
                    />

                    <Route
                        path="/producao/config"
                        element={canAccessPage('producao_config', <ProducaoConfigPage user={user} />)}
                    />

                    <Route
                        path="/producao/upload/:uploadId"
                        element={canAccessPage('producao_upload', <ProducaoUploadDetalhePage />)}
                    />

                    <Route
                        path="/producao/dashboard"
                        element={canAccessPage('producao_dashboard', <ProducaoDashboardPage user={user} />)}
                    />

                    <Route
                        path="/producao/colaboradores"
                        element={canAccessPage('producao_colaboradores', <ProducaoColaboradoresPage user={user} />)}
                    />

                    {/* Planejamento */}
                    <Route
                        path="/planejamento/dashboard"
                        element={canAccessPage('planejamento_dashboard', <PlanejamentoDashboardPage user={user} />)}
                    />
                    <Route
                        path="/planejamento/upload"
                        element={canAccessPage('planejamento_upload', <CapacidadeUploadPage user={user} />)}
                    />
                    <Route
                        path="/planejamento/config"
                        element={canAccessPage('planejamento_config', <CapacidadeConfigPage user={user} />)}
                    />

                    <Route
                        path="/chatbot"
                        element={
                            isPt && perm.canViewAny(['analise_falhas', 'causas_raiz']) ? (
                                <PziniChatBot user={user} />
                            ) : (
                                <Navigate to="/" replace />
                            )
                        }
                    />
                </Routes>
            </main>
        </div>
    );
};

export default MainLayout;
