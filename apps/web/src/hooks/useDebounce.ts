import { useState, useEffect } from 'react';

/**
 * Hook que retorna uma versão debounced de um valor.
 * Útil para delays em buscas, validações, etc.
 *
 * @param value Valor a ser debounced
 * @param delayMs Delay em milissegundos
 * @returns Valor debounced
 */
function useDebounce<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState<T>(value);

    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(id);
    }, [value, delayMs]);

    return debounced;
}

export default useDebounce;
