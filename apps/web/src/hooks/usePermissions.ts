// src/hooks/usePermissions.ts
import { useMemo } from 'react';
import type { NivelPermissao } from '../services/apiClient';

export interface UserWithPermissions {
    role?: string;
    email?: string;
    permissoes?: Record<string, NivelPermissao>;
}

/**
 * Hook para verificar permissões do usuário baseado no sistema granular de roles.
 * 
 * @param user - Objeto do usuário com permissões
 * @returns Funções utilitárias para verificar permissões
 */
export function usePermissions(user: UserWithPermissions | null | undefined) {
    return useMemo(() => {
        const permissions = user?.permissoes || {};
        const role = (user?.role || '').toLowerCase();

        // Admin tem acesso total a tudo
        const isAdmin = role === 'admin';

        return {
            /**
             * Verifica se o usuário pode VER uma página (permissão 'ver' ou 'editar')
             */
            canView: (pageKey: string): boolean => {
                if (isAdmin) return true;
                const perm = permissions[pageKey];
                return perm === 'ver' || perm === 'editar';
            },

            /**
             * Verifica se o usuário pode EDITAR uma página (permissão 'editar')
             */
            canEdit: (pageKey: string): boolean => {
                if (isAdmin) return true;
                const perm = permissions[pageKey];
                return perm === 'editar';
            },

            /**
             * Retorna o nível de permissão para uma página
             */
            getLevel: (pageKey: string): NivelPermissao => {
                if (isAdmin) return 'editar';
                return permissions[pageKey] || 'nenhum';
            },

            /**
             * Verifica se o usuário tem alguma permissão de um conjunto de páginas
             */
            canViewAny: (pageKeys: string[]): boolean => {
                if (isAdmin) return true;
                return pageKeys.some(key => {
                    const perm = permissions[key];
                    return perm === 'ver' || perm === 'editar';
                });
            },

            /**
             * Verifica se o usuário pode editar qualquer uma das páginas
             */
            canEditAny: (pageKeys: string[]): boolean => {
                if (isAdmin) return true;
                return pageKeys.some(key => permissions[key] === 'editar');
            },

            /**
             * Verifica se é admin
             */
            isAdmin,

            /**
             * Raw permissions object
             */
            permissions,
        };
    }, [user?.permissoes, user?.role]);
}

export default usePermissions;
