// src/contexts/MaintenanceContext.tsx
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

// The interval in milliseconds to check status.json. Example: 60 seconds
const POLLING_INTERVAL = 60 * 1000;
const MAINTENANCE_API_EVENT = 'api-maintenance';

interface MaintenanceContextType {
    isMaintenance: boolean;
}

const MaintenanceContext = createContext<MaintenanceContextType>({ isMaintenance: false });

export const useMaintenance = () => useContext(MaintenanceContext);

interface MaintenanceProviderProps {
    children: ReactNode;
}

export const MaintenanceProvider: React.FC<MaintenanceProviderProps> = ({ children }) => {
    const [isMaintenance, setIsMaintenance] = useState(false);

    const checkMaintenanceStatus = async () => {
        try {
            // Adds timestamp `t` to bypass browser/service worker caches completely
            const url = `/status.json?t=${Date.now()}`;
            const res = await fetch(url, { cache: 'no-store' });

            if (res.ok) {
                const data = await res.json();
                if (data && typeof data.maintenance === 'boolean') {
                    setIsMaintenance(data.maintenance);
                }
            }
        } catch (err) {
            // Se falhar silenciosamente (offline sem interceptar chamadas), não mudamos o estado.
            // O ideal é que falhas de rede por si só não ativem o modo manutenção sem confirmação do 503.
            console.warn('Falha ao verificar status de manutenção', err);
        }
    };

    useEffect(() => {
        // Checagem imediata ao carregar a página
        checkMaintenanceStatus();

        // Configurar loop de polling
        const intervalId = setInterval(checkMaintenanceStatus, POLLING_INTERVAL);

        // Listener para os interceptores da API (quando a API retorna 503 ativamente)
        const handleMaintenanceEvent = () => {
            console.warn('Manutenção detectada via erro 503 na API!');
            setIsMaintenance(true);
            // Ao receber um erro 503, podemos forçar o recheck periódico curto para voltar rápido caso a manutenção termine.
            setTimeout(checkMaintenanceStatus, 15000);
        };

        window.addEventListener(MAINTENANCE_API_EVENT, handleMaintenanceEvent);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener(MAINTENANCE_API_EVENT, handleMaintenanceEvent);
        };
    }, []);

    return (
        <MaintenanceContext.Provider value={{ isMaintenance }}>
            {children}
        </MaintenanceContext.Provider>
    );
};
