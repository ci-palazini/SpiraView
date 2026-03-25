const TZ = 'America/Sao_Paulo';

/**
 * Formata uma string ISO (ou Date) como data curta: DD/MM/AAAA
 * Sempre usa o fuso horário de Brasília, independente do ambiente.
 *
 * Trata strings no formato YYYY-MM-DD como meia-noite em São Paulo (não UTC),
 * evitando problema de timezone quando há apenas data sem hora.
 */
export function formatDate(value: string | Date | null | undefined): string {
    if (!value) return '—';
    try {
        let dateObj: Date;

        // Se for string no formato YYYY-MM-DD (apenas data, sem hora),
        // parse como meia-noite em São Paulo, não como UTC
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const [year, month, day] = value.split('-').map(Number);
            // Usar UTC mais 3 horas para simular meia-noite em São Paulo
            // (função parse internamente)
            const utcDate = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
            dateObj = utcDate;
        } else {
            dateObj = new Date(value);
        }

        return dateObj.toLocaleDateString('pt-BR', {
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
