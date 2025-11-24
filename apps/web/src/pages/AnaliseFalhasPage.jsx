// AnaliseFalhasPage.jsx
import React, { useState, useEffect, useMemo } from 'react';
import styles from './AnaliseFalhasPage.module.css';

import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

import { useTranslation } from 'react-i18next';
import { listarChamados } from '../services/apiClient';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const AnaliseFalhasPage = () => {
  const { t } = useTranslation();

  const [startDate, setStartDate] = useState(null); // Date | null
  const [endDate, setEndDate]     = useState(null); // Date | null
  const [chamadosCorretivos, setChamadosCorretivos] = useState([]); // sempre array
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        // janela padrão: últimos 90 dias
        const now = new Date();
        const from = startDate ? new Date(startDate) : new Date(now);
        if (!startDate) from.setDate(now.getDate() - 90);
        const to = endDate ? new Date(endDate) : new Date(now);
        to.setHours(23, 59, 59, 999); // incluir o dia final

        const itens = await listarChamados({
          tipo: 'corretiva',
          status: 'Concluido',
          from: from.toISOString(),
          to:   to.toISOString()
        });

        // 🔒 Normalização: aceita {items:[]} OU [].
        const arr = Array.isArray(itens?.items)
          ? itens.items
          : (Array.isArray(itens) ? itens : []);

        if (!alive) return;
        setChamadosCorretivos(arr);
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setChamadosCorretivos([]); // fallback seguro
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [startDate, endDate]);

  const chartData = useMemo(() => {
    const list = Array.isArray(chamadosCorretivos) ? chamadosCorretivos : [];
    const falhasPorMaquina = {};
    for (const chamado of list) {
      const nome = chamado?.maquina ?? '—';
      falhasPorMaquina[nome] = (falhasPorMaquina[nome] || 0) + 1;
    }
    const sorted = Object.entries(falhasPorMaquina).sort(([, a], [, b]) => b - a);
    return {
      labels: sorted.map(([nome]) => nome),
      datasets: [{
        label: t('analiseFalhas.chart.dataset'),
        data: sorted.map(([, count]) => count),
        backgroundColor: '#4B70E2',
        borderColor: '#3a56b3',
        borderWidth: 1
      }]
    };
  }, [chamadosCorretivos, t]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: t('analiseFalhas.chart.title'), font: { size: 18 } }
    },
    scales: {
      x: { title: { display: true, text: t('analiseFalhas.chart.xLabel') } },
      y: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: t('analiseFalhas.chart.yLabel') } }
    }
  }), [t]);

  return (
    <>
      <div className={styles.card}>
        <header className={styles.header}>
          <h1>{t('analiseFalhas.title')}</h1>
        </header>
      </div>

      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.filterContainer}>
            <div>
              <label htmlFor="startDate">{t('analiseFalhas.filters.start')}</label>
              <input
                type="date"
                id="startDate"
                value={startDate ? startDate.toISOString().slice(0,10) : ''}
                onChange={e => setStartDate(e.target.value ? new Date(e.target.value + 'T00:00:00') : null)}
              />
            </div>
            <div>
              <label htmlFor="endDate">{t('analiseFalhas.filters.end')}</label>
              <input
                type="date"
                id="endDate"
                value={endDate ? endDate.toISOString().slice(0,10) : ''}
                onChange={e => setEndDate(e.target.value ? new Date(e.target.value + 'T00:00:00') : null)}
              />
            </div>
            <button
              className={styles.clearButton}
              onClick={() => { setStartDate(null); setEndDate(null); }}
            >
              {t('analiseFalhas.filters.clear')}
            </button>
          </div>

          {loading ? (
            <p>{t('analiseFalhas.loading')}</p>
          ) : (
            <div className={styles.chartContainer}>
              <Bar options={chartOptions} data={chartData} />
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default AnaliseFalhasPage;