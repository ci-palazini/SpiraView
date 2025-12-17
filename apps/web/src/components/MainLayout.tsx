// src/components/MainLayout.tsx
import { useState, useEffect, useMemo, useRef, ReactElement } from 'react';
import { Routes, Route, NavLink, Link, useNavigate, Navigate } from 'react-router-dom';
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
} from 'react-icons/fi';
import styles from './MainLayout.module.css';

import OperatorDashboard from './OperatorDashboard';
import MaquinasPage from '../features/maquinas/pages/MaquinasPage';
import MaquinaDetalhePage from '../features/maquinas/pages/MaquinaDetalhePage';
import InicioPage from '../pages/InicioPage';
import ChamadoDetalhe from '../features/chamados/pages/ChamadoDetalhe';
import HistoricoPage from '../features/chamados/pages/HistoricoPage';
import PerfilPage from '../features/usuarios/pages/PerfilPage';
import AnaliseFalhasPage from '../features/analytics/pages/AnaliseFalhasPage';
import GerirUtilizadoresPage from '../features/usuarios/pages/GerirUtilizadoresPage';
import CalendarioGeralPage from '../features/calendario/pages/CalendarioGeralPage';
import CausasRaizPage from '../features/analytics/pages/CausasRaizPage';
import EstoquePage from '../features/estoque/pages/EstoquePage';
import MeusChamados from '../features/chamados/pages/MeusChamados';
import AbrirChamadoManutentor from '../features/chamados/pages/AbrirChamadoManutentor';
import LanguageMenu from './LanguageMenu';
import PziniChatBot from '../features/analytics/pages/PziniChatBot';
import ChecklistOverviewPage from '../features/checklists/pages/ChecklistOverviewPage';
import ChamadosAbertosPage from '../features/chamados/pages/ChamadosAbertosPage';
import ProducaoUploadPage from '../features/producao/pages/ProducaoUploadPage';
import ProducaoConfigPage from '../features/producao/pages/ProducaoConfigPage';
import ProducaoUploadDetalhePage from '../features/producao/pages/ProducaoUploadDetalhePage';
import ProducaoDashboardPage from '../features/producao/pages/ProducaoDashboardPage';
import ProducaoColaboradoresPage from '../features/producao/pages/ProducaoColaboradoresPage';

import logo from '../assets/logo-sidebar.png';
import { useTranslation } from 'react-i18next';
import type { User } from '../App';

import { listarChamados, listarAgendamentos, connectSSE } from '../services/apiClient';

type UserRole = 'operador' | 'manutentor' | 'gestor' | '';

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
    const role = useMemo<UserRole>(() => (user?.role || '').trim().toLowerCase() as UserRole, [user?.role]);

    const isOperator = role === 'operador';
    const isMaintainer = role === 'manutentor';
    const isManager = role === 'gestor';
    const isMaintLike = isMaintainer || isManager;

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
        return { maintenance: true, production: false };
    });

    const toggleGroup = (key: string) => {
        setOpenGroups(prev => {
            const next = { ...prev, [key]: !prev[key] };
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
        if (!isMaintainer || !user?.email) {
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
        if (isOperator) return t('dashboard.operator');
        if (isMaintainer) return t('dashboard.maintainer');
        if (isManager) return t('dashboard.manager');
        return '—';
    };

    const canAccess = (allowedRoles: string[], element: ReactElement): ReactElement =>
        allowedRoles.includes(role) ? element : <Navigate to="/" replace />;

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
        icon?: React.ElementType; // Tornando ícone opcional
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

            {isOperator && (
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

            {isMaintLike && (
                <SidebarGroup id="maintenance" label="Manutenção" icon={FiServer}>
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

                    <NavLink
                        to="/chamados-abertos"
                        className={({ isActive }) =>
                            isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                        }
                    >
                        <FiAlertCircle className={styles.navIcon} />
                        <span>{t('nav.openTickets', 'Chamados Abertos')}</span>
                    </NavLink>

                    {isMaintainer && (
                        <>
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

                            <NavLink
                                to="/abrir-chamado"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <FiPlusCircle className={styles.navIcon} />
                                <span>{t('nav.openCorrective')}</span>
                            </NavLink>
                        </>
                    )}

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

                    {isManager && (
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

                    <NavLink
                        to="/historico"
                        className={({ isActive }) =>
                            isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                        }
                    >
                        <FiFileText className={styles.navIcon} />
                        <span>{t('nav.history')}</span>
                    </NavLink>

                    <NavLink
                        to="/estoque"
                        className={({ isActive }) =>
                            isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                        }
                    >
                        <FiPackage className={styles.navIcon} />
                        <span>{t('nav.inventory')}</span>
                    </NavLink>

                    {/* Analytics merged here */}
                    {isManager && (
                        <>
                            <div style={{ margin: '8px 0', borderTop: '1px solid #e2e8f0' }} />
                            <NavLink
                                to="/analise-falhas"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <FiBarChart2 className={styles.navIcon} />
                                <span>{t('nav.failures')}</span>
                            </NavLink>

                            <NavLink
                                to="/causas-raiz"
                                className={({ isActive }) =>
                                    isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                                }
                            >
                                <FiPieChart className={styles.navIcon} />
                                <span>{t('nav.rootCauses')}</span>
                            </NavLink>

                            {isPt && (
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

            {/* TODO: Remover filtro de email quando Produção estiver pronto para todos */}
            {isManager && user?.email === 'gabriel.palazini@m.continua.tpm' && (
                <SidebarGroup id="production" label={t('layout.sections.production', 'Produção')} icon={FiBarChart2}>
                    <NavLink
                        to="/producao/dashboard"
                        className={({ isActive }) =>
                            isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                        }
                    >
                        <FiBarChart2 className={styles.navIcon} />
                        <span>{t('nav.productionDashboard', 'Dashboard')}</span>
                    </NavLink>

                    <NavLink
                        to="/producao/colaboradores"
                        className={({ isActive }) =>
                            isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                        }
                    >
                        <FiUsers className={styles.navIcon} />
                        <span>{t('nav.productionEmployees', 'Colaboradores')}</span>
                    </NavLink>

                    <NavLink
                        to="/producao/upload"
                        className={({ isActive }) =>
                            isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                        }
                    >
                        <FiUploadCloud className={styles.navIcon} />
                        <span>{t('nav.productionUpload', 'Upload Produção')}</span>
                    </NavLink>

                    <NavLink
                        to="/producao/config"
                        className={({ isActive }) =>
                            isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                        }
                    >
                        <FiServer className={styles.navIcon} />
                        <span>{t('nav.productionConfig', 'Config. Máquinas')}</span>
                    </NavLink>
                </SidebarGroup>
            )}

            {isManager && (
                <>
                    <h3 className={styles.navSectionTitle}>
                        {t('layout.sections.managePeople', 'Administração')}
                    </h3>
                    <NavLink
                        to="/gerir-utilizadores"
                        className={({ isActive }) =>
                            isActive ? `${styles.navLink} ${styles.activeLink}` : styles.navLink
                        }
                    >
                        <FiUsers className={styles.navIcon} />
                        <span>{t('nav.manageUsers')}</span>
                    </NavLink>
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
                            isOperator ? (
                                <OperatorDashboard user={user} />
                            ) : (
                                <InicioPage user={user} />
                            )
                        }
                    />

                    <Route
                        path="/maquinas"
                        element={canAccess(['manutentor', 'gestor'], <MaquinasPage user={user} />)}
                    />
                    <Route
                        path="/maquinas/chamado/:id"
                        element={canAccess(['manutentor', 'gestor'], <ChamadoDetalhe user={user} />)}
                    />
                    <Route
                        path="/maquinas/:id"
                        element={canAccess(['manutentor', 'gestor'], <MaquinaDetalhePage user={user} />)}
                    />

                    <Route path="/perfil" element={<PerfilPage user={user} />} />

                    <Route
                        path="/meus-chamados"
                        element={canAccess(['manutentor'], <MeusChamados user={user} />)}
                    />

                    <Route
                        path="/historico"
                        element={canAccess(['manutentor', 'gestor'], <HistoricoPage />)}
                    />
                    <Route
                        path="/historico/chamado/:id"
                        element={canAccess(['manutentor', 'gestor'], <ChamadoDetalhe user={user} />)}
                    />

                    <Route
                        path="/chamados-abertos"
                        element={canAccess(['manutentor', 'gestor'], <ChamadosAbertosPage />)}
                    />

                    <Route
                        path="/abrir-chamado"
                        element={canAccess(
                            ['manutentor'],
                            <AbrirChamadoManutentor user={user} />
                        )}
                    />

                    <Route
                        path="/analise-falhas"
                        element={canAccess(['gestor'], <AnaliseFalhasPage />)}
                    />

                    <Route
                        path="/causas-raiz"
                        element={canAccess(['gestor'], <CausasRaizPage user={user} />)}
                    />

                    <Route
                        path="/calendario-geral"
                        element={canAccess(
                            ['manutentor', 'gestor'],
                            <CalendarioGeralPage user={user} />
                        )}
                    />

                    <Route
                        path="/estoque"
                        element={canAccess(
                            ['manutentor', 'gestor'],
                            <EstoquePage user={user} />
                        )}
                    />

                    <Route
                        path="/checklists-diarios"
                        element={canAccess(
                            ['gestor'],
                            <ChecklistOverviewPage user={user} />
                        )}
                    />

                    <Route
                        path="/gerir-utilizadores"
                        element={canAccess(['gestor'], <GerirUtilizadoresPage user={user} />)}
                    />

                    <Route
                        path="/producao/upload"
                        element={canAccess(['gestor'], <ProducaoUploadPage user={user} />)}
                    />

                    <Route
                        path="/producao/config"
                        element={canAccess(['gestor'], <ProducaoConfigPage user={user} />)}
                    />

                    <Route
                        path="/producao/upload/:uploadId"
                        element={canAccess(['gestor'], <ProducaoUploadDetalhePage />)}
                    />

                    <Route
                        path="/producao/dashboard"
                        element={canAccess(['gestor'], <ProducaoDashboardPage user={user} />)}
                    />

                    <Route
                        path="/producao/colaboradores"
                        element={canAccess(['gestor'], <ProducaoColaboradoresPage user={user} />)}
                    />

                    <Route
                        path="/chatbot"
                        element={
                            isPt && isManager ? (
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
