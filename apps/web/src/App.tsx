// src/App.tsx
import { useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import LoginPage from './components/LoginPage';
import MainLayout from './components/MainLayout';
import InicioTurnoPage from './features/manutencao/checklists/pages/InicioTurnoPage';
import TvMenuPage from './features/producao/tv/TvMenuPage';
import TvDashboardPage from './features/producao/tv/TvDashboardPage';

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

export default function App() {
    const [user, setUser] = useState<User | null>(() => readStoredUser());
    const location = useLocation();

    // 🔁 Recarrega o user a cada mudança de rota (inclui pós-login via navigate)
    useEffect(() => {
        setUser(readStoredUser());
    }, [location.key]);

    // 🔔 Reage imediatamente a login/logout na MESMA aba (evento customizado)
    useEffect(() => {
        const onAuth = () => setUser(readStoredUser());
        window.addEventListener(AUTH_EVENT, onAuth);
        return () => window.removeEventListener(AUTH_EVENT, onAuth);
    }, []);

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
            <Toaster position="top-right" />
            <Routes>
                {/* ROTAS PÚBLICAS: TV/Kiosk (não precisa de login) */}
                <Route path="/tv" element={<TvMenuPage />} />
                <Route path="/tv/:scope" element={<TvDashboardPage />} />


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
                    <Route path="/*" element={<MainLayout user={user} />} />
                )}
            </Routes>
        </DndProvider>
    );
}
