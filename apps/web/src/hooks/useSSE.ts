/**
 * useSSE — Singleton SSE hook with per-topic debounce.
 *
 * Keeps exactly ONE EventSource connection for the entire app.
 * Components subscribe to topics ('chamados', 'agendamentos', …)
 * and their callbacks are debounced (default 300 ms) so that a
 * burst of events triggers only one re-fetch.
 *
 * Reconnect strategy: exponential backoff starting at 1 s, capped at 30 s.
 * The backoff counter resets on every successful connection (onopen).
 */
import { useEffect, useRef } from 'react';

// --------------- Types ---------------
export type SSETopic = 'chamados' | 'agendamentos' | 'checklist' | 'pecas' | 'producao_lancamentos' | 'producao_uploads';

type Callback = () => void;

interface Subscriber {
    id: number;
    cb: Callback;
}

// --------------- Module-level singleton ---------------
const BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000';

let es: EventSource | null = null;
let subscriberIdSeq = 0;
const topicSubscribers = new Map<SSETopic, Subscriber[]>();
const debounceTimers = new Map<SSETopic, ReturnType<typeof setTimeout>>();

const DEBOUNCE_MS = 300;
const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

// --------------- Reconnect backoff state ---------------
let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function getBackoffDelay(): number {
    return Math.min(INITIAL_RETRY_MS * (2 ** retryCount), MAX_RETRY_MS);
}

function cancelReconnect(): void {
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }
}

function scheduleReconnect(): void {
    if (retryTimer) return; // already scheduled

    // Don't reconnect if nobody is subscribed
    let total = 0;
    topicSubscribers.forEach((subs) => { total += subs.length; });
    if (total === 0) return;

    const delay = getBackoffDelay();
    retryTimer = setTimeout(() => {
        retryTimer = null;
        ensureConnection();
    }, delay);
}

/** Notify all subscribers for a given topic (debounced). */
function notifyTopic(topic: SSETopic) {
    // Clear any existing timer for this topic
    const existing = debounceTimers.get(topic);
    if (existing) clearTimeout(existing);

    debounceTimers.set(
        topic,
        setTimeout(() => {
            debounceTimers.delete(topic);
            const subs = topicSubscribers.get(topic);
            if (subs) {
                subs.forEach((s) => {
                    try { s.cb(); } catch { /* ignore */ }
                });
            }
        }, DEBOUNCE_MS),
    );
}

/** Ensure the singleton EventSource is alive. */
function ensureConnection() {
    if (es && es.readyState !== EventSource.CLOSED) return;

    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    es = new EventSource(`${BASE}/events`, { withCredentials: false });

    es.onopen = () => {
        // Successful connection — reset backoff counter
        retryCount = 0;
    };

    es.onmessage = (ev) => {
        if (!ev?.data) return;
        try {
            const data = JSON.parse(ev.data);
            const topic = data?.topic as SSETopic | undefined;
            if (topic && topicSubscribers.has(topic)) {
                notifyTopic(topic);
            }
        } catch { /* ignore parse errors */ }
    };

    // Also listen for named events (the server may emit named events)
    const topics: SSETopic[] = ['chamados', 'agendamentos', 'checklist', 'pecas', 'producao_lancamentos', 'producao_uploads'];
    topics.forEach((topic) => {
        es!.addEventListener(topic, () => {
            notifyTopic(topic);
        });
    });

    es.onerror = () => {
        // Close the broken connection; EventSource auto-reconnects would hammer the
        // server — take manual control with exponential backoff instead.
        try { es?.close(); } catch { /* ignore */ }
        es = null;
        retryCount++;
        scheduleReconnect();
    };
}

/** Close singleton if no subscribers remain. */
function maybeClose() {
    let total = 0;
    topicSubscribers.forEach((subs) => { total += subs.length; });
    if (total === 0 && es) {
        cancelReconnect();
        try { es.close(); } catch { /* ignore */ }
        es = null;
        retryCount = 0;
    }
}

function subscribe(topic: SSETopic, cb: Callback): () => void {
    const id = ++subscriberIdSeq;
    const subs = topicSubscribers.get(topic) || [];
    subs.push({ id, cb });
    topicSubscribers.set(topic, subs);

    ensureConnection();

    return () => {
        const current = topicSubscribers.get(topic);
        if (current) {
            topicSubscribers.set(topic, current.filter((s) => s.id !== id));
        }
        maybeClose();
    };
}

// --------------- React Hook ---------------

/**
 * Subscribe to an SSE topic.  The `callback` will be called (debounced)
 * whenever the server emits an event for that topic.
 *
 * The callback reference is kept up-to-date via a ref so that
 * re-renders do NOT create new subscriptions.
 *
 * @example
 *   useSSE('chamados', () => { loadChamados(); });
 */
export default function useSSE(topic: SSETopic, callback: Callback): void {
    const cbRef = useRef(callback);
    cbRef.current = callback;

    useEffect(() => {
        const unsubscribe = subscribe(topic, () => cbRef.current());
        return unsubscribe;
    }, [topic]);
}
