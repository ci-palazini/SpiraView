// src/pages/MaquinaDetalhePage.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getMaquina,
  listarChamadosPorMaquina,
  addChecklistItem,
  removeChecklistItem,
  listarSubmissoesDiarias, // <— vamos usar para abrir o detalhe
} from '../../../services/apiClient';
import toast from 'react-hot-toast';
import styles from './MaquinaDetalhePage.module.css';
import { FiTrash2, FiCheckCircle, FiXCircle, FiDownload } from 'react-icons/fi';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { df, statusKey } from '../../../i18n/format';

const MaquinaDetalhePage = ({ user }) => {
  const { t, i18n } = useTranslation();
  const { id } = useParams();

  const [maquina, setMaquina] = useState(null);
  const [chamadosConcluidos, setChamadosConcluidos] = useState([]);
  const [chamadosAtivos, setChamadosAtivos] = useState([]);

  // Histórico do back
  const [historicoDiario, setHistoricoDiario] = useState([]);
  const [submissoesRecentes, setSubmissoesRecentes] = useState([]);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ativos');
  const [novoItemChecklist, setNovoItemChecklist] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  // Modal de detalhe da submissão
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitulo, setModalTitulo] = useState('');
  const [modalSubmissoes, setModalSubmissoes] = useState([]); // cada item tem {criado_em, operador_nome, respostas, turno}

  const qrCodeRef = useRef(null);
  const fmtDate = useMemo(() => df({ dateStyle: 'short' }), [i18n.language]);
  const fmtDateTime = useMemo(() => df({ dateStyle: 'short', timeStyle: 'short' }), [i18n.language]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);

        // 1) Máquina + histórico (o back já manda)
        const m = await getMaquina(id);
        if (!alive) return;

        setMaquina({
          ...m,
          checklistDiario: m.checklist_diario ?? m.checklistDiario ?? []
        });

        setHistoricoDiario(Array.isArray(m.historicoChecklist) ? m.historicoChecklist : []);
        setSubmissoesRecentes(Array.isArray(m.checklistHistorico) ? m.checklistHistorico : []);

        // 2) Chamados
        const [abertos, andamento, concluidos] = await Promise.all([
          listarChamadosPorMaquina(id, { status: 'Aberto' }),
          listarChamadosPorMaquina(id, { status: 'Em Andamento' }),
          listarChamadosPorMaquina(id, { status: 'Concluido' }),
        ]);
        if (!alive) return;

        const sortByCriado = (a, b) => new Date(b.criado_em) - new Date(a.criado_em);
        setChamadosAtivos([...(abertos || []), ...(andamento || [])].sort(sortByCriado));
        setChamadosConcluidos((concluidos || []).sort(sortByCriado));
      } catch (e) {
        console.error(e);
        toast.error(t('maquinaDetalhe.toasts.loadError'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, t, reloadTick]);

  const handleAdicionarItemChecklist = async () => {
    if (novoItemChecklist.trim() === '') {
      toast.error(t('maquinaDetalhe.toasts.itemEmpty'));
      return;
    }
    try {
      await addChecklistItem(id, novoItemChecklist.trim(), { role: user.role, email: user.email });
      toast.success(t('maquinaDetalhe.toasts.itemAdded'));
      setNovoItemChecklist('');
      setReloadTick(n => n + 1);
    } catch (e) {
      console.error(e);
      toast.error(t('maquinaDetalhe.toasts.itemAddError'));
    }
  };

  const handleRemoverItemChecklist = async (itemParaRemover) => {
    if (!window.confirm(t('maquinaDetalhe.checklist.confirmRemove', { item: itemParaRemover }))) return;
    try {
      await removeChecklistItem(id, itemParaRemover, { role: user.role, email: user.email });
      toast.success(t('maquinaDetalhe.toasts.itemRemoved'));
      setReloadTick(n => n + 1);
    } catch (e) {
      console.error(e);
      toast.error(t('maquinaDetalhe.toasts.itemRemoveError'));
    }
  };

  if (loading) return <p style={{ padding: 20 }}>{t('maquinaDetalhe.loading')}</p>;
  if (!maquina) return <p style={{ padding: 20 }}>{t('maquinaDetalhe.notFound')}</p>;

  const ListaDeChamados = ({ lista, titulo, mensagemVazia }) => (
    <div>
      <h2>{titulo}</h2>
      {lista.length === 0 ? <p>{mensagemVazia}</p> : (
        <ul className={styles.chamadoList}>
          {lista.map(chamado => {
            const tipoChamado = chamado.tipo || 'corretiva';
            const isConcluido = chamado.status === 'Concluido';
            const statusClass =
              isConcluido
                ? styles.concluidoCard
                : (tipoChamado === 'corretiva' ? styles.corretiva
                  : (tipoChamado === 'preventiva' ? styles.preventiva
                    : (tipoChamado === 'preditiva' ? styles.preditiva : styles.normal)));

            return (
              <Link to={`/maquinas/chamado/${chamado.id}`} key={chamado.id} className={styles.chamadoCard}>
                <li className={`${styles.chamadoItem} ${statusClass}`}>
                  <strong>{chamado.descricao}</strong>
                  <p>
                    {t('maquinaDetalhe.listas.statusLabel', {
                      status: t(`status.${statusKey ? statusKey(chamado.status) : 'open'}`)
                    })}
                  </p>
                  <small>
                    {t('maquinaDetalhe.listas.openedAt', {
                      date: chamado.criado_em ? fmtDateTime.format(new Date(chamado.criado_em)) : 'N/A'
                    })}
                  </small>
                </li>
              </Link>
            );
          })}
        </ul>
      )}
    </div>
  );

  const handleDownloadQRCode = () => {
    const canvas = qrCodeRef.current?.querySelector('canvas');
    if (canvas) {
      const pngUrl = canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `${maquina.nome}-QRCode.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  // ========= Detalhe por operador (modal) =========
  const deriveTurno = (turno, criadoEmStr) => {
    const t = String(turno || '').toLowerCase();
    if (t === 'turno1' || t === '1') return 'turno1';
    if (t === 'turno2' || t === '2') return 'turno2';
    // sem turno explícito: deduz pelo horário
    const hh = parseInt((criadoEmStr || '').slice(11, 13), 10);
    return !isNaN(hh) && hh >= 14 ? 'turno2' : 'turno1';
  };

  // tenta descobrir o e-mail do operador pelo mesmo dia/turno dentro das submissões recentes
  const findEmailFor = (diaISO, turno, operadorNome) => {
    const rec = submissoesRecentes.find((s) => {
      const sDia = String(s.criado_em || '').slice(0, 10);
      const sTurno = deriveTurno(s.turno, s.criado_em);
      return (
        sDia === diaISO &&
        sTurno === turno &&
        String(s.operador_nome || '').trim() === String(operadorNome || '').trim()
      );
    });
    return rec?.operador_email || null;
  };

  const abrirDetalheOperador = async (diaISO, turno, operadorNome) => {
    try {
      // 1) Fallback local: procurar nas submissões recentes que já vieram do back
      const locais = (submissoesRecentes || []).filter((s) => {
        const sDia = String(s.criado_em || '').slice(0, 10);
        const sTurno = deriveTurno(s.turno, s.criado_em);
        return (
          String(s.maquina_id) === String(id) &&
          sDia === diaISO &&
          sTurno === turno &&
          String(s.operador_nome || '').trim() === String(operadorNome || '').trim() &&
          s.respostas // precisa ter respostas
        );
      });

      if (locais.length > 0) {
        setModalTitulo(
          `${fmtDate.format(new Date(`${diaISO}T00:00:00`))} • ${turno === 'turno1' ? t('maquinaDetalhe.checklist.columns.turn1') : t('maquinaDetalhe.checklist.columns.turn2')} • ${operadorNome}`
        );
        setModalSubmissoes(locais);
        setModalOpen(true);
        return;
      }

      // 2) Se não encontrou localmente, tenta via e-mail (mesma heurística de antes)
      const email = (submissoesRecentes || []).find((s) => {
        const sDia = String(s.criado_em || '').slice(0, 10);
        const sTurno = deriveTurno(s.turno, s.criado_em);
        return (
          sDia === diaISO &&
          sTurno === turno &&
          String(s.operador_nome || '').trim() === String(operadorNome || '').trim() &&
          s.operador_email
        );
      })?.operador_email;

      if (!email) {
        toast.error(t('maquinaDetalhe.checklist.detailNoEmail', 'Não foi possível localizar o e-mail deste operador para esse dia.'));
        return;
      }

      const subms = await listarSubmissoesDiarias({ operadorEmail: email, date: diaISO });
      const filtradas = (subms || []).filter((s) => {
        if (String(s.maquina_id) !== String(id)) return false;
        const sTurno = deriveTurno(s.turno, s.criado_em);
        return sTurno === turno;
      });

      if (filtradas.length === 0) {
        toast(t('maquinaDetalhe.checklist.detailEmpty', 'Não há submissões encontradas para esse dia/turno.'));
        return;
      }

      setModalTitulo(
        `${fmtDate.format(new Date(`${diaISO}T00:00:00`))} • ${turno === 'turno1' ? t('maquinaDetalhe.checklist.columns.turn1') : t('maquinaDetalhe.checklist.columns.turn2')} • ${operadorNome}`
      );
      setModalSubmissoes(filtradas);
      setModalOpen(true);
    } catch (e) {
      console.error(e);
      toast.error(t('maquinaDetalhe.toasts.loadError'));
    }
  };


  // helper para transformar "Fulano, Sicrana" em array
  const splitNomes = (s) =>
    String(s || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

  // Helper para formatar a string YYYY-MM-DD vinda do back
  const fmtDia = (diaStr) => {
    try { return fmtDate.format(new Date(`${diaStr}T00:00:00`)); }
    catch { return diaStr; }
  };

  return (
    <>
      <header className={styles.header}>
        <h1>{maquina.nome}</h1>
        <p>{t('maquinaDetalhe.subtitle')}</p>
      </header>

      {user.role === 'gestor' ? (
        <div>
          <nav className={styles.tabs}>
            <button className={`${styles.tabButton} ${activeTab === 'ativos' ? styles.active : ''}`} onClick={() => setActiveTab('ativos')}>{t('maquinaDetalhe.tabs.active')}</button>
            <button className={`${styles.tabButton} ${activeTab === 'historico' ? styles.active : ''}`} onClick={() => setActiveTab('historico')}>{t('maquinaDetalhe.tabs.history')}</button>
            <button className={`${styles.tabButton} ${activeTab === 'checklist' ? styles.active : ''}`} onClick={() => setActiveTab('checklist')}>{t('maquinaDetalhe.tabs.checklist')}</button>
            <button className={`${styles.tabButton} ${activeTab === 'qrcode' ? styles.active : ''}`} onClick={() => setActiveTab('qrcode')}>{t('maquinaDetalhe.tabs.qrcode')}</button>
          </nav>

          <div className={styles.tabContent}>
            {activeTab === 'ativos' && (
              <ListaDeChamados
                lista={chamadosAtivos}
                titulo={t('maquinaDetalhe.listas.activeTitle', { name: maquina.nome })}
                mensagemVazia={t('maquinaDetalhe.listas.activeEmpty')}
              />
            )}

            {activeTab === 'historico' && (
              <ListaDeChamados
                lista={chamadosConcluidos}
                titulo={t('maquinaDetalhe.listas.historyTitle', { name: maquina.nome })}
                mensagemVazia={t('maquinaDetalhe.listas.historyEmpty')}
              />
            )}

            {activeTab === 'checklist' && (
              <div className={styles.checklistEditor}>
                <h3>{t('maquinaDetalhe.checklist.title', { name: maquina.nome })}</h3>

                {(!maquina.checklistDiario || maquina.checklistDiario.length === 0) && (
                  <p>{t('maquinaDetalhe.checklist.empty')}</p>
                )}

                <ul className={styles.operatorList}>
                  {maquina.checklistDiario?.map((item, index) => (
                    <li key={index} className={styles.checklistItemManage}>
                      <span>{item}</span>
                      <button
                        onClick={() => handleRemoverItemChecklist(item)}
                        className={`${styles.opActionButton} ${styles.removeButton}`}
                        title={t('maquinaDetalhe.checklist.remove')}
                      >
                        <FiTrash2 />
                      </button>
                    </li>
                  ))}
                </ul>

                <form
                  className={styles.checklistInputForm}
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAdicionarItemChecklist(); // Enter chama o mesmo handler
                  }}
                >
                  <input
                    type="text"
                    value={novoItemChecklist}
                    onChange={(e) => setNovoItemChecklist(e.target.value)}
                    className={styles.checklistInput}
                    placeholder={t('maquinaDetalhe.checklist.placeholder')}
                  />
                  <button type="submit" className={styles.checklistAddButton}>
                    {t('maquinaDetalhe.checklist.add')}
                  </button>
                </form>


                <div className={styles.historyReport}>
                  <h3>{t('maquinaDetalhe.checklist.historyTitle')}</h3>
                  <div className={`${styles.dayEntry} ${styles.dayHeader}`}>
                    <span>{t('maquinaDetalhe.checklist.columns.date')}</span>
                    <span>{t('maquinaDetalhe.checklist.columns.turn1')}</span>
                    <span>{t('maquinaDetalhe.checklist.columns.turn2')}</span>
                  </div>

                  {historicoDiario.map((row) => {
                    const diaISO = row.dia;
                    const nomesT1 = splitNomes(row.turno1_operadores);
                    const nomesT2 = splitNomes(row.turno2_operadores);
                    const t1ok = !!row.turno1_ok;
                    const t2ok = !!row.turno2_ok;

                    return (
                      <div key={diaISO} className={styles.dayEntry}>
                        <span>{fmtDia(diaISO)}</span>

                        <div className={`${styles.turnStatus} ${t1ok ? styles.completed : styles.pending}`}>
                          {t1ok ? <FiCheckCircle /> : <FiXCircle />}
                          <span style={{ marginLeft: 8 }}>
                            {nomesT1.length ? nomesT1.map((nome) => (
                              <button
                                key={`t1-${diaISO}-${nome}`}
                                onClick={() => abrirDetalheOperador(diaISO, 'turno1', nome)}
                                style={{
                                  marginRight: 6, marginTop: 4,
                                  padding: '2px 8px', borderRadius: 999,
                                  border: '1px solid #d0d7de', background: '#f6f8fa', cursor: 'pointer'
                                }}
                                title={t('maquinaDetalhe.checklist.viewSubmission', 'Ver submissão')}
                              >
                                {nome}
                              </button>
                            )) : t('maquinaDetalhe.checklist.pending')}
                          </span>
                        </div>

                        <div className={`${styles.turnStatus} ${t2ok ? styles.completed : styles.pending}`}>
                          {t2ok ? <FiCheckCircle /> : <FiXCircle />}
                          <span style={{ marginLeft: 8 }}>
                            {nomesT2.length ? nomesT2.map((nome) => (
                              <button
                                key={`t2-${diaISO}-${nome}`}
                                onClick={() => abrirDetalheOperador(diaISO, 'turno2', nome)}
                                style={{
                                  marginRight: 6, marginTop: 4,
                                  padding: '2px 8px', borderRadius: 999,
                                  border: '1px solid #d0d7de', background: '#f6f8fa', cursor: 'pointer'
                                }}
                                title={t('maquinaDetalhe.checklist.viewSubmission', 'Ver submissão')}
                              >
                                {nome}
                              </button>
                            )) : t('maquinaDetalhe.checklist.pending')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'qrcode' && (
              <div className={styles.qrCodeSection}>
                <h3>{t('maquinaDetalhe.qrcode.title')}</h3>
                <p>{t('maquinaDetalhe.qrcode.info')}</p>

                <div ref={qrCodeRef} className={styles.qrCodeCanvas}>
                  <QRCodeCanvas
                    value={`${window.location.origin}/maquinas/${id}`}
                    size={256}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="L"
                    includeMargin
                  />
                </div>

                <button onClick={handleDownloadQRCode} className={styles.downloadButton}>
                  <FiDownload /> {t('maquinaDetalhe.qrcode.download')}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        // VISÃO DO MANUTENTOR
        <div className={styles.tabContent}>
          <ListaDeChamados
            lista={chamadosAtivos}
            titulo={t('maquinaDetalhe.listas.activeTitle', { name: maquina.nome })}
            mensagemVazia={t('maquinaDetalhe.listas.activeEmpty')}
          />
          <hr style={{ margin: '30px 0' }} />
          <ListaDeChamados
            lista={chamadosConcluidos}
            titulo={t('maquinaDetalhe.listas.historyTitle', { name: maquina.nome })}
            mensagemVazia={t('maquinaDetalhe.listas.historyEmpty')}
          />
        </div>
      )}

      {/* ===== Modal simples com o detalhe das respostas ===== */}
      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 12, width: 'min(900px, 95vw)', maxHeight: '85vh',
              overflow: 'auto', padding: 20, boxShadow: '0 10px 30px rgba(0,0,0,.2)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>{modalTitulo}</h3>
              <button onClick={() => setModalOpen(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>

            {modalSubmissoes.map((s) => (
              <div key={s.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <div style={{ marginBottom: 8, fontSize: 13, color: '#6b7280' }}>
                  {t('maquinaDetalhe.checklist.submittedAt', 'Enviado em')}: {s.criado_em ? fmtDateTime.format(new Date(s.criado_em)) : '—'}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>{t('maquinaDetalhe.checklist.item', 'Item')}</th>
                      <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #e5e7eb' }}>{t('maquinaDetalhe.checklist.answer', 'Resposta')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(s.respostas || {}).map(([pergunta, resp]) => {
                      const isNao = String(resp).toLowerCase() === 'nao';
                      return (
                        <tr key={pergunta}>
                          <td style={{ padding: '6px', borderBottom: '1px solid #f3f4f6' }}>{pergunta}</td>
                          <td style={{ padding: '6px', borderBottom: '1px solid #f3f4f6', fontWeight: 600, color: isNao ? '#b91c1c' : '#065f46' }}>
                            {isNao ? t('checklist.no') : t('checklist.yes')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default MaquinaDetalhePage;
