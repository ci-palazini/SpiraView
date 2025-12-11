// src/pages/CausasRaizPage.jsx
import React, { useState, useEffect } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer
} from 'recharts';
import styles from './CausasRaizPage.module.css';
import { useTranslation } from 'react-i18next';
import {
  listarCausas,
  criarCausa,
  excluirCausa,
  listarParetoCausas,
} from '../../../services/apiClient';

/* =========================
   CRUD de Causas Raiz
   ========================= */
function CausasCrud({ user }) {
  const { t } = useTranslation();
  const [causas, setCausas] = useState([]);
  const [novoNome, setNovoNome] = useState('');
  const [loading, setLoading] = useState(true);

  // carrega causas
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const resp = await listarCausas();
        const lista = Array.isArray(resp) ? resp : (resp?.items ?? []);
        if (!alive) return;

        // garante sem duplicatas
        const seen = new Set();
        const unique = [];
        for (const it of lista) {
          const key = it.id ?? `nome:${it.nome}`;
          if (!seen.has(key)) {
            seen.add(key);
            unique.push({ id: it.id, nome: it.nome });
          }
        }
        unique.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
        setCausas(unique);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    const nome = (novoNome || '').trim();
    if (!nome) return;
    try {
      const saved = await criarCausa({ nome }, { role: user?.role, email: user?.email });
      setCausas(prev => {
        const semDup = prev.filter(x => (saved.id ? x.id !== saved.id : x.nome !== saved.nome));
        return [...semDup, saved].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
      });
      setNovoNome('');
    } catch (err) {
      console.error(err);
      alert(err?.message || t('common.error', 'Falha ao criar causa'));
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(t('causas.confirm.delete'))) return;

    try {
      let id = item?.id;

      // fallback: procurar o id por nome
      if (!id) {
        const fresh = await listarCausas();
        const found = fresh.find(
          x => (x.nome || '').trim().toLowerCase() === (item?.nome || '').trim().toLowerCase()
        );
        id = found?.id;
      }

      if (!id) {
        alert('Registro sem id');
        return;
      }

      await excluirCausa(id, { role: user?.role, email: user?.email });
      setCausas(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error(err);
      alert(err?.message || 'Falha ao excluir causa');
    }
  };

  return (
    <div>
      <form onSubmit={handleAdd} className={styles.formGroup}>
        <input
          type="text"
          className={styles.input}
          placeholder={t('causas.form.placeholder')}
          value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          required
        />
        <button type="submit" className={styles.button}>
          {t('causas.form.add')}
        </button>
      </form>

      {loading && <p className={styles.muted}>{t('common.loading', 'Carregando...')}</p>}

      {!loading && causas.length === 0 && (
        <p className={styles.muted}>{t('causas.list.empty', 'Nenhuma causa cadastrada')}</p>
      )}

      <ul className={styles.list}>
        {causas.map((c, i) => (
          <li key={c.id ?? `${c.nome}__${i}`} className={styles.listItem}>
            {c.nome}
            <button
              className={styles.deleteButton}
              onClick={() => handleDelete(c)}
              title={t('causas.list.delete')}
            >
              {t('causas.list.delete')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* =========================
   Pareto (usa o endpoint /analytics/pareto-causas)
   ========================= */
function ParetoChart() {
  const { t } = useTranslation();
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        // Sem filtros -> considera todos os chamados concluídos
        const resp = await listarParetoCausas();
        const items = Array.isArray(resp?.items) ? resp.items : (Array.isArray(resp) ? resp : []);
        const data = items.map(it => ({
          causa: it.causa,
          count: Number(it.chamados ?? it.count ?? 0),
          acumPercent: Number(it.pctAcum ?? it.acumPercent ?? 0),
        }));
        if (!alive) return;
        setDados(data);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return <p className={styles.muted}>{t('common.loading', 'Carregando...')}</p>;
  }

  if (!dados.length) {
    return <p className={styles.muted}>{t('causas.chart.empty', 'Sem dados para exibir')}</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={dados}>
        <CartesianGrid stroke="#f5f5f5" />
        <XAxis
          dataKey="causa"
          label={{ value: t('causas.chart.xLabel'), position: 'insideBottom', offset: -5 }}
        />
        <YAxis
          yAxisId="left"
          label={{ value: t('causas.chart.yLeft'), angle: -90, position: 'insideLeft' }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 100]}
          label={{ value: t('causas.chart.yRight'), angle: 90, position: 'insideRight' }}
        />
        <Tooltip />
        <Legend />
        <Bar
          yAxisId="left"
          dataKey="count"
          name={t('causas.chart.seriesCalls')}
          fill="#8884d8"
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="acumPercent"
          name={t('causas.chart.seriesAccumPct')}
          stroke="#ff7300"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* =========================
   Página
   ========================= */
export default function CausasRaizPage({ user }) {
  const { t } = useTranslation();
  return (
    <div className={styles.pageContainer}>
      <section className={styles.crudSection}>
        <h2>{t('causas.titleCrud')}</h2>
        <CausasCrud user={user} />
      </section>
      <section className={styles.chartSection}>
        <h2>{t('causas.titlePareto')}</h2>
        <ParetoChart />
      </section>
    </div>
  );
}
