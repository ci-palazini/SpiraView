// src/App.tsx
import { useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import UserContext from './contexts/UserContext';
import { MaintenanceProvider, useMaintenance } from './contexts/MaintenanceContext';
import MaintenanceScreen from './layouts/MaintenanceScreen';

import LoginPage from './layouts/LoginPage';
import MainLayout from './layouts/MainLayout';
import InicioTurnoPage from './features/manutencao/checklists/pages/InicioTurnoPage';

// Lazy load TV pages
const TvMenuPage = lazy(() => import('./features/tv/TvMenuPage'));
const TvDashboardPage = lazy(() => import('./features/tv/TvDashboardPage'));
const TvPinGate = lazy(() => import('./features/tv/components/TvPinGate'));
const JustificativaChecklistPage = lazy(() => import('./features/manutencao/checklists/pages/JustificativaChecklistPage'));

const AUTH_EVENT = 'auth-user-changed';

export interface User {
    id: string;
    email: string;
    name?: string;
    role: string;
    roleId?: string;
    roleNome?: string;
    permissoes?: Record<string, 'nenhum' | 'ver' | 'editar'>;
}

function readStoredUser(): User | null {
    try {
        return JSON.parse(localStorage.getItem('usuario') || 'null');
    } catch {
        return null;
    }
}

function AppContent({ user, role }: { user: User | null; role: string }) {
    const { isMaintenance } = useMaintenance();

    if (isMaintenance) {
        return <MaintenanceScreen />;
    }

    return (
        <Routes>
            {/* ROTAS PÚBLICAS: TV/Kiosk — protegidas por PIN de 4 dígitos */}
            <Route path="/tv" element={
                <Suspense fallback={<div style={{ color: 'white', padding: '2rem' }}>Carregando TV...</div>}>
                    <TvPinGate>
                        <TvMenuPage />
                    </TvPinGate>
                </Suspense>
            } />
            <Route path="/tv/:scope" element={
                <Suspense fallback={<div style={{ color: 'white', padding: '2rem' }}>Carregando Painel...</div>}>
                    <TvPinGate>
                        <TvDashboardPage />
                    </TvPinGate>
                </Suspense>
            } />


            {!user && <Route path="/*" element={<LoginPage />} />}

            {user && role === 'operador' && (
                <>
                    {/* Wizard fora do layout */}
                    <Route path="/inicio-turno" element={<InicioTurnoPage user={user} />} />
                    {/* App "normal" com sidebar etc. */}
                    <Route path="/*" element={<MainLayout user={user} />} />
                </>
            )}

            {user && role !== 'operador' && (
                <Route path="/*" element={<MainLayout user={user} />}>
                    {/* Nested routes inside MainLayout se houver */}
                </Route>
            )}
        </Routes>
    );
}

export default function App() {
    const [user, setUser] = useState<User | null>(() => readStoredUser());


    // 🔁 Recarrega o user quando volta de login (evento customizado já cuida disso)
    // NOTA: removido effect de location.key que causava race condition
    // ao re-ler dados antigos do localStorage antes do /auth/me responder

    // 🔔 Reage imediatamente a login/logout na MESMA aba (evento customizado)
    useEffect(() => {
        const onAuth = () => setUser(readStoredUser());
        window.addEventListener(AUTH_EVENT, onAuth);
        return () => window.removeEventListener(AUTH_EVENT, onAuth);
    }, []);

    // 🔄 Busca dados atualizados do usuário (permissões) ao carregar
    useEffect(() => {
        const storedUser = readStoredUser();
        if (!storedUser?.email) return;

        import('./services/apiClient').then(({ me }) => {
            me()
                .then((freshUser: Record<string, unknown>) => {
                    if (freshUser.email === storedUser.email) {
                        const merged = { ...storedUser, ...freshUser };
                        localStorage.setItem('usuario', JSON.stringify(merged));
                        setUser(merged as User);
                    } else {
                        // Email do token (real) difere do localStorage (spoofado/antigo)
                        // Força logout para limpar o estado
                        console.warn('Sessão inválida: email difere do token');
                        localStorage.removeItem('usuario');
                        setUser(null);
                        window.dispatchEvent(new CustomEvent(AUTH_EVENT));
                    }
                })
                .catch((err) => {
                    console.error('Erro ao validar sessão:', err);
                    // Se falhar validação (token inválido/expirado), desloga
                    // Verificamos se foi erro de auth
                    const msg = String(err).toLowerCase();
                    if (msg.includes('401') || msg.includes('403') || msg.includes('não autenticado')) {
                        localStorage.removeItem('usuario');
                        setUser(null);
                        window.dispatchEvent(new CustomEvent(AUTH_EVENT));
                    }
                });
        });
    }, []); // Roda somente no mount (F5) — lê localStorage diretamente, sem closure stale

    // Multi-aba: se outra aba fizer login/logout (aqui o 'storage' funciona)
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === 'usuario') setUser(readStoredUser());
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const role = (user?.role || '').trim().toLowerCase();

    return (
        <DndProvider backend={HTML5Backend}>
            <MaintenanceProvider>
                <UserContext.Provider value={user}>
                    <Toaster position="top-right" />
                    <AppContent user={user} role={role} />
                </UserContext.Provider>
            </MaintenanceProvider>
        </DndProvider>
    );
}
