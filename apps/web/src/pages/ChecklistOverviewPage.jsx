// src/pages/ChecklistOverviewPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiCheckCircle, FiAlertTriangle, FiInfo, FiRefreshCw } from 'react-icons/fi';

import { listarMaquinas, getMaquina } from '../services/apiClient';
import { df } from '../i18n/format';
import styles from './ChecklistOverviewPage.module.css';

const ChecklistOverviewPage = ({ user }) => {
  const { t, i18n } = useTranslation();

  const [dateFilter, setDateFilter] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [items, setItems] = useState([]);
  const [onlyPending, setOnlyPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fmtDateTime = useMemo(
    () => df({ dateStyle: 'short', timeStyle: 'short' }),
    [i18n.language]
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const maquinas = await listarMaquinas();
        const detalhes = await Promise.all(
          (maquinas || []).map(async (m) => {
            const det = await getMaquina(m.id);

            const historicoDias = Array.isArray(det.historicoChecklist ?? det.historicoDiario)
              ? (det.historicoChecklist ?? det.historicoDiario)
              : [];

            const submissoes = Array.isArray(det.checklistHistorico)
              ? det.checklistHistorico
              : [];

            const rowDia =
              historicoDias.find((r) => r.dia === dateFilter) || null;

            const turno1Ok = rowDia ? !!rowDia.turno1_ok : false;
            const turno2Ok = rowDia ? !!rowDia.turno2_ok : false;

            const turno1Nomes = String(rowDia?.turno1_operadores || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);

            const turno2Nomes = String(rowDia?.turno2_operadores || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);

            let ultimaSub = null;
            for (const s of submissoes) {
              if (!s.criado_em) continue;
              if (!ultimaSub || String(s.criado_em) > String(ultimaSub.criado_em)) {
                ultimaSub = s;
              }
            }

            return {
              id: m.id,
              nome: m.nome,
              rowDia,
              turno1Ok,
              turno2Ok,
              turno1Nomes,
              turno2Nomes,
              ultimaSub,
            };
          })
        );

        if (!alive) return;

        setItems(
          detalhes.sort((a, b) =>
            String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
          )
        );
      } catch (e) {
        console.error(e);
        if (alive) {
          setError(
            t(
              'checklistOverview.errorLoad',
              'Erro ao carregar dados. Tente novamente.'
            )
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [dateFilter, t]);

  const visibleItems = useMemo(
    () =>
      onlyPending
        ? items.filter((it) => !(it.turno1Ok && it.turno2Ok))
        : items,
    [items, onlyPending]
  );

  const totals = useMemo(() => {
    const total = items.length;
    const t1ok = items.filter((i) => i.turno1Ok).length;
    const t2ok = items.filter((i) => i.turno2Ok).length;
    return { total, t1ok, t2ok };
  }, [items]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const isToday = dateFilter === todayIso;

  const handleDateChange = (e) => setDateFilter(e.target.value);

  const renderStatusBadge = (ok, nomes) => (
    <span
      className={`${styles.statusBadge} ${
        ok ? styles.statusOk : styles.statusPending
      }`}
    >
      {ok ? (
        <>
          <FiCheckCircle />
          <span>{t('checklistOverview.sent', 'Enviado')}</span>
        </>
      ) : (
        <>
          <FiAlertTriangle />
          <span>{t('checklistOverview.missing', 'Pendente')}</span>
        </>
      )}
      {ok && nomes?.length > 0 && (
        <span className={styles.statusNames}>{nomes.join(', ')}</span>
      )}
    </span>
  );

  return (
    <>
      {/* HEADER BRANCO, IGUAL OUTRAS TELAS */}
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>
          {t('checklistOverview.title', 'Checklists diários por máquina')}
        </h1>
        <p className={styles.pageSubtitle}>
          {t(
            'checklistOverview.subtitle',
            'Veja rapidamente se os checklists do 1º e 2º turno foram enviados.'
          )}
        </p>
      </header>

      {/* CORPO DA PÁGINA */}
      <div className={styles.page}>
        {/* Filtros no topo, alinhados à direita */}
        <div className={styles.filtersRow}>
          <div className={styles.filters}>
            <div className={styles.filterBlock}>
              <span className={styles.filterLabel}>
                {t('checklistOverview.date', 'Dia')}
              </span>
              <input
                type="date"
                value={dateFilter}
                onChange={handleDateChange}
                className={styles.dateInput}
              />
            </div>

            <div className={styles.filterBlock}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={onlyPending}
                  onChange={(e) => setOnlyPending(e.target.checked)}
                />
              </label>
              <span className={styles.checkboxText}>
                {t('checklistOverview.onlyPending', 'Apenas pendentes')}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setDateFilter(todayIso)}
              className={styles.todayButton}
              disabled={isToday}
            >
              {t('checklistOverview.today', 'Hoje')}
            </button>
          </div>
        </div>

        {/* Cards de resumo */}
        <div className={styles.summaryRow}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>
              {t('checklistOverview.totalMachines', 'Total de máquinas')}
            </span>
            <strong className={styles.summaryValue}>{totals.total}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>
              {t('checklistOverview.turn1', '1º turno')}
            </span>
            <strong className={styles.summaryValue}>
              {totals.t1ok}/{totals.total}
            </strong>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>
              {t('checklistOverview.turn2', '2º turno')}
            </span>
            <strong className={styles.summaryValue}>
              {totals.t2ok}/{totals.total}
            </strong>
          </div>
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        {/* Tabela principal */}
        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <span className={styles.tableTitle}>
              {t('checklistOverview.tableTitle', 'Status por máquina')}
            </span>
            {loading && (
              <span className={styles.loadingInfo}>
                <FiRefreshCw className={styles.spin} />{' '}
                {t('common.loading', 'Carregando...')}
              </span>
            )}
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('checklistOverview.machine', 'Máquina')}</th>
                  <th>{t('checklistOverview.turn1Short', '1º turno')}</th>
                  <th>{t('checklistOverview.turn2Short', '2º turno')}</th>
                  <th>{t('checklistOverview.lastSent', 'Último checklist')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {!loading && visibleItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className={styles.emptyCell}>
                      {t(
                        'checklistOverview.empty',
                        'Nenhuma máquina encontrada para o filtro atual.'
                      )}
                    </td>
                  </tr>
                )}

                {visibleItems.map((m) => {
                  const lastSent = m.ultimaSub?.criado_em
                    ? fmtDateTime.format(new Date(m.ultimaSub.criado_em))
                    : '—';

                  return (
                    <tr key={m.id}>
                      <td>
                        <Link
                          to={`/maquinas/${m.id}?tab=checklist`}
                          className={styles.machineLink}
                        >
                          {m.nome}
                        </Link>
                      </td>
                      <td>{renderStatusBadge(m.turno1Ok, m.turno1Nomes)}</td>
                      <td>{renderStatusBadge(m.turno2Ok, m.turno2Nomes)}</td>
                      <td>{lastSent}</td>
                      <td className={styles.actionCell}>
                        <Link
                          to={`/maquinas/${m.id}?tab=checklist`}
                          className={styles.detailsLink}
                        >
                          <FiInfo />
                          <span>
                            {t(
                              'checklistOverview.details',
                              'Ver detalhes'
                            )}
                          </span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

export default ChecklistOverviewPage;
