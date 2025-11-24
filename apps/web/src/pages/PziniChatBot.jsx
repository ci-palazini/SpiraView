// apps/web/src/pages/PziniChatBot.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { aiChatSql, aiTextSearch } from '../services/apiClient';

/* ========== helpers (LS, formatação, etc) ========== */
const LS_RECENTS = 'pzini_chat_recents';
const LS_FAVORITES = 'pzini_chat_favorites';
const MAX_RECENTS = 12;

// limite total da faixa (favoritos + recentes)
const MAX_CHIPS_TOTAL = 5;
// limite de caracteres por chip (visual)
const MAX_CHIP_CHARS = 28;

function shortenLabel(s, max = MAX_CHIP_CHARS) {
  const txt = String(s ?? '').trim();
  if (txt.length <= max) return txt;
  return txt.slice(0, max - 1) + '…';
}

function loadLS(key, def = []) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return def;
  }
}
function saveLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function addRecent(q) {
  const now = (q || '').trim();
  if (!now) return;
  const arr = loadLS(LS_RECENTS);
  const out = [now, ...arr.filter((x) => x !== now)].slice(0, MAX_RECENTS);
  saveLS(LS_RECENTS, out);
}
function toggleFavorite(q) {
  const arr = loadLS(LS_FAVORITES);
  const idx = arr.indexOf(q);
  if (idx >= 0) {
    arr.splice(idx, 1);
  } else {
    arr.unshift(q);
  }
  // máximo de 5 favoritos
  const capped = arr.slice(0, MAX_CHIPS_TOTAL);
  saveLS(LS_FAVORITES, capped);
  return capped;
}
function isFavorited(q) {
  return loadLS(LS_FAVORITES).includes(q);
}
function formatMinutes(val) {
  const n = typeof val === 'string' ? Number(val.replace(',', '.')) : Number(val);
  if (!isFinite(n)) return null;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function toCsv(fields, rows) {
  const headers = fields?.length ? fields : Object.keys(rows[0] || {});
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) => headers.map((h) => esc(r[h])).join(','));
  return [headers.map(esc).join(','), ...lines].join('\n');
}
function downloadCsv(filename, fields, rows) {
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
function fallbackSuggestionsFromRows(rows = []) {
  const top = rows.slice(0, 3);
  const ms = top.map((r) => r?.maquina_nome).filter(Boolean);
  const out = [];
  if (ms[0]) {
    out.push(`Quais as principais causas da ${ms[0]} nos últimos 90 dias?`);
    out.push(`MTTR da ${ms[0]} nos últimos 90 dias`);
    out.push(`MTTA da ${ms[0]} nos últimos 90 dias`);
  }
  if (ms[1]) out.push(`Quais as principais causas da ${ms[1]} nos últimos 90 dias?`);
  if (ms[2]) out.push(`Quais as principais causas da ${ms[2]} nos últimos 90 dias?`);
  out.push('/fts vazament');
  return out;
}

/* ========== UI components ========== */
function SummaryCallout({ children }) {
  if (!children) return null;
  return (
    <div style={summaryBox}>
      <div style={summaryDot} />
      <div style={{ lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function DataTable({ rows = [], fields, onCellClick, pageSize = 50 }) {
  const hdrs = useMemo(
    () => (fields?.length ? fields : rows[0] ? Object.keys(rows[0]) : []),
    [rows, fields]
  );
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [rows, fields]);

  if (!rows?.length)
    return <div style={{ color: '#6b7280', fontSize: 14 }}>Sem resultados.</div>;

  const total = rows.length;
  const limited = total > pageSize;
  const slice = limited
    ? rows.slice(page * pageSize, page * pageSize + pageSize)
    : rows;

  return (
    <div style={{ overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
      <table
        style={{
          borderCollapse: 'collapse',
          width: '100%',
          minWidth: 520
        }}
      >
        <thead>
          <tr>
            {hdrs.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderBottom: '1px solid #eee',
                  background: '#fafafa',
                  fontWeight: 600
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slice.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
              {hdrs.map((h) => {
                const v = r[h];
                const txt = v == null ? '—' : String(v);

                if ((/_min$/.test(h) || /^tempo_/.test(h)) && isFinite(Number(v))) {
                  const pretty = formatMinutes(v);
                  if (pretty) {
                    return (
                      <td
                        key={h}
                        title={`${v} min`}
                        style={cellStyle}
                        onClick={() => {}}
                      >
                        {pretty}
                      </td>
                    );
                  }
                }

                const isMachine = h === 'maquina_nome' || /máquina|maquina/.test(h);
                return (
                  <td
                    key={h}
                    style={{
                      ...cellStyle,
                      cursor: isMachine && onCellClick ? 'pointer' : 'default',
                      color:
                        isMachine && onCellClick ? '#2563eb' : undefined
                    }}
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
        <div style={pagerBar}>
          <span style={{ color: '#64748b', fontSize: 12 }}>
            Mostrando {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} de{' '}
            {total}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={page === 0}
              style={pagerBtn}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Anterior
            </button>
            <button
              disabled={(page + 1) * pageSize >= total}
              style={pagerBtn}
              onClick={() =>
                setPage((p) => ((p + 1) * pageSize < total ? p + 1 : p))
              }
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SqlBlock({ sql }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(sql || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  if (!sql) return null;

  return (
    <div style={{ position: 'relative', margin: '8px 0 12px' }}>
      <div
        style={{
          position: 'absolute',
          right: 8,
          top: 8,
          display: 'flex',
          gap: 8
        }}
      >
        <button onClick={copy} title="Copiar SQL" style={btnGhost}>
          {copied ? <FiCheck /> : <FiCopy />}
        </button>
      </div>
      <pre style={preSql}>
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

/* ===== Empty state moderno (só antes do 1º prompt) ===== */
function EmptyStarter({ onPick }) {
  const items = [
    {
      label: 'As 5 máquinas com mais chamados',
      icon: <FiBarChart2 />,
      q: 'As 5 máquinas com mais chamados'
    },
    {
      label: 'Principais causas por máquina (120d)',
      icon: <FiTool />,
      q: 'Quais as principais causas por máquina nos últimos 120 dias?'
    },
    {
      label: 'Linha de tempo semanal (90d)',
      icon: <FiTrendingUp />,
      q: 'Linha de tempo semanal dos chamados nos últimos 90 dias'
    },
    {
      label: 'Quais manutentores mais atenderam?',
      icon: <FiSearch />,
      q: 'Quais manutentores mais atenderam chamados?'
    }
  ];

  return (
    <div style={emptyWrap}>
      <div style={emptyHeader}>
        <div style={badgeIconLg}>
          <FiMessageSquare />
        </div>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>Comece por aqui</h3>
          <div style={{ color: '#64748b', fontSize: 13 }}>
            Selecione um exemplo ou digite sua pergunta abaixo.{' '}
            <span style={kbd}>Enter</span> envia.
          </div>
        </div>
      </div>

      <div style={suggestGrid}>
        {items.map((it, i) => (
          <button
            key={i}
            className="suggestCard"
            onClick={() => onPick(it.q)}
            title={it.q}
          >
            <div className="suggestIcon">{it.icon}</div>
            <div className="suggestText">{it.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ========== main component ========== */
export default function PziniChatBot() {
  const [searchParams] = useSearchParams();
  const [input, setInput] = useState(
    'Top 5 máquinas por número de chamados nos últimos 90 dias'
  );
  const [noCache, setNoCache] = useState(true);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      type: 'text',
      content:
        'Oi! Posso responder perguntas como:\n' +
        '• Top 5 máquinas por número de chamados\n' +
        '• Principais causas por máquina nos últimos 120 dias\n' +
        '• Quantos chamados há para cada status\n\n' +
        'Dica: use **/fts termo** para busca textual nas observações.'
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState(() => loadLS(LS_RECENTS));
  const [favorites, setFavorites] = useState(() => loadLS(LS_FAVORITES));
  const [historyIndex, setHistoryIndex] = useState(-1);
  const chatRef = useRef(null);

  // Pré-preenche por URL ?q=&auto=1
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

  function pushUser(text) {
    setMessages((m) => [...m, { role: 'user', type: 'text', content: text }]);
  }

  function pushSqlResult({ sql, rows, fields, ms, mode, summary, suggestions }) {
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

  function pushFtsResult({ sql, rows, ms }) {
    setMessages((m) => [
      ...m,
      { role: 'assistant', type: 'fts', sql, rows, ms }
    ]);
  }

  async function handleSend(forcedText) {
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
          content: `⚠️ ${String(e.message || e)}`
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  function toggleSqlAt(index) {
    setMessages((m) =>
      m.map((msg, i) =>
        i === index ? { ...msg, showSql: !msg.showSql } : msg
      )
    );
  }

  function onKeyDown(e) {
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
          'Chat limpo. Faça uma pergunta ou use **/fts termo** para busca textual.'
      }
    ]);
  }

  function useSuggestion(text) {
    setInput(text);
  }

  const favActive = isFavorited(input.trim());
  const hasUserMessage = messages.some((m) => m.role === 'user');

  return (
    <>
      {/* Header em card branco, padrão das outras telas */}
      <header
        style={{
          margin: '16px',
          marginBottom: 0,
          padding: '16px 20px',
          borderRadius: 12,
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={badgeIcon}>
            <FiMessageSquare />
          </div>
          <h1
            style={{
              margin: 0,
              fontWeight: 600,
              fontSize: 20,
              color: '#111827'
            }}
          >
            Pzini - ChatBot
          </h1>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            justifyContent: 'flex-end'
          }}
        >
          <label
            title="Ignorar cache de 30s"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              color: '#4b5563'
            }}
          >
            <input
              type="checkbox"
              checked={noCache}
              onChange={(e) => setNoCache(e.target.checked)}
              style={{ margin: 0 }}
            />
            <span>sem cache</span>
          </label>

          <button
            onClick={() => {
              const q = input.trim();
              if (!q) return;
              setFavorites(toggleFavorite(q));
            }}
            style={{
              ...btnGhost,
              color: favActive ? '#eab308' : undefined
            }}
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
            style={btnGhost}
            title="Novo chat"
          >
            <FiTrash2 />
          </button>
        </div>
      </header>

      {/* Card principal do chat */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          padding: '12px 16px 16px',
          margin: '16px',
          marginTop: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          minHeight: 0
        }}
      >
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
              <div style={chipRow}>
                {visibleFavs.length > 0 && (
                  <span
                    style={{
                      fontSize: 12,
                      color: '#64748b',
                      marginRight: 6
                    }}
                  >
                    Favoritos:
                  </span>
                )}
                {visibleFavs.map((q, idx) => (
                  <button
                    key={'fav' + idx}
                    className="chip chip--truncate"
                    onClick={() => setInput(q)}
                    title={q}
                  >
                    <FiStar
                      style={{
                        marginRight: 6,
                        color: '#eab308'
                      }}
                    />
                    {shortenLabel(q)}
                  </button>
                ))}

                {visibleRecents.length > 0 && (
                  <span
                    style={{
                      fontSize: 12,
                      color: '#64748b',
                      margin: '0 6px 0 10px'
                    }}
                  >
                    Recentes:
                  </span>
                )}
                {visibleRecents.map((q, idx) => (
                  <button
                    key={'rec' + idx}
                    className="chip chip--truncate"
                    onClick={() => setInput(q)}
                    title={q}
                  >
                    {shortenLabel(q)}
                  </button>
                ))}

                {hiddenCount > 0 && (
                  <details className="recents-more">
                    <summary className="chip">
                      +{hiddenCount}
                    </summary>
                    <div className="recents-menu">
                      {favorites
                        .slice(visibleFavs.length)
                        .map((q, i) => (
                          <button
                            key={'more-f' + i}
                            onClick={() => setInput(q)}
                            title={q}
                          >
                            ★ {shortenLabel(q, 64)}
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
        <div ref={chatRef} style={chatBox}>
          {/* Empty state de sugestões – só antes do 1º prompt */}
          {!hasUserMessage && !loading && (
            <EmptyStarter onPick={useSuggestion} />
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent:
                  m.role === 'user'
                    ? 'flex-end'
                    : 'flex-start'
              }}
            >
              <div
                style={
                  m.role === 'user'
                    ? userBubble
                    : assistantBubble
                }
              >
                {m.type === 'text' && (
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.5
                    }}
                  >
                    {m.content}
                  </div>
                )}

                {m.type === 'sql' && (
                  <>
                    <div style={metaRow}>
                      <span style={meta}>
                        <FiDatabase
                          style={{ marginRight: 6 }}
                        />
                        SQL
                      </span>
                      {typeof m.ms === 'number' && (
                        <span style={meta}>
                          <FiClock
                            style={{ marginRight: 6 }}
                          />
                          {m.ms} ms
                        </span>
                      )}
                      {m.mode && (
                        <span style={meta}>
                          {String(m.mode)}
                        </span>
                      )}
                      <span style={{ flex: 1 }} />
                      {Array.isArray(m.rows) &&
                        m.rows.length > 0 && (
                          <button
                            onClick={() =>
                              downloadCsv(
                                'resultado.csv',
                                m.fields,
                                m.rows
                              )
                            }
                            style={linkBtn}
                            title="Exportar CSV"
                          >
                            <FiDownload
                              style={{ marginRight: 6 }}
                            />{' '}
                            Exportar
                          </button>
                        )}
                      <button
                        onClick={() => toggleSqlAt(i)}
                        style={linkBtn}
                        title={
                          m.showSql
                            ? 'Ocultar SQL'
                            : 'Mostrar SQL'
                        }
                      >
                        {m.showSql
                          ? 'Ocultar SQL ▴'
                          : 'Mostrar SQL ▾'}
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
                          `Quais as principais causas da ${maq} nos últimos 90 dias?`
                        );
                      }}
                    />

                    {Array.isArray(m.suggestions) &&
                      m.suggestions.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            flexWrap: 'wrap',
                            marginTop: 10
                          }}
                        >
                          {m.suggestions.map((s, idx) => (
                            <button
                              key={idx}
                              className="chip"
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
                    <div style={metaRow}>
                      <span style={meta}>
                        <FiSearch
                          style={{ marginRight: 6 }}
                        />
                        FTS
                      </span>
                      {typeof m.ms === 'number' && (
                        <span style={meta}>
                          <FiClock
                            style={{ marginRight: 6 }}
                          />
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-start'
              }}
            >
              <div style={assistantBubble}>Gerando…</div>
            </div>
          )}
        </div>

        {/* Input fixo dentro do card */}
        <div style={inputBar}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Escreva sua pergunta…  (dica: /fts vazament)  —  ↑/↓ histórico, Ctrl/⌘+Enter envia"
            style={inputBox}
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            style={sendBtn}
          >
            <FiSend />
          </button>
        </div>
      </div>

      {/* estilos globais para chips / sugestões */}
      <style>{`
        .chip {
          border: 1px solid #e5e7eb;
          background: #fff;
          padding: 6px 10px;
          border-radius: 999px;
          cursor: pointer;
          font-size: 12px;
        }
        .chip:hover { background: #f9fafb; }

        .chip--truncate {
          max-width: 260px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .recents-more { position: relative; display: inline-block; }
        .recents-more > summary { list-style: none; cursor: pointer; }
        .recents-more > summary::-webkit-details-marker { display: none; }
        .recents-menu {
          position: absolute; top: 36px; left: 0;
          background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
          padding: 8px; box-shadow: 0 8px 22px rgba(0,0,0,.08); z-index: 20;
          max-height: 300px; overflow: auto; min-width: 280px;
        }
        .recents-menu > button {
          display: block; width: 100%; text-align: left;
          border: 0; background: transparent; padding: 6px 8px; border-radius: 8px;
          font-size: 12px; cursor: pointer;
        }
        .recents-menu > button:hover { background: #f3f4f6; }

        /* Empty starter */
        .suggestCard {
          display:flex; align-items:center; gap:10px;
          padding:12px 14px; border:1px solid #e5e7eb; background:#fff;
          border-radius:14px; cursor:pointer; text-align:left;
          box-shadow:0 1px 1px rgba(0,0,0,.02);
        }
        .suggestCard:hover { background:#f8fafc; border-color:#dbeafe; }
        .suggestIcon {
          width:28px; height:28px; display:grid; place-items:center;
          border-radius:8px; background:#eef2ff; color:#3730a3;
          flex:0 0 auto;
        }
        .suggestText { font-size:13px; color:#111827; }
      `}</style>
    </>
  );
}

/* ===== estilos inline ===== */
const badgeIcon = {
  width: 34,
  height: 34,
  borderRadius: 10,
  display: 'grid',
  placeItems: 'center',
  background: '#eef2ff',
  color: '#3730a3'
};
const badgeIconLg = {
  width: 42,
  height: 42,
  borderRadius: 12,
  display: 'grid',
  placeItems: 'center',
  background: '#eef2ff',
  color: '#3730a3'
};
const chipRow = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  alignItems: 'center',
  flex: '0 0 auto'
};

const chatBox = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  background: '#fff',
  padding: 12,
  flex: '1 1 auto',
  minHeight: 260,
  maxHeight: '60vh',
  overflowY: 'auto'
};

const bubbleBase = {
  maxWidth: 920,
  padding: '12px 14px',
  borderRadius: 14,
  margin: '10px 0',
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  lineHeight: 1.5,
  fontSize: 14
};
const assistantBubble = {
  ...bubbleBase,
  background: '#f8fafc',
  border: '1px solid #eef2f7'
};
const userBubble = {
  ...bubbleBase,
  background: '#e0ecff',
  border: '1px solid #c7ddff'
};

const inputBar = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  paddingTop: 8,
  flex: '0 0 auto'
};
const inputBox = {
  flex: 1,
  padding: '12px 14px',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  outline: 'none'
};
const sendBtn = {
  width: 44,
  height: 44,
  borderRadius: 12,
  border: '1px solid #2563eb',
  background: '#3b82f6',
  color: '#fff',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer'
};
const btnGhost = {
  width: 36,
  height: 36,
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  background: '#fff',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer'
};
const preSql = {
  background: '#0b1021',
  color: '#d1d5db',
  padding: 12,
  borderRadius: 10,
  overflow: 'auto',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 13,
  border: '1px solid #0f172a'
};
const metaRow = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  marginBottom: 6
};
const meta = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: '#64748b'
};
const summaryBox = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  border: '1px solid #dbeafe',
  background: '#eff6ff',
  color: '#1e3a8a',
  padding: '10px 12px',
  borderRadius: 10,
  margin: '6px 0 10px'
};
const summaryDot = {
  width: 8,
  height: 8,
  borderRadius: 9999,
  background: '#2563eb',
  marginTop: 6,
  flex: '0 0 auto'
};
const linkBtn = {
  border: 'none',
  background: 'transparent',
  color: '#2563eb',
  cursor: 'pointer',
  fontSize: 13,
  padding: '4px 6px'
};
const pagerBar = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 10px',
  background: '#fafafa',
  borderTop: '1px solid #e5e7eb'
};
const pagerBtn = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  background: '#fff',
  padding: '6px 8px',
  cursor: 'pointer',
  fontSize: 12
};
const cellStyle = {
  padding: '10px 12px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 13
};

const emptyWrap = {
  border: '1px dashed #e5e7eb',
  background: '#fbfbfd',
  borderRadius: 14,
  padding: 16,
  margin: '0 0 12px'
};
const emptyHeader = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 10
};
const suggestGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  gap: 10
};
const kbd = {
  display: 'inline-block',
  border: '1px solid #e5e7eb',
  padding: '1px 6px',
  borderRadius: 6,
  background: '#fff',
  fontFamily: 'ui-monospace, Menlo, Consolas',
  fontSize: 12
};
