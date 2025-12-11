import React, { useState, useEffect, useMemo, useRef } from 'react';
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
} from 'react-icons/fi';
import styles from './MainLayout.module.css';

import OperatorDashboard from './OperatorDashboard.jsx';
import MaquinasPage from '../features/maquinas/pages/MaquinasPage.jsx';
import MaquinaDetalhePage from '../features/maquinas/pages/MaquinaDetalhePage.jsx';
import InicioPage from '../pages/InicioPage.jsx';
import ChamadoDetalhe from '../features/chamados/pages/ChamadoDetalhe.jsx';
import HistoricoPage from '../features/chamados/pages/HistoricoPage.jsx';
import PerfilPage from '../features/usuarios/pages/PerfilPage.jsx';
import AnaliseFalhasPage from '../features/analytics/pages/AnaliseFalhasPage.jsx';
import GerirUtilizadoresPage from '../features/usuarios/pages/GerirUtilizadoresPage.jsx';
import CalendarioGeralPage from '../features/calendario/pages/CalendarioGeralPage.jsx';
import CausasRaizPage from '../features/analytics/pages/CausasRaizPage.jsx';
import EstoquePage from '../features/estoque/pages/EstoquePage.jsx';
import MeusChamados from '../features/chamados/pages/MeusChamados';
import AbrirChamadoManutentor from '../features/chamados/pages/AbrirChamadoManutentor.jsx';
import LanguageMenu from '../components/LanguageMenu.jsx';
import PziniChatBot from '../features/analytics/pages/PziniChatBot.jsx';
import ChecklistOverviewPage from '../features/checklists/pages/ChecklistOverviewPage.jsx';

import logo from '../assets/logo-sidebar.png';
import { useTranslation } from 'react-i18next';

// API
import { listarChamados, listarAgendamentos, connectSSE } from '../services/apiClient';

const MainLayout = ({ user }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const role = useMemo(() => (user?.role || '').trim().toLowerCase(), [user?.role]);

  const isOperator = role === 'operador';
  const isMaintainer = role === 'manutentor';
  const isManager = role === 'gestor';
  const isMaintLike = isMaintainer || isManager;

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hasOpenCalls, setHasOpenCalls] = useState(false);
  const [hasSoonDue, setHasSoonDue] = useState(false);
  const [myActiveCount, setMyActiveCount] = useState(0);
  const hasMyActiveCalls = myActiveCount > 0;

  // menu do usuário (avatar)
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  // idioma atual é PT?
  const isPt = (i18n?.language || '').toLowerCase().startsWith('pt');

  // badge “BETA” (pill) para o item do ChatBot
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

  // iniciais do usuário para o avatar
  const userInitials = useMemo(() => {
    const nome = (user?.nome || '').trim();
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
  }, [user?.nome, user?.email]);

  // Helpers de refresh (usados no mount e quando chegam eventos SSE)
  const refreshOpenCalls = async () => {
    try {
      const a = await listarChamados({ status: 'Aberto', pageSize: 1 });
      const e = await listarChamados({ status: 'Em Andamento', pageSize: 1 });
      setHasOpenCalls(((a?.total || 0) + (e?.total || 0)) > 0);
    } catch { }
  };

  const refreshSoonDue = async () => {
    try {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const to = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
      const lista = await listarAgendamentos({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      const qtd = (lista || []).filter(
        (a) => a.status === 'agendado' && new Date(a.start_ts) <= to
      ).length;
      setHasSoonDue(qtd > 0);
    } catch { }
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
    } catch { }
  };

  // Conexão SSE + primeira carga dos badges
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
    } catch { }
    window.dispatchEvent(new Event('auth-user-changed'));
    navigate('/login', { replace: true });
  };

  const getDashboardTitle = () => {
    if (isOperator) return t('dashboard.operator');
    if (isMaintainer) return t('dashboard.maintainer');
    if (isManager) return t('dashboard.manager');
    return '—';
  };

  // helper pra proteger rota
  const canAccess = (allowedRoles, element) =>
    allowedRoles.includes(role) ? element : <Navigate to="/" replace />;

  // fecha o menu do usuário ao clicar fora / ESC
  useEffect(() => {
    const onClick = (e) => {
      if (!userMenuRef.current) return;
      if (!userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

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

      {/* Atalho para o wizard do operador */}
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

      {/* Meu Perfil saiu daqui e foi para o menu do avatar */}

      {isMaintLike && (
        <>
          <h3 className={styles.navSectionTitle}>
            {t('layout.sections.manageMaintenance')}
          </h3>

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
        </>
      )}

      {isMaintainer && (
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

      {isMaintainer && (
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

      {isMaintLike && (
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

      {/* Checklists diários – apenas gestor */}
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

      {isMaintLike && (
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

      {isMaintLike && (
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

      {isManager && (
        <>
          <h3 className={styles.navSectionTitle}>
            {t('layout.sections.analytics')}
          </h3>

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

          {/* Chatbot: só aparece se idioma for PT; com badge BETA */}
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

          <h3 className={styles.navSectionTitle}>
            {t('layout.sections.managePeople')}
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
        className={`${styles.mobileNav} ${isMobileMenuOpen ? styles.open : ''
          }`}
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
                title={user?.nome || user?.email || ''}
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
            element={canAccess(['manutentor', 'gestor'], <HistoricoPage user={user} />)}
          />
          <Route
            path="/historico/chamado/:id"
            element={canAccess(['manutentor', 'gestor'], <ChamadoDetalhe user={user} />)}
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

          {/* rota protegida: apenas gestor acessa */}
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
