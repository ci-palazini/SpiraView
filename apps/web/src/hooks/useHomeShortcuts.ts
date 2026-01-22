// src/hooks/useHomeShortcuts.ts
import { useState, useEffect, useMemo, useCallback } from 'react';
import { IconType } from 'react-icons';
import {
    FiServer,
    FiCalendar,
    FiCheckSquare,
    FiBarChart2,
    FiPieChart,
    FiUsers,
    FiUser,
    FiPackage,
    FiClipboard,
    FiPlusCircle,
    FiAlertCircle,

    FiUploadCloud,
    FiSettings,
    FiTrendingUp,
} from 'react-icons/fi';
import { LuLayoutDashboard } from 'react-icons/lu';

export interface ShortcutDefinition {
    id: string;
    pageKey: string | string[];  // permissão necessária
    path: string;
    titleKey: string;
    descKey: string;
    icon: IconType;
    ptOnly?: boolean;  // só aparece para usuários em português
}

// Lista completa de todos os atalhos disponíveis
export const ALL_SHORTCUTS: ShortcutDefinition[] = [
    {
        id: 'maquinas',
        pageKey: 'maquinas',
        path: '/maquinas',
        titleKey: 'inicio.cards.machines.title',
        descKey: 'inicio.cards.machines.desc',
        icon: FiServer,
    },
    {
        id: 'chamados_abertos',
        pageKey: 'chamados_abertos',
        path: '/chamados-abertos',
        titleKey: 'inicio.cards.openCalls.title',
        descKey: 'inicio.cards.openCalls.desc',
        icon: FiAlertCircle,
    },
    {
        id: 'meus_chamados',
        pageKey: 'meus_chamados',
        path: '/meus-chamados',
        titleKey: 'inicio.cards.myCalls.title',
        descKey: 'inicio.cards.myCalls.desc',
        icon: FiClipboard,
    },
    {
        id: 'abrir_chamado',
        pageKey: 'abrir_chamado',
        path: '/abrir-chamado',
        titleKey: 'inicio.cards.openTicket.title',
        descKey: 'inicio.cards.openTicket.desc',
        icon: FiPlusCircle,
    },
    {
        id: 'calendario',
        pageKey: 'calendario',
        path: '/calendario-geral',
        titleKey: 'inicio.cards.calendar.title',
        descKey: 'inicio.cards.calendar.desc',
        icon: FiCalendar,
    },
    {
        id: 'checklists_diarios',
        pageKey: 'checklists_diarios',
        path: '/checklists-diarios',
        titleKey: 'inicio.cards.dailyChecklists.title',
        descKey: 'inicio.cards.dailyChecklists.desc',
        icon: FiCheckSquare,
    },
    {
        id: 'historico',
        pageKey: 'historico_chamados',
        path: '/historico',
        titleKey: 'inicio.cards.history.title',
        descKey: 'inicio.cards.history.desc',
        icon: FiCheckSquare,
    },
    {
        id: 'estoque',
        pageKey: 'estoque',
        path: '/estoque',
        titleKey: 'inicio.cards.inventory.title',
        descKey: 'inicio.cards.inventory.desc',
        icon: FiPackage,
    },
    {
        id: 'analise_falhas',
        pageKey: 'analise_falhas',
        path: '/analise-falhas',
        titleKey: 'inicio.cards.failureAnalysis.title',
        descKey: 'inicio.cards.failureAnalysis.desc',
        icon: FiBarChart2,
    },
    {
        id: 'causas_raiz',
        pageKey: 'causas_raiz',
        path: '/causas-raiz',
        titleKey: 'inicio.cards.rootCauses.title',
        descKey: 'inicio.cards.rootCauses.desc',
        icon: FiPieChart,
    },

    {
        id: 'producao_dashboard',
        pageKey: 'producao_dashboard',
        path: '/producao/dashboard',
        titleKey: 'inicio.cards.productionDashboard.title',
        descKey: 'inicio.cards.productionDashboard.desc',
        icon: LuLayoutDashboard,
    },
    {
        id: 'producao_colaboradores',
        pageKey: 'producao_colaboradores',
        path: '/producao/colaboradores',
        titleKey: 'inicio.cards.productionEmployees.title',
        descKey: 'inicio.cards.productionEmployees.desc',
        icon: FiUsers,
    },
    {
        id: 'producao_upload',
        pageKey: 'producao_upload',
        path: '/producao/upload',
        titleKey: 'inicio.cards.productionUpload.title',
        descKey: 'inicio.cards.productionUpload.desc',
        icon: FiUploadCloud,
    },
    {
        id: 'producao_config',
        pageKey: 'producao_config',
        path: '/producao/config',
        titleKey: 'inicio.cards.productionConfig.title',
        descKey: 'inicio.cards.productionConfig.desc',
        icon: FiSettings,
    },
    {
        id: 'usuarios',
        pageKey: 'usuarios',
        path: '/gerir-utilizadores',
        titleKey: 'inicio.cards.manageUsers.title',
        descKey: 'inicio.cards.manageUsers.desc',
        icon: FiUsers,
    },
    {
        id: 'planejamento_dashboard',
        pageKey: 'planejamento_dashboard',
        path: '/planejamento/dashboard',
        titleKey: 'inicio.cards.planningDashboard.title',
        descKey: 'inicio.cards.planningDashboard.desc',
        icon: FiTrendingUp,
    },
    {
        id: 'planejamento_upload',
        pageKey: 'planejamento_upload',
        path: '/planejamento/upload',
        titleKey: 'inicio.cards.planningUpload.title',
        descKey: 'inicio.cards.planningUpload.desc',
        icon: FiUploadCloud,
    },
    {
        id: 'planejamento_config',
        pageKey: 'planejamento_config',
        path: '/planejamento/config',
        titleKey: 'inicio.cards.planningConfig.title',
        descKey: 'inicio.cards.planningConfig.desc',
        icon: FiSettings,
    },
    {
        id: 'perfil',
        pageKey: '',  // sempre disponível
        path: '/perfil',
        titleKey: 'inicio.cards.profile.title',
        descKey: 'inicio.cards.profile.desc',
        icon: FiUser,
    },
];

// Atalhos padrão (quando usuário não configurou)
const DEFAULT_SHORTCUT_IDS = [
    'maquinas',
    'chamados_abertos',
    'meus_chamados',
    'abrir_chamado',
    'calendario',
    'historico',
];

const STORAGE_KEY = 'home_shortcuts_selection';
const MAX_SHORTCUTS = 8;

interface PermissionsHook {
    canView: (key: string) => boolean;
    canViewAny: (keys: string[]) => boolean;
}

export function useHomeShortcuts(perm: PermissionsHook, isPt: boolean) {
    // Atalhos disponíveis (filtrados por permissão e idioma)
    const availableShortcuts = useMemo(() => {
        return ALL_SHORTCUTS.filter((shortcut) => {
            // Filtro por idioma
            if (shortcut.ptOnly && !isPt) return false;

            // Filtro por permissão
            if (shortcut.pageKey === '') return true; // sempre disponível
            if (Array.isArray(shortcut.pageKey)) {
                return perm.canViewAny(shortcut.pageKey);
            }
            return perm.canView(shortcut.pageKey);
        });
    }, [perm, isPt]);

    // IDs selecionados persistidos
    const [selectedIds, setSelectedIds] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch { /* ignore */ }
        return DEFAULT_SHORTCUT_IDS;
    });

    // Salvar no localStorage quando mudar
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIds));
        } catch { /* ignore */ }
    }, [selectedIds]);

    // Atalhos selecionados (filtrados pelos disponíveis)
    const selectedShortcuts = useMemo(() => {
        const availableIds = new Set(availableShortcuts.map((s) => s.id));
        const validIds = selectedIds.filter((id) => availableIds.has(id));

        // Se nenhum atalho válido, usar defaults filtrados
        if (validIds.length === 0) {
            return availableShortcuts.filter((s) => DEFAULT_SHORTCUT_IDS.includes(s.id));
        }

        return validIds
            .map((id) => availableShortcuts.find((s) => s.id === id))
            .filter((s): s is ShortcutDefinition => s !== undefined);
    }, [selectedIds, availableShortcuts]);

    // Toggle um atalho
    const toggleShortcut = useCallback((id: string) => {
        setSelectedIds((prev) => {
            if (prev.includes(id)) {
                return prev.filter((x) => x !== id);
            }
            if (prev.length >= MAX_SHORTCUTS) {
                return prev; // limite atingido
            }
            return [...prev, id];
        });
    }, []);

    // Resetar para padrão
    const resetToDefaults = useCallback(() => {
        setSelectedIds(DEFAULT_SHORTCUT_IDS);
    }, []);

    // Verificar se um ID está selecionado
    const isSelected = useCallback((id: string) => selectedIds.includes(id), [selectedIds]);

    return {
        availableShortcuts,
        selectedShortcuts,
        selectedIds,
        toggleShortcut,
        resetToDefaults,
        isSelected,
        maxShortcuts: MAX_SHORTCUTS,
        canAddMore: selectedIds.length < MAX_SHORTCUTS,
    };
}

export default useHomeShortcuts;
