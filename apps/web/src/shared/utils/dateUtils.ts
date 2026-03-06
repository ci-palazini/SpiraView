const TZ = 'America/Sao_Paulo';

/**
 * Formata uma string ISO (ou Date) como data curta: DD/MM/AAAA
 * Sempre usa o fuso horário de Brasília, independente do ambiente.
 */
export function formatDate(value: string | Date | null | undefined): string {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleDateString('pt-BR', {
            timeZone: TZ,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    } catch {
        return String(value);
    }
}

/**
 * Formata uma string ISO (ou Date) como data e hora: DD/MM/AAAA, HH:MM:SS
 * Sempre usa o fuso horário de Brasília, independente do ambiente.
 */
export function formatDateTime(value: string | Date | null | undefined): string {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString('pt-BR', {
            timeZone: TZ,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    } catch {
        return String(value);
    }
}

/**
 * Formata uma string ISO (ou Date) como data e hora sem segundos: DD/MM/AAAA, HH:MM
 * Sempre usa o fuso horário de Brasília, independente do ambiente.
 */
export function formatDateTimeShort(value: string | Date | null | undefined): string {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString('pt-BR', {
            timeZone: TZ,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return String(value);
    }
}
