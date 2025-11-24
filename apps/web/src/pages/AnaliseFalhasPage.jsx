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
  Legend,
} from 'chart.js';

import { useTranslation } from 'react-i18next';
import { listarChamados } from '../services/apiClient';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const AnaliseFalhasPage = () => {
  const { t } = useTranslation();

  const [startDate, setStartDate] = useState(null); // Date | null
  const [endDate, setEndDate]     = useState(null); // Date | null
  const [chamadosCorretivos, setChamadosCorretivos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        // janela padrão: últimos 90 dias
        const now = new Date();
        const from = startDate ? new Date(startDate) : new Date(now);
        if (!startDate) {
          from.setDate(now.getDate() - 90);
        }

        const to = endDate ? new Date(endDate) : new Date(now);
        to.setHours(23, 59, 59, 999); // incluir o dia final

        const res = await listarChamados({
          tipo: 'corretiva',
          status: 'Concluido',
          from: from.toISOString(),
          to:   to.toISOString(),
        });

        const arr = Array.isArray(res?.items)
          ? res.items
          : Array.isArray(res)
          ? res
          : [];

        if (!alive) return;
        setChamadosCorretivos(arr);
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setChamadosCorretivos([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
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
      datasets: [
        {
          label: t('analiseFalhas.chart.dataset'),
          data: sorted.map(([, count]) => count),
          backgroundColor: '#4B70E2',
          borderColor: '#3a56b3',
          borderWidth: 1,
        },
      ],
    };
  }, [chamadosCorretivos, t]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        title: {
          display: true,
          text: t('analiseFalhas.chart.title'),
          font: { size: 16 },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: t('analiseFalhas.chart.xLabel'),
          },
        },
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 },
          title: {
            display: true,
            text: t('analiseFalhas.chart.yLabel'),
          },
        },
      },
    }),
    [t]
  );

  return (
    <>
      {/* Card de header – igual padrão do Histórico */}
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('analiseFalhas.title')}</h1>
        <p className={styles.subtitle}>
          {t(
            'analiseFalhas.subtitle',
            'Veja a distribuição de falhas corretivas por máquina no período selecionado.'
          )}
        </p>
      </header>

      {/* Card principal (filtros + gráfico) */}
      <div className={styles.listContainer}>
        {loading ? (
          <p className={styles.loading}>{t('analiseFalhas.loading')}</p>
        ) : (
          <>
            <div className={styles.filterContainer}>
              <div className={styles.filterField}>
                <label htmlFor="startDate">
                  {t('analiseFalhas.filters.start')}
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate ? startDate.toISOString().slice(0, 10) : ''}
                  onChange={(e) =>
                    setStartDate(
                      e.target.value
                        ? new Date(e.target.value + 'T00:00:00')
                        : null
                    )
                  }
                />
              </div>

              <div className={styles.filterField}>
                <label htmlFor="endDate">
                  {t('analiseFalhas.filters.end')}
                </label>
                <input
                  type="date"
                  id="endDate"
                  value={endDate ? endDate.toISOString().slice(0, 10) : ''}
                  onChange={(e) =>
                    setEndDate(
                      e.target.value
                        ? new Date(e.target.value + 'T00:00:00')
                        : null
                    )
                  }
                />
              </div>

              <button
                type="button"
                className={styles.clearButton}
                onClick={() => {
                  setStartDate(null);
                  setEndDate(null);
                }}
              >
                {t('analiseFalhas.filters.clear')}
              </button>
            </div>

            <div className={styles.chartContainer}>
              <Bar options={chartOptions} data={chartData} />
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default AnaliseFalhasPage;
