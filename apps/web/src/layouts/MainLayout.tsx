// src/components/MainLayout.tsx
import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './MainLayout.module.css';

import logo from '../assets/logo-sidebar.png';
import type { User } from '../App';

import { listarAgendamentos, getChamadoCounts } from '../services/apiClient';
import useSSE from '../hooks/useSSE';
import usePermissions from '../hooks/usePermissions';

import Header from './components/Header';
import NavigationContent from './components/NavigationContent';
import AppRoutes from './components/AppRoutes';

type UserRole = 'operador' | 'manutentor' | 'gestor' | 'gestor industrial' | '';

interface MainLayoutProps {
    user: User;
}

interface Agendamento {
    status?: string;
    start_ts?: string;
}

const MainLayout = ({ user }: MainLayoutProps) => {
    const { t } = useTranslation();
    const location = useLocation();
    const role = useMemo<UserRole>(() => (user?.role || '').trim().toLowerCase() as UserRole, [user?.role]);
    const perm = usePermissions(user);

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [hasOpenCalls, setHasOpenCalls] = useState(false);
    const [hasSoonDue, setHasSoonDue] = useState(false);
    const [myActiveCount, setMyActiveCount] = useState(0);
    const hasMyActiveCalls = myActiveCount > 0;

    // Sidebar Groups State - with localStorage persistence
    const SIDEBAR_GROUPS_KEY = 'sidebar_groups_state';

    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
        const defaults = { maintenance: false, production: false, planejamento: false, quality: false, logistics: false, pdca: false, melhoriaContinua: false, ehs: false };
        try {
            const saved = localStorage.getItem(SIDEBAR_GROUPS_KEY);
            if (saved) {
                return { ...defaults, ...JSON.parse(saved) };
            }
        } catch { /* ignore */ }
        return defaults;
    });

    const toggleGroup = (key: string) => {
        setOpenGroups(prev => {
            const isOpening = !prev[key];
            const next = isOpening
                ? Object.keys(prev).reduce((acc, k) => ({ ...acc, [k]: k === key }), {} as Record<string, boolean>)
                : { ...prev, [key]: false };
            try {
                localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(next));
            } catch { /* ignore */ }
            return next;
        });
    };

    const refreshChamadoCounts = async () => {
        const canViewMaquinas = perm.canView('maquinas');
        const canViewMeus = perm.canView('meus_chamados') && !!user?.email;

        if (!canViewMaquinas && !canViewMeus) {
            setHasOpenCalls(false);
            setMyActiveCount(0);
            return;
        }

        try {
            const counts = await getChamadoCounts(user?.email || undefined);
            setHasOpenCalls(canViewMaquinas ? (counts.abertos + counts.emAndamento) > 0 : false);
            setMyActiveCount(canViewMeus ? (counts.meusAbertos + counts.meusEmAndamento) : 0);
        } catch { /* ignore */ }
    };

    const refreshSoonDue = async () => {
        if (!perm.canView('calendario')) {
            setHasSoonDue(false);
            return;
        }

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

    useEffect(() => {
        const path = location.pathname;
        let targetGroup: string | null = null;

        if (path.startsWith('/producao')) targetGroup = 'production';
        else if (path.startsWith('/planejamento')) targetGroup = 'planejamento';
        else if (path.startsWith('/qualidade')) targetGroup = 'quality';
        else if (path.startsWith('/logistica')) targetGroup = 'logistics';
        else if (path.startsWith('/pdca')) targetGroup = 'pdca';
        else if (path.startsWith('/melhoria-continua')) targetGroup = 'melhoriaContinua';
        else if (
            path.startsWith('/maquinas') || path.startsWith('/historico') ||
            path.startsWith('/checklists') || path.startsWith('/estoque') ||
            path.startsWith('/calendario') || path.startsWith('/chamados') ||
            path.startsWith('/abrir-chamado') || path.startsWith('/meus-chamados') ||
            path.startsWith('/analise-falhas') || path.startsWith('/causas-raiz')
        ) {
            targetGroup = 'maintenance';
        }

        if (targetGroup && !openGroups[targetGroup]) {
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
        refreshChamadoCounts();
        refreshSoonDue();
    }, [role, user?.email]);

    useSSE('chamados', refreshChamadoCounts);
    useSSE('agendamentos', refreshSoonDue);

    const getDashboardTitle = (): string => {
        const roleNorm = (user?.role || '').toLowerCase();
        let title = user?.role || '—';

        if (roleNorm === 'operador') title = t('dashboard.operator');
        else if (roleNorm === 'manutentor') title = t('dashboard.maintainer');
        else if (roleNorm === 'gestor industrial') title = t('dashboard.manager');

        if (title === '—') return title;

        return title.split(' ').map(word => word ? word.charAt(0).toUpperCase() + word.slice(1) : '').join(' ');
    };

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
                    <NavigationContent
                        role={role}
                        perm={perm}
                        openGroups={openGroups}
                        toggleGroup={toggleGroup}
                        hasOpenCalls={hasOpenCalls}
                        hasSoonDue={hasSoonDue}
                        hasMyActiveCalls={hasMyActiveCalls}
                        myActiveCount={myActiveCount}
                    />
                </nav>
            </aside>

            {/* OVERLAY MOBILE */}
            {isMobileMenuOpen && (
                <div className={styles.overlay} onClick={() => setIsMobileMenuOpen(false)} />
            )}

            {/* SIDEBAR MOBILE */}
            <aside className={`${styles.mobileNav} ${isMobileMenuOpen ? styles.open : ''}`}>
                <div className={styles.sidebarHeader}>
                    <Link to="/" onClick={() => setIsMobileMenuOpen(false)}>
                        <img src={logo} alt="Logo" className={styles.sidebarLogo} />
                    </Link>
                </div>
                <nav className={styles.nav} onClick={() => setIsMobileMenuOpen(false)}>
                    <NavigationContent
                        role={role}
                        perm={perm}
                        openGroups={openGroups}
                        toggleGroup={toggleGroup}
                        hasOpenCalls={hasOpenCalls}
                        hasSoonDue={hasSoonDue}
                        hasMyActiveCalls={hasMyActiveCalls}
                        myActiveCount={myActiveCount}
                    />
                </nav>
            </aside>

            {/* CONTEÚDO PRINCIPAL */}
            <main className={styles.mainContent}>
                <Header
                    isMobileMenuOpen={isMobileMenuOpen}
                    setIsMobileMenuOpen={setIsMobileMenuOpen}
                    title={getDashboardTitle()}
                    user={user}
                />

                <AppRoutes
                    user={user}
                    role={role}
                    perm={perm}
                />
            </main>
        </div>
    );
};

export default MainLayout;
