// src/features/analytics/pages/PziniChatBot.tsx
import React, { useEffect, useMemo, useRef, useState, KeyboardEvent, ChangeEvent, ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    FiMessageSquare,
    FiSend,
    FiClock,
    FiCopy,
    FiCheck,
    FiTrash2,
    FiDatabase,
    FiSearch,
    FiDownload,
    FiStar,
    FiTrendingUp,
    FiBarChart2,
    FiTool
} from 'react-icons/fi';
import { aiChatSql, aiTextSearch } from '../../../../services/apiClient';
import styles from './PziniChatBot.module.css';

// ---------- Types ----------
interface MessageBase {
    role: 'user' | 'assistant';
}

interface TextMessage extends MessageBase {
    type: 'text';
    content: string;
}

interface SqlMessage extends MessageBase {
    type: 'sql';
    sql?: string;
    rows?: Record<string, unknown>[];
    fields?: string[];
    ms?: number;
    mode?: string;
    summary?: string;
    suggestions?: string[];
    showSql: boolean;
}

interface FtsMessage extends MessageBase {
    type: 'fts';
    sql?: string;
    rows?: Record<string, unknown>[];
    ms?: number;
}

type Message = TextMessage | SqlMessage | FtsMessage;

interface CellClickParams {
    column: string;
    value: string;
    row: Record<string, unknown>;
}

interface SuggestionItem {
    label: string;
    icon: ReactNode;
    q: string;
}

interface User {
    id: string;
    nome?: string;
    email?: string;
    role?: string;
    funcao?: string;
}

export interface PziniChatBotProps {
    user?: User;
}

// ---------- Helpers (LS, formataÃ§Ã£o, etc) ----------
const LS_RECENTS = 'pzini_chat_recents';
const LS_FAVORITES = 'pzini_chat_favorites';
const MAX_RECENTS = 12;
const MAX_CHIPS_TOTAL = 5;
const MAX_CHIP_CHARS = 28;

function shortenLabel(s: unknown, max = MAX_CHIP_CHARS): string {
    const txt = String(s ?? '').trim();
    if (txt.length <= max) return txt;
    return txt.slice(0, max - 3) + '...';
}

function loadLS(key: string, def: string[] = []): string[] {
    try {
        return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
        return def;
    }
}

function saveLS(key: string, value: string[]): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch { /* ignore */ }
}

function addRecent(q: string): void {
    const now = (q || '').trim();
    if (!now) return;
    const arr = loadLS(LS_RECENTS);
    const out = [now, ...arr.filter((x) => x !== now)].slice(0, MAX_RECENTS);
    saveLS(LS_RECENTS, out);
}

function toggleFavorite(q: string): string[] {
    const arr = loadLS(LS_FAVORITES);
    const idx = arr.indexOf(q);
    if (idx >= 0) {
        arr.splice(idx, 1);
    } else {
        arr.unshift(q);
    }
    const capped = arr.slice(0, MAX_CHIPS_TOTAL);
    saveLS(LS_FAVORITES, capped);
    return capped;
}

function isFavorited(q: string): boolean {
    return loadLS(LS_FAVORITES).includes(q);
}

function formatMinutes(val: unknown): string | null {
    const n = typeof val === 'string' ? Number(val.replace(',', '.')) : Number(val);
    if (!isFinite(n)) return null;
    const h = Math.floor(n / 60);
    const m = Math.round(n % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function toCsv(fields: string[] | undefined, rows: Record<string, unknown>[]): string {
    const headers = fields?.length ? fields : Object.keys(rows[0] || {});
    const esc = (s: unknown): string => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((r) => headers.map((h) => esc(r[h])).join(','));
    return [headers.map(esc).join(','), ...lines].join('\n');
}

function downloadCsv(filename: string, fields: string[] | undefined, rows: Record<string, unknown>[]): void {
    const blob = new Blob([toCsv(fields, rows)], {
        type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'dados.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function fallbackSuggestionsFromRows(rows: Record<string, unknown>[] = []): string[] {
    const top = rows.slice(0, 3);
    const ms = top.map((r) => r?.maquina_nome as string).filter(Boolean);
    const out: string[] = [];
    if (ms[0]) {
        out.push(`Quais as principais causas da ${ms[0]} nos Ãºltimos 90 dias?`);
        out.push(`MTTR da ${ms[0]} nos Ãºltimos 90 dias`);
        out.push(`MTTA da ${ms[0]} nos Ãºltimos 90 dias`);
    }
    if (ms[1]) out.push(`Quais as principais causas da ${ms[1]} nos Ãºltimos 90 dias?`);
    if (ms[2]) out.push(`Quais as principais causas da ${ms[2]} nos Ãºltimos 90 dias?`);
    out.push('/fts vazamento');
    return out;
}

// ---------- UI Components ----------
interface SummaryCalloutProps {
    children?: ReactNode;
}

function SummaryCallout({ children }: SummaryCalloutProps) {
    if (!children) return null;
    return (
        <div className={styles.summaryBox}>
            <div className={styles.summaryDot} />
            <div className={styles.summaryText}>{children}</div>
        </div>
    );
}

interface DataTableProps {
    rows?: Record<string, unknown>[];
    fields?: string[];
    onCellClick?: (params: CellClickParams) => void;
    pageSize?: number;
}

function DataTable({ rows = [], fields, onCellClick, pageSize = 50 }: DataTableProps) {
    const hdrs = useMemo(
        () => (fields?.length ? fields : rows[0] ? Object.keys(rows[0]) : []),
        [rows, fields]
    );
    const [page, setPage] = useState(0);

    useEffect(() => {
        setPage(0);
    }, [rows, fields]);

    if (!rows?.length) return <div className={styles.emptyText}>Sem resultados.</div>;

    const total = rows.length;
    const limited = total > pageSize;
    const slice = limited
        ? rows.slice(page * pageSize, page * pageSize + pageSize)
        : rows;

    return (
        <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
                <thead>
                    <tr>
                        {hdrs.map((h) => (
                            <th key={h}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {slice.map((r, i) => (
                        <tr key={i}>
                            {hdrs.map((h) => {
                                const v = r[h];
                                const txt = v == null ? 'â€”' : String(v);

                                if ((/_min$/.test(h) || /^tempo_/.test(h)) && isFinite(Number(v))) {
                                    const pretty = formatMinutes(v);
                                    if (pretty) {
                                        return (
                                            <td key={h} title={`${v} min`} className={styles.cell}>
                                                {pretty}
                                            </td>
                                        );
                                    }
                                }

                                const isMachine = h === 'maquina_nome' || /mÃ¡quina|maquina/.test(h);
                                const cellClass = [
                                    styles.cell,
                                    isMachine && onCellClick ? styles.cellLink : ''
                                ]
                                    .filter(Boolean)
                                    .join(' ');
                                return (
                                    <td
                                        key={h}
                                        className={cellClass}
                                        onClick={() =>
                                            isMachine &&
                                            onCellClick?.({
                                                column: h,
                                                value: txt,
                                                row: r
                                            })
                                        }
                                        title={isMachine ? 'Ver causas / MTTR / MTTA' : undefined}
                                    >
                                        {txt}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>

            {limited && (
                <div className={styles.pagerBar}>
                    <span className={styles.pagerText}>
                        Mostrando {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} de{' '}
                        {total}
                    </span>
                    <div className={styles.pagerButtons}>
                        <button
                            disabled={page === 0}
                            className={styles.pagerBtn}
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                        >
                            Anterior
                        </button>
                        <button
                            disabled={(page + 1) * pageSize >= total}
                            className={styles.pagerBtn}
                            onClick={() =>
                                setPage((p) => ((p + 1) * pageSize < total ? p + 1 : p))
                            }
                        >
                            PrÃ³xima
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

interface SqlBlockProps {
    sql?: string;
}

function SqlBlock({ sql }: SqlBlockProps) {
    const [copied, setCopied] = useState(false);

    async function copy() {
        try {
            await navigator.clipboard.writeText(sql || '');
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* ignore */ }
    }

    if (!sql) return null;

    return (
        <div className={styles.sqlBlock}>
            <div className={styles.sqlActions}>
                <button onClick={copy} title="Copiar SQL" className={styles.btnGhost}>
                    {copied ? <FiCheck /> : <FiCopy />}
                </button>
            </div>
            <pre className={styles.preSql}>
                SELECT
                {sql
                    .trim()
                    .split('\n')
                    .map((l) => '  ' + l)
                    .join('\n')}
            </pre>
        </div>
    );
}

// ---------- Empty State ----------
interface EmptyStarterProps {
    onPick: (q: string) => void;
}

function EmptyStarter({ onPick }: EmptyStarterProps) {
    const items: SuggestionItem[] = [
        {
            label: 'As 5 mÃ¡quinas com mais chamados',
            icon: <FiBarChart2 />,
            q: 'As 5 mÃ¡quinas com mais chamados'
        },
        {
            label: 'Principais causas por mÃ¡quina (120d)',
            icon: <FiTool />,
            q: 'Quais as principais causas por mÃ¡quina nos Ãºltimos 120 dias?'
        },
        {
            label: 'Linha de tempo semanal (90d)',
            icon: <FiTrendingUp />,
            q: 'Linha de tempo semanal dos chamados nos Ãºltimos 90 dias'
        },
        {
            label: 'Quais manutentores mais atenderam?',
            icon: <FiSearch />,
            q: 'Quais manutentores mais atenderam chamados?'
        }
    ];

    return (
        <div className={styles.emptyWrap}>
            <div className={styles.emptyHeader}>
                <div className={styles.badgeIconLg}>
                    <FiMessageSquare />
                </div>
                <div>
                    <h3 className={styles.emptyTitle}>Comece por aqui</h3>
                    <div className={styles.emptySubtext}>
                        Selecione um exemplo ou digite sua pergunta abaixo.{' '}
                        <span className={styles.kbd}>Enter</span> envia.
                    </div>
                </div>
            </div>

            <div className={styles.suggestGrid}>
                {items.map((it, i) => (
                    <button
                        key={i}
                        className={styles.suggestCard}
                        onClick={() => onPick(it.q)}
                        title={it.q}
                    >
                        <div className={styles.suggestIcon}>{it.icon}</div>
                        <div className={styles.suggestText}>{it.label}</div>
                    </button>
                ))}
            </div>
        </div>
    );
}

// ---------- Main Component ----------
export default function PziniChatBot(_props: PziniChatBotProps) {
    const [searchParams] = useSearchParams();
    const [input, setInput] = useState(
        'Top 5 mÃ¡quinas por nÃºmero de chamados nos Ãºltimos 90 dias'
    );
    const [noCache, setNoCache] = useState(true);
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'assistant',
            type: 'text',
            content:
                'Oi! Posso responder perguntas como:\n' +
                'â€¢ Top 5 mÃ¡quinas por nÃºmero de chamados\n' +
                'â€¢ Principais causas por mÃ¡quina nos Ãºltimos 120 dias\n' +
                'â€¢ Quantos chamados hÃ¡ para cada status\n\n' +
                'Dica: use **/fts termo** para busca textual nas observaÃ§Ãµes.'
        }
    ]);
    const [loading, setLoading] = useState(false);
    const [recents, setRecents] = useState<string[]>(() => loadLS(LS_RECENTS));
    const [favorites, setFavorites] = useState<string[]>(() => loadLS(LS_FAVORITES));
    const [historyIndex, setHistoryIndex] = useState(-1);
    const chatRef = useRef<HTMLDivElement>(null);

    // PrÃ©-preenche por URL ?q=&auto=1
    useEffect(() => {
        const q = (searchParams.get('q') || '').trim();
        const auto = (searchParams.get('auto') || '') === '1';
        if (q) {
            setInput(q);
            if (auto) handleSend(q);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        chatRef.current?.scrollTo({
            top: chatRef.current.scrollHeight,
            behavior: 'smooth'
        });
    }, [messages, loading]);

    function pushUser(text: string) {
        setMessages((m) => [...m, { role: 'user', type: 'text', content: text }]);
    }

    interface SqlResultParams {
        sql?: string;
        rows?: Record<string, unknown>[];
        fields?: string[];
        ms?: number;
        mode?: string;
        summary?: string;
        suggestions?: string[];
    }

    function pushSqlResult({ sql, rows, fields, ms, mode, summary, suggestions }: SqlResultParams) {
        const sug =
            Array.isArray(suggestions) && suggestions.length
                ? suggestions
                : fallbackSuggestionsFromRows(rows);
        setMessages((m) => [
            ...m,
            {
                role: 'assistant',
                type: 'sql',
                sql,
                rows,
                fields,
                ms,
                mode,
                summary,
                suggestions: sug,
                showSql: false
            }
        ]);
    }

    interface FtsResultParams {
        sql?: string;
        rows?: Record<string, unknown>[];
        ms?: number;
    }

    function pushFtsResult({ sql, rows, ms }: FtsResultParams) {
        setMessages((m) => [
            ...m,
            { role: 'assistant', type: 'fts', sql, rows, ms }
        ]);
    }

    async function handleSend(forcedText?: string) {
        const text = (forcedText ?? input).trim();
        if (!text || loading) return;

        setInput('');
        addRecent(text);
        setRecents(loadLS(LS_RECENTS));
        setHistoryIndex(-1);

        pushUser(text);
        setLoading(true);

        const t0 = performance.now();
        try {
            const m = text.match(/^\/?fts[:\s]+(.+)$/i);
            if (m) {
                const r = await aiTextSearch({ q: m[1], limit: 12 });
                const ms = Math.round(performance.now() - t0);
                pushFtsResult({ sql: r.sql, rows: r.rows, ms });
            } else {
                const r = await aiChatSql({ question: text, noCache });
                const ms = Math.round(performance.now() - t0);
                pushSqlResult({
                    sql: r.sql,
                    rows: r.rows,
                    fields: r.fields,
                    ms,
                    mode: r.source,
                    summary: r.summary,
                    suggestions: r.suggestions
                });
            }
        } catch (e) {
            setMessages((m) => [
                ...m,
                {
                    role: 'assistant',
                    type: 'text',
                    content: `âš ï¸ ${String((e as Error).message || e)}`
                }
            ]);
        } finally {
            setLoading(false);
        }
    }

    function toggleSqlAt(index: number) {
        setMessages((m) =>
            m.map((msg, i) =>
                i === index && msg.type === 'sql' ? { ...msg, showSql: !msg.showSql } : msg
            )
        );
    }

    function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
            return;
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSend();
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            const arr = loadLS(LS_RECENTS);
            if (!arr.length) return;
            const next = Math.min(
                historyIndex < 0 ? 0 : historyIndex + 1,
                arr.length - 1
            );
            setHistoryIndex(next);
            setInput(arr[next]);
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const arr = loadLS(LS_RECENTS);
            if (!arr.length) return;
            const next = Math.max(historyIndex - 1, -1);
            setHistoryIndex(next);
            setInput(next === -1 ? '' : arr[next]);
        }
    }

    function clearChat() {
        setMessages([
            {
                role: 'assistant',
                type: 'text',
                content:
                    'Chat limpo. FaÃ§a uma pergunta ou use **/fts termo** para busca textual.'
            }
        ]);
    }

    function useSuggestion(text: string) {
        setInput(text);
    }

    const favActive = isFavorited(input.trim());
    const hasUserMessage = messages.some((m) => m.role === 'user');

    return (
        <>
            {/* Header em card branco, padrÃ£o das outras telas */}
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <div className={styles.badgeIcon}>
                        <FiMessageSquare />
                    </div>
                    <h1 className={styles.title}>
                        Pzini - ChatBot
                    </h1>
                </div>

                <div className={styles.headerActions}>
                    <label
                        title="Ignorar cache de 30s"
                        className={styles.checkboxLabel}
                    >
                        <input
                            type="checkbox"
                            checked={noCache}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setNoCache(e.target.checked)}
                            className={styles.checkboxInput}
                        />
                        <span>sem cache</span>
                    </label>

                    <button
                        onClick={() => {
                            const q = input.trim();
                            if (!q) return;
                            setFavorites(toggleFavorite(q));
                        }}
                        className={styles.btnGhost}
                        style={{ color: favActive ? '#eab308' : undefined }}
                        title={
                            favActive
                                ? 'Remover dos favoritos'
                                : 'Favoritar pergunta atual'
                        }
                    >
                        <FiStar />
                    </button>

                    <button
                        onClick={clearChat}
                        className={styles.btnGhost}
                        title="Novo chat"
                    >
                        <FiTrash2 />
                    </button>
                </div>
            </header>

            {/* Card principal do chat */}
            <div className={styles.chatCard}>
                {/* Favoritos + Recentes (total 5) */}
                {(favorites.length > 0 || recents.length > 0) &&
                    (() => {
                        const favCap = Math.min(
                            favorites.length,
                            MAX_CHIPS_TOTAL
                        );
                        const recentCap = Math.max(
                            0,
                            MAX_CHIPS_TOTAL - favCap
                        );
                        const visibleFavs = favorites.slice(0, favCap);
                        const recentsNoDup = recents.filter(
                            (q) => !visibleFavs.includes(q)
                        );
                        const visibleRecents = recentsNoDup.slice(
                            0,
                            recentCap
                        );
                        const hiddenCount =
                            favorites.length - visibleFavs.length +
                            (recentsNoDup.length - visibleRecents.length);

                        return (
                            <div className={styles.chipRow}>
                                {visibleFavs.length > 0 && (
                                    <span className={`${styles.chipLabel} ${styles.chipLabelRight}`}>
                                        Favoritos:
                                    </span>
                                )}
                                {visibleFavs.map((q, idx) => (
                                    <button
                                        key={'fav' + idx}
                                        className={`${styles.chip} ${styles.chipTruncate}`}
                                        onClick={() => setInput(q)}
                                        title={q}
                                    >
                                        <FiStar className={styles.iconLeft} style={{ color: '#eab308' }} />
                                        {shortenLabel(q)}
                                    </button>
                                ))}

                                {visibleRecents.length > 0 && (
                                    <span className={`${styles.chipLabel} ${styles.chipLabelSpacer}`}>
                                        Recentes:
                                    </span>
                                )}
                                {visibleRecents.map((q, idx) => (
                                    <button
                                        key={'rec' + idx}
                                        className={`${styles.chip} ${styles.chipTruncate}`}
                                        onClick={() => setInput(q)}
                                        title={q}
                                    >
                                        {shortenLabel(q)}
                                    </button>
                                ))}

                                {hiddenCount > 0 && (
                                    <details className={styles.recentsMore}>
                                        <summary className={styles.chip}>
                                            +{hiddenCount}
                                        </summary>
                                        <div className={styles.recentsMenu}>
                                            {favorites
                                                .slice(visibleFavs.length)
                                                .map((q, i) => (
                                                    <button
                                                        key={'more-f' + i}
                                                        onClick={() => setInput(q)}
                                                        title={q}
                                                    >
                                                        â˜… {shortenLabel(q, 64)}
                                                    </button>
                                                ))}
                                            {recentsNoDup
                                                .slice(visibleRecents.length)
                                                .map((q, i) => (
                                                    <button
                                                        key={'more-r' + i}
                                                        onClick={() => setInput(q)}
                                                        title={q}
                                                    >
                                                        {shortenLabel(q, 64)}
                                                    </button>
                                                ))}
                                        </div>
                                    </details>
                                )}
                            </div>
                        );
                    })()}

                {/* Chat */}
                <div ref={chatRef} className={styles.chatBox}>
                    {/* Empty state de sugestÃµes â€“ sÃ³ antes do 1Âº prompt */}
                    {!hasUserMessage && !loading && (
                        <EmptyStarter onPick={useSuggestion} />
                    )}

                    {messages.map((m, i) => (
                        <div
                            key={i}
                            className={`${styles.messageRow} ${m.role === 'user' ? styles.messageRowUser : styles.messageRowAssistant
                                }`}
                        >
                            <div
                                className={`${styles.bubble} ${m.role === 'user' ? styles.userBubble : styles.assistantBubble
                                    }`}
                            >
                                {m.type === 'text' && (
                                    <div className={styles.messageText}>
                                        {m.content}
                                    </div>
                                )}

                                {m.type === 'sql' && (
                                    <>
                                        <div className={styles.metaRow}>
                                            <span className={styles.meta}>
                                                <FiDatabase className={styles.iconLeft} />
                                                SQL
                                            </span>
                                            {typeof m.ms === 'number' && (
                                                <span className={styles.meta}>
                                                    <FiClock className={styles.iconLeft} />
                                                    {m.ms} ms
                                                </span>
                                            )}
                                            {m.mode && (
                                                <span className={styles.meta}>
                                                    {String(m.mode)}
                                                </span>
                                            )}
                                            <span className={styles.flexSpacer} />
                                            {Array.isArray(m.rows) &&
                                                m.rows.length > 0 && (
                                                    <button
                                                        onClick={() =>
                                                            downloadCsv(
                                                                'resultado.csv',
                                                                m.fields,
                                                                m.rows!
                                                            )
                                                        }
                                                        className={styles.linkBtn}
                                                        title="Exportar CSV"
                                                    >
                                                        <FiDownload className={styles.iconLeft} />{' '}
                                                        Exportar
                                                    </button>
                                                )}
                                            <button
                                                onClick={() => toggleSqlAt(i)}
                                                className={styles.linkBtn}
                                                title={
                                                    m.showSql
                                                        ? 'Ocultar SQL'
                                                        : 'Mostrar SQL'
                                                }
                                            >
                                                {m.showSql
                                                    ? 'Ocultar SQL â–´'
                                                    : 'Mostrar SQL â–¾'}
                                            </button>
                                        </div>

                                        {m.summary && (
                                            <SummaryCallout>
                                                {m.summary}
                                            </SummaryCallout>
                                        )}
                                        {m.showSql && (
                                            <SqlBlock sql={m.sql} />
                                        )}

                                        <DataTable
                                            rows={m.rows}
                                            fields={m.fields}
                                            onCellClick={({ value }) => {
                                                const maq = value.trim();
                                                setInput(
                                                    `Quais as principais causas da ${maq} nos Ãºltimos 90 dias?`
                                                );
                                            }}
                                        />

                                        {Array.isArray(m.suggestions) &&
                                            m.suggestions.length > 0 && (
                                                <div className={styles.suggestionsRow}>
                                                    {m.suggestions.map((s, idx) => (
                                                        <button
                                                            key={idx}
                                                            className={styles.chip}
                                                            onClick={() => setInput(s)}
                                                        >
                                                            {s}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                    </>
                                )}

                                {m.type === 'fts' && (
                                    <>
                                        <div className={styles.metaRow}>
                                            <span className={styles.meta}>
                                                <FiSearch className={styles.iconLeft} />
                                                FTS
                                            </span>
                                            {typeof m.ms === 'number' && (
                                                <span className={styles.meta}>
                                                    <FiClock className={styles.iconLeft} />
                                                    {m.ms} ms
                                                </span>
                                            )}
                                        </div>
                                        <SqlBlock sql={m.sql} />
                                        <DataTable rows={m.rows} />
                                    </>
                                )}
                            </div>
                        </div>
                    ))}

                    {loading && (
                        <div className={`${styles.messageRow} ${styles.messageRowAssistant}`}>
                            <div className={`${styles.bubble} ${styles.assistantBubble}`}>Gerando...</div>
                        </div>
                    )}
                </div>

                {/* Input fixo dentro do card */}
                <div className={styles.inputBar}>
                    <input
                        value={input}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Escreva sua pergunta...  (dica: /fts vazamentos)  â€”  â†‘/â†“ histÃ³rico, Ctrl/âŒ˜+Enter envia"
                        className={styles.inputBox}
                    />
                    <button
                        onClick={() => handleSend()}
                        disabled={loading || !input.trim()}
                        className={styles.sendBtn}
                    >
                        <FiSend />
                    </button>
                </div>
            </div>
        </>
    );
}
