import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listarChamadosPorCriador, listarChamados } from '../services/apiClient';
import { subscribeSSE } from '../services/sseClient';
import styles from './MeusChamados.module.css';
import { useTranslation } from 'react-i18next';
import { statusKey } from '../i18n/format';

function tsToDate(ts) {
  if (!ts) return null;
  if (typeof ts === 'string') return new Date(ts.replace(' ', 'T')); // "YYYY-MM-DD HH:MM" -> Date
  if (typeof ts.toDate === 'function') return ts.toDate();
  const d = ts instanceof Date ? ts : new Date(ts);
  return isNaN(d) ? null : d;
}
function byRecent(a, b) {
  const aKey = tsToDate(a.assignedAt) || tsToDate(a.dataAbertura) || 0;
  const bKey = tsToDate(b.assignedAt) || tsToDate(b.dataAbertura) || 0;
  return bKey - aKey;
}
const BADGE_BY_SK = {
  open: 'aberto',
  in_progress: 'emandamento',
  closed: 'concluido'
};

export default function MeusChamados({ user }) {
  const { t, i18n } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [docsAssigned, setDocsAssigned] = useState([]);
  const [docsAtendidos, setDocsAtendidos] = useState([]);
  const [statusFiltro, setStatusFiltro] = useState('ativos'); // 'ativos' | 'todos' | 'concluidos'
  const [busca, setBusca] = useState('');

  const [reloadTick, setReloadTick] = useState(0);

  const email = user?.email;
  const role  = user?.role; // "operador" | "manutentor" | "gestor"

  const dtFmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }),
    [i18n.language]
  );
  const formatDate = (v) => {
    const d = tsToDate(v);
    return d ? dtFmt.format(d) : '—';
  };

  // 1) ATRIBUÍDOS a mim (manutentor/gestor)
  useEffect(() => {
    // Só faz sentido para manutentor/gestor
    if (!email || !(role === 'manutentor' || role === 'gestor')) {
      setDocsAssigned([]);
      setLoading(false); // evita spinner infinito quando operador
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const res = await listarChamados({ manutentorEmail: email, page: 1, pageSize: 100 });
        const rows = res.items ?? res;
        setDocsAssigned(rows.map(r => ({
          id: r.id,
          maquina: r.maquina,
          descricao: r.descricao,
          status: r.status,
          // API ainda não fornece "assignedAt"
          assignedAt: null,
          dataAbertura: r.criado_em
        })));
      } catch (e) {
        console.error('Erro manutentorEmail==user:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [email, role, reloadTick]);

  // SSE para revalidar
  useEffect(() => {
    const unsubscribe = subscribeSSE((msg) => {
      if (msg?.topic === 'chamados') setReloadTick(n => n + 1);
    });
    return () => unsubscribe();
  }, []);

  // 2) ABERTOS por mim (qualquer papel)
  useEffect(() => {
    if (!email) return;
    if (role === 'manutentor') {
      setDocsAtendidos([]);
      return;
    }
    (async () => {
      try {
        const res = await listarChamadosPorCriador(email, 1, 100);
        const rows = res.items ?? res;
        setDocsAtendidos(rows.map(r => ({
          id: r.id,
          maquina: r.maquina,
          descricao: r.descricao,
          status: r.status,
          assignedAt: null,
          dataAbertura: r.criado_em
        })));
      } catch (e) {
        console.error('Erro criadoPorEmail==user:', e);
      }
    })();
  }, [email, reloadTick, role]);

  // Mescla + filtros + ordenação
  const chamados = useMemo(() => {
    const map = new Map();
    const fonte = role === 'manutentor' ? docsAssigned : [...docsAssigned, ...docsAtendidos];
    fonte.forEach(c => map.set(c.id, c));
    let arr = Array.from(map.values());

    if (statusFiltro === 'ativos') {
      arr = arr.filter(c => {
        const sk = statusKey(c.status); // 'open' | 'in_progress' | 'closed' | 'cancelled'
        return sk === 'open' || sk === 'in_progress';
      });
    } else if (statusFiltro === 'concluidos') {
      arr = arr.filter(c => statusKey(c.status) === 'closed');
    }

    const q = busca.trim().toLowerCase();
    if (q) {
      arr = arr.filter(c =>
        (c.maquina || '').toLowerCase().includes(q) ||
        (c.descricao || '').toLowerCase().includes(q)
      );
    }

    arr.sort(byRecent);
    return arr;
  }, [docsAssigned, docsAtendidos, statusFiltro, busca, role]);

  // Se não tiver e-mail (usuário não autenticado direito)
  if (!email) {
    return (
      <>
        <header className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{t('meusChamados.title')}</h1>
          <p className={styles.subtitle}>
            {t(
              'meusChamados.subtitle',
              'Acompanhe os chamados atribuídos ou abertos por você.'
            )}
          </p>
        </header>
        <div className={styles.listContainer}>
          <p className={styles.empty}>{t('meusChamados.loginFirst')}</p>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Faixa branca do título em card, padrão das demais páginas */}
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('meusChamados.title')}</h1>
        <p className={styles.subtitle}>
          {t(
            'meusChamados.subtitle',
            'Acompanhe os chamados atribuídos ou abertos por você.'
          )}
        </p>
      </header>

      {/* Caixa branca do conteúdo */}
      <div className={styles.listContainer}>
        {/* Filtros */}
        <div className={styles.pageHeadActions}>
          <select
            className={styles.select}
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
            title={t('meusChamados.filters.statusTitle')}
          >
            <option value="ativos">{t('meusChamados.filters.active')}</option>
            <option value="todos">{t('meusChamados.filters.all')}</option>
            <option value="concluidos">{t('meusChamados.filters.closed')}</option>
          </select>

          <input
            className={`${styles.search} ${styles.pageSearch}`}
            placeholder={t('meusChamados.filters.searchPlaceholder')}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <footer className={styles.footer}>
          <small>{t('meusChamados.footerTip')}</small>
        </footer>

        {/* Lista/Tabela */}
        {loading ? (
          <p className={styles.loading}>{t('meusChamados.loading')}</p>
        ) : chamados.length === 0 ? (
          <p className={styles.empty}>{t('meusChamados.empty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('meusChamados.table.hash')}</th>
                  <th>{t('meusChamados.table.machine')}</th>
                  <th>{t('meusChamados.table.description')}</th>
                  <th>{t('meusChamados.table.status')}</th>
                  <th>{t('meusChamados.table.assignedAt')}</th>
                  <th>{t('meusChamados.table.openedAt')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {chamados.map((c, idx) => (
                  <tr key={c.id}>
                    <td>{String(idx + 1).padStart(2, '0')}</td>
                    <td>{c.maquina || '—'}</td>
                    <td className={styles.descCell} title={c.descricao || ''}>
                      {(c.descricao || '').slice(0, 80) +
                        ((c.descricao || '').length > 80 ? '…' : '')}
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          styles[BADGE_BY_SK[statusKey(c.status)] || 'badge']
                        }`}
                      >
                        {t(`status.${statusKey(c.status)}`)}
                      </span>
                    </td>
                    <td>{formatDate(c.assignedAt)}</td>
                    <td>{formatDate(c.dataAbertura)}</td>
                    <td>
                      <Link
                        to={`/maquinas/chamado/${c.id}`}
                        className={styles.linkBtn}
                      >
                        {t('meusChamados.table.open')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
