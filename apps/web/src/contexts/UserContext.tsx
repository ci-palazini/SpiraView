// src/contexts/UserContext.tsx
import { createContext, useContext } from 'react';
import type { User } from '../App';

const UserContext = createContext<User | null>(null);

/** Retorna o user logado do contexto (ou null se não autenticado). */
export function useUsuario(): User | null {
    return useContext(UserContext);
}

export default UserContext;
