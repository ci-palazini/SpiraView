import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { listarChamados } from '../../../services/apiClient';
import { subscribeSSE } from '../../../services/sseClient';
import { exportToExcel } from '../../../utils/exportExcel';
import { exportToPdf } from '../../../utils/exportPdf';
import styles from './HistoricoPage.module.css';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import { useTranslation } from 'react-i18next';

const HistoricoPage = () => {
  const { t, i18n } = useTranslation();

  // estados principais...
  const [chamadosConcluidos, setChamadosConcluidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  // filtros
  const [filtroTipoChamado, setFiltroTipoChamado] = useState('todos'); // 'todos' | 'corretiva' | 'preventiva' | 'preditiva'
  const [filtroMaquina, setFiltroMaquina] = useState('');
  const [busca, setBusca] = useState('');

  // formatação de data etc...
  const dtFmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }),
    [i18n.language]
  );

  // Util para aceitar string da API e outros formatos
  function tsToDate(ts) {
    if (!ts) return null;
    if (typeof ts === 'string') return new Date(ts.replace(' ', 'T')); // "YYYY-MM-DD HH:MM"
    if (typeof ts.toDate === 'function') return ts.toDate();
    const d = ts instanceof Date ? ts : new Date(ts);
    return isNaN(d) ? null : d;
  }

  // histórico com filtros + ordenação
  const historicoFiltrado = useMemo(() => {
    let arr = Array.isArray(chamadosConcluidos) ? chamadosConcluidos.slice() : [];

    if (filtroTipoChamado && filtroTipoChamado !== 'todos') {
      arr = arr.filter(c => (c.tipo || '').toLowerCase() === filtroTipoChamado.toLowerCase());
    }
    if (filtroMaquina.trim()) {
      const q = filtroMaquina.trim().toLowerCase();
      arr = arr.filter(c => (c.maquina || '').toLowerCase().includes(q));
    }
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      arr = arr.filter(c =>
        (c.descricao || '').toLowerCase().includes(q) ||
        (c.manutentorNome || '').toLowerCase().includes(q)
      );
    }

    // mantém ordenação por conclusão desc (fallback: abertura)
    arr.sort((a, b) => {
      const ad = tsToDate(a.dataConclusao) || tsToDate(a.dataAbertura) || 0;
      const bd = tsToDate(b.dataConclusao) || tsToDate(b.dataAbertura) || 0;
      return bd - ad;
    });

    return arr;
  }, [chamadosConcluidos, filtroTipoChamado, filtroMaquina, busca]);

  // Buscar via API (substitui onSnapshot do Firestore)
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const data = await listarChamados({ status: 'Concluido', page: 1, pageSize: 500 });
        const rows = data.items ?? data;

        const mapped = rows.map(r => ({
          id: r.id,
          maquina: r.maquina,
          tipo: r.tipo, // 'corretiva' | 'preventiva' | 'preditiva'
          descricao: r.descricao,
          manutentorNome: r.manutentor || '',
          dataAbertura: r.criado_em || null,     // string "YYYY-MM-DD HH:MM"
          dataConclusao: r.concluido_em || null, // string ou null
          solucao: r.solucao || '',
          causa: r.causa || '',
          status: r.status
        }));

        if (!alive) return;
        setChamadosConcluidos(mapped);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [reloadTick]);

  // Assinar SSE e disparar refetch
  useEffect(() => {
    const unsubscribe = subscribeSSE((msg) => {
      if (msg?.topic === 'chamados') {
        setReloadTick(n => n + 1);
      }
    });
    return () => unsubscribe();
  }, []);

  // Tradução para o tipo
  function tipoLabel(tipo) {
    if (tipo === 'corretiva') return t('historico.filters.typeOptions.corrective');
    if (tipo === 'preventiva') return t('historico.filters.typeOptions.preventive');
    if (tipo === 'preditiva') return t('historico.filters.typeOptions.predictive');
    return tipo || '';
  }

  // Dados para Excel
  const excelData = historicoFiltrado.map(c => ({
    [t('historico.export.columns.machine')]: c.maquina,
    [t('historico.export.columns.callType')]: tipoLabel(c.tipo),
    [t('historico.export.columns.openedAt')]:
      c.dataAbertura ? dtFmt.format(tsToDate(c.dataAbertura)) : '',
    [t('historico.export.columns.attendedBy')]: c.manutentorNome || '',
    [t('historico.export.columns.performedService')]: c.solucao || '',
    [t('historico.export.columns.cause')]: c.causa || '',
    [t('historico.export.columns.concludedAt')]:
      c.dataConclusao ? dtFmt.format(tsToDate(c.dataConclusao)) : '',
    [t('historico.export.columns.problem')]: c.descricao || ''
  }));

  // Colunas PDF
  const pdfColumns = [
    { key: 'maquina', label: t('historico.export.columns.machine') },
    { key: 'tipo', label: t('historico.export.columns.callType') },
    { key: 'dataAbertura', label: t('historico.export.columns.openedAt') },
    { key: 'manutentorNome', label: t('historico.export.columns.attendedBy') },
    { key: 'solucao', label: t('historico.export.columns.performedService') },
    { key: 'causa', label: t('historico.export.columns.cause') },
    { key: 'dataConclusao', label: t('historico.export.columns.concludedAt') },
    { key: 'descricao', label: t('historico.export.columns.problem') }
  ];

  // Dados PDF
  const pdfData = historicoFiltrado.map(c => ({
    ...c,
    dataAbertura: c.dataAbertura ? dtFmt.format(tsToDate(c.dataAbertura)) : '',
    dataConclusao: c.dataConclusao ? dtFmt.format(tsToDate(c.dataConclusao)) : '',
    tipo: tipoLabel(c.tipo)
  }));

  return (
    <>
      <PageHeader
        title={t('historico.title')}
        subtitle={t('historico.subtitle', 'Veja o histórico de chamados concluídos e filtre por tipo, máquina ou texto.')}
      />

      {/* Container branco principal */}
      <div className={styles.listContainer}>
        {loading ? (
          <p className={styles.loading}>{t('historico.loading')}</p>
        ) : (
          <>
            {/* Área de exportação */}
            <div className={styles.exportButtons}>
              <button
                onClick={() =>
                  exportToExcel(
                    excelData,
                    t('historico.export.sheetName'),
                    'historico-chamados'
                  )
                }
              >
                {t('historico.export.downloadExcel')}
              </button>
              <button
                onClick={() =>
                  exportToPdf(pdfData, pdfColumns, 'historico-chamados')
                }
              >
                {t('historico.export.downloadPdf')}
              </button>
            </div>

            {/* Filtros */}
            <div className={styles.filterContainer}>
              <div>
                <label htmlFor="filtroTipoChamado">
                  {t('historico.filters.byType')}
                </label>
                <select
                  id="filtroTipoChamado"
                  className={styles.select}
                  value={filtroTipoChamado}
                  onChange={e => setFiltroTipoChamado(e.target.value)}
                >
                  <option value="todos">
                    {t('historico.filters.typeOptions.all')}
                  </option>
                  <option value="corretiva">
                    {t('historico.filters.typeOptions.corrective')}
                  </option>
                  <option value="preventiva">
                    {t('historico.filters.typeOptions.preventive')}
                  </option>
                  <option value="preditiva">
                    {t('historico.filters.typeOptions.predictive')}
                  </option>
                </select>
              </div>

              <div>
                <label htmlFor="filtroMaquina">
                  {t('historico.filters.byMachine')}
                </label>
                <input
                  id="filtroMaquina"
                  className={styles.select}
                  value={filtroMaquina}
                  onChange={e => setFiltroMaquina(e.target.value)}
                  placeholder={t('historico.filters.machineOptions.all')}
                />
              </div>

              <div>
                <label htmlFor="busca">
                  {t('historico.filters.search') || 'Busca'}
                </label>
                <input
                  id="busca"
                  className={styles.select}
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder={
                    t('historico.filters.searchPlaceholder') ||
                    t('historico.item.problem')
                  }
                />
              </div>
            </div>

            {/* Lista de cards */}
            {historicoFiltrado.length === 0 ? (
              <p className={styles.empty}>{t('historico.empty')}</p>
            ) : (
              <ul className={styles.chamadoList}>
                {historicoFiltrado.map((chamado) => (
                  <Link
                    to={`chamado/${chamado.id}`}
                    key={chamado.id}
                    className={styles.chamadoLink}
                  >
                    <li className={styles.chamadoItem}>
                      <div className={styles.chamadoInfo}>
                        <strong>
                          {t('historico.item.machine', {
                            name: chamado.maquina
                          })}
                        </strong>
                        <small>
                          {t('historico.item.attendedBy', {
                            name:
                              chamado.manutentorNome ||
                              t('historico.item.unknown')
                          })}
                        </small>
                        <small>
                          {t('historico.item.concludedAt', {
                            date: chamado.dataConclusao
                              ? dtFmt.format(tsToDate(chamado.dataConclusao))
                              : '...'
                          })}
                        </small>
                        <p className={styles.problemaPreview}>
                          <strong>{t('historico.item.problem')}</strong>{' '}
                          {chamado.descricao ||
                            t('historico.item.notSpecified')}
                        </p>
                      </div>
                    </li>
                  </Link>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default HistoricoPage;
