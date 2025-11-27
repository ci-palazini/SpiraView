import React, { useEffect, useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getChamado, listarManutentores, listarCausasRaiz,
  atribuirChamado, removerAtribuicao, atenderChamado,
  adicionarObservacao, concluirChamado, deletarChamado,
  atualizarChecklistChamado,               // <<< IMPORTANTE
  listarFotosChamado,          // <<< NOVO
  uploadFotoChamado,           // <<< NOVO
} from '../services/apiClient';
import styles from './ChamadoDetalhe.module.css';
import { useTranslation } from 'react-i18next';
import { statusKey } from '../i18n/format';

function asDate(v) {
  try {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v.toDate === 'function') return v.toDate();
    const d = typeof v === 'string' ? new Date(v.replace(' ', 'T')) : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

// normaliza um item genérico de checklist
function normChecklistItem(it) {
  if (typeof it === 'string') return { item: it, resposta: 'sim' };
  const itemTxt = it?.item || it?.texto || it?.key || '';
  const resp = String(it?.resposta || 'sim').toLowerCase() === 'nao' ? 'nao' : 'sim';
  return { item: itemTxt, resposta: resp };
}

export default function ChamadoDetalhe({ user }) {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();

  const [chamado, setChamado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  // edição / conclusão
  const [solucao, setSolucao] = useState('');
  const [causa, setCausa] = useState('');
  const [causas, setCausas] = useState([]);

  // checklist preventiva
  const [checklist, setChecklist] = useState([]);

  // observações
  const [novaObservacao, setNovaObservacao] = useState('');

  // fotos de manutencao
  const [fotos, setFotos] = useState([]);
  const [fotoFile, setFotoFile] = useState(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  // atribuição (gestor)
  const [manutentores, setManutentores] = useState([]);
  const [selectedManutentor, setSelectedManutentor] = useState('');
  const [assigning, setAssigning] = useState(false);

  const isGestor = (user?.role || '').toLowerCase() === 'gestor';
  const isManutentor = (user?.role || '').toLowerCase() === 'manutentor';
  const isOperador = (user?.role || '').toLowerCase() === 'operador';

  const fmtDate = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short' }),
    [i18n.language]
  );
  const fmtDateTime = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }),
    [i18n.language]
  );

  // --------- carregar chamado ---------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const c = await getChamado(id);

        // normaliza responsabilidades do chamado
        const normId    = c.manutentor_id_norm
               ?? c.responsavel_atual_id
               ?? c.atendido_por_id
               ?? c.atribuido_para_id
               ?? null;

        const normNome  = c.manutentor_nome_norm
                      ?? c.responsavel_atual_nome
                      ?? c.atendido_por_nome
                      ?? c.atribuido_para_nome
                      ?? '';

        const normEmail = (c.manutentor_email_norm
                      ?? c.responsavel_atual_email
                      ?? c.atendido_por_email
                      ?? c.atribuido_para_email
                      ?? '').toLowerCase();

        const attendedById    = c.atendido_por_id ?? null;
        const attendedByNome  = c.atendido_por_nome ?? '';
        const attendedByEmail = (c.atendido_por_email ?? '').toLowerCase();
        const attendedEm      = c.atendido_em ?? null;

        const mapped = {
          ...c,
          operadorNome:  c.operadorNome ?? c.criado_por ?? '',
          dataAbertura:  c.dataAbertura ?? c.criado_em ?? null,
          dataConclusao: c.dataConclusao ?? c.concluido_em ?? null,

          // 👇 “dono” do chamado para permissão (isOwner)
          manutentorId:    normId,
          manutentorNome:  normNome,
          manutentorEmail: normEmail,

          // exibimos também quem atendeu
          atendidoPorId:    attendedById,
          atendidoPorNome:  attendedByNome,
          atendidoPorEmail: attendedByEmail,
          atendidoEm:       attendedEm,

          // usado para bloquear “atender” se já tem dono
          assignedTo:     normId,
          assignedToNome: normNome,

          observacoes: (c.observacoes || []).map(o => ({
            autor: o.autor,
            data:  o.criado_em || o.data,
            texto: o.texto,
          })),
        };

        const list = Array.isArray(c.checklist) ? c.checklist.map(normChecklistItem).filter(x => x.item) : [];

        if (!alive) return;
        setChamado(mapped);
        setCausa(mapped.causa || '');
        setChecklist(list);
        if (mapped.manutentorId) setSelectedManutentor(mapped.manutentorId);

        // 👇 carrega fotos deste chamado
        try {
          const fotosLista = await listarFotosChamado(id);
          if (alive) {
            setFotos(Array.isArray(fotosLista) ? fotosLista : []);
          }
        } catch (errFotos) {
          console.error('Erro ao listar fotos do chamado:', errFotos);
        }
      } catch (e) {
        console.error(e);
        toast.error(t('chamadoDetalhe.toasts.loadError'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, t, reloadTick]);

  // --------- causas raiz ---------
  useEffect(() => {
    (async () => {
      try {
        const list = await listarCausasRaiz();
        setCausas(list.map(x => x.nome).filter(Boolean));
      } catch (e) {
        console.error('Erro ao listar causas:', e);
      }
    })();
  }, []);

  // --------- manutentores (somente gestor) ---------
  useEffect(() => {
    if (!isGestor) return;
    (async () => {
      try {
        const lista = await listarManutentores();
        setManutentores(lista.map(u => ({
          uid: u.id,
          nome: u.nome || u.email || u.id,
          email: u.email,
        })));
      } catch {
        toast.error(t('chamadoDetalhe.toasts.listMaintDenied'));
      }
    })();
  }, [isGestor, t]);

  // --------- permissões ---------
  const userId = user?.uid || user?.id || user?.userId || null;
  const userEmail = (user?.email || '').toLowerCase();

  const isOwner = useMemo(() => {
    if (!chamado) return false;
    const byId = !!userId && !!chamado.manutentorId && String(chamado.manutentorId) === String(userId);
    const byEmail = !!userEmail && !!chamado.manutentorEmail && chamado.manutentorEmail === userEmail;
    return byId || byEmail;
  }, [chamado, userId, userEmail]);

  const podeAtender =
    isManutentor &&
    chamado?.status === 'Aberto' &&
    (!chamado?.manutentorNome || isOwner);

  const podeConcluir =
    isManutentor &&
    chamado?.status === 'Em Andamento' &&
    isOwner;

  // --------- handlers ---------
  function handleFotoChange(e) {
    const file = e.target.files?.[0] || null;
    setFotoFile(file);
  }

  async function handleUploadFoto() {
    if (!fotoFile) {
      toast.error(t('chamadoDetalhe.photos.selectFile') || 'Selecione uma foto primeiro.');
      return;
    }

    // pode mandar foto se for dono, manutentor ou gestor
    if (!isOwner && !isManutentor && !isGestor) {
      toast.error(
        t('chamadoDetalhe.photos.permissionDenied') ||
        'Você não tem permissão para enviar fotos.'
      );
      return;
    }

    setUploadingFoto(true);
    try {
      const nova = await uploadFotoChamado(id, fotoFile, {
        role: user.role,
        email: user.email,
      });
      setFotos((prev) => [...prev, nova]);
      setFotoFile(null);
      toast.success(
        t('chamadoDetalhe.photos.uploadSuccess') ||
        'Foto enviada com sucesso.'
      );
    } catch (e) {
      console.error('Erro ao enviar foto:', e);
      toast.error(
        t('chamadoDetalhe.photos.uploadError') ||
        'Falha ao enviar foto.'
      );
    } finally {
      setUploadingFoto(false);
    }
  }

  async function handleAtribuir() {
    if (!selectedManutentor) {
      toast.error(t('chamadoDetalhe.toasts.selectMaint'));
      return;
    }
    setAssigning(true);
    try {
      const alvo = manutentores.find((m) => m.uid === selectedManutentor);
      await atribuirChamado(id, { manutentorEmail: alvo?.email || null, role: user.role, email: user.email });
      toast.success(t('chamadoDetalhe.toasts.assigned'));
      setReloadTick(n => n + 1);
    } catch (e) {
      console.error(e);
      toast.error(t('chamadoDetalhe.toasts.assignError'));
    } finally {
      setAssigning(false);
    }
  }

  async function handleRemoverAtribuicao() {
    setAssigning(true);
    try {
      await removerAtribuicao(id, { role: user.role, email: user.email });
      setSelectedManutentor('');
      toast.success(t('chamadoDetalhe.toasts.unassigned'));
      setReloadTick(n => n + 1);
    } catch (e) {
      console.error(e);
      toast.error(t('chamadoDetalhe.toasts.unassignError'));
    } finally {
      setAssigning(false);
    }
  }

  async function handleAtenderChamado() {
    if (chamado?.assignedTo && !isOwner) {
      toast.error(t('chamadoDetalhe.toasts.assignedToOther'));
      return;
    }
    setBusy(true);
    try {
      await atenderChamado(id, { role: user.role, email: user.email });
      toast.success(t('chamadoDetalhe.toasts.taken'));
      setReloadTick(n => n + 1);
    } catch (e) {
      console.error(e);
      toast.error(t('chamadoDetalhe.toasts.takeError'));
    } finally {
      setBusy(false);
    }
  }

  // marca sim/nao e PERSISTE no back (gera corretiva no server se virar sim->nao)
  async function handleChecklistItemToggle(index, value) {
    const novo = [...checklist];
    novo[index] = { ...novo[index], resposta: value };
    setChecklist(novo);
    try {
      await atualizarChecklistChamado(id, novo, { role: user.role, email: user.email });
    } catch (e) {
      console.error(e);
      toast.error(t('chamadoDetalhe.toasts.checklistSaveError') || 'Falha ao salvar checklist.');
    }
  }

  async function handleAdicionarObservacao() {
    const texto = (novaObservacao || '').trim();
    if (!texto) return;
    setBusy(true);
    try {
      await adicionarObservacao(id, { texto, role: user.role, email: user.email });
      setNovaObservacao('');
      toast.success(t('chamadoDetalhe.toasts.noteAdded'));
      setReloadTick(n => n + 1);
    } catch (e) {
      console.error(e);
      toast.error(t('chamadoDetalhe.toasts.noteError'));
    } finally {
      setBusy(false);
    }
  }

  async function handleConcluirChamado(e) {
    e.preventDefault();
    if (!isOwner) {
      toast.error(t('chamadoDetalhe.toasts.finishOnlyOwner'));
      return;
    }
    setBusy(true);
    try {
      if (chamado?.tipo === 'preventiva') {
        await concluirChamado(id, { tipo: 'preventiva', checklist }, { role: user.role, email: user.email });
      } else {
        if (!causa) { toast.error(t('chamadoDetalhe.toasts.selectCause')); setBusy(false); return; }
        if (!solucao.trim()) { toast.error(t('chamadoDetalhe.toasts.describeService')); setBusy(false); return; }
        await concluirChamado(id, { tipo: 'corretiva', causa, solucao }, { role: user.role, email: user.email });
      }
      toast.success(t('chamadoDetalhe.toasts.finished'));
      navigate('/');
    } catch (e) {
      console.error('Erro ao concluir:', e);
      toast.error(t('chamadoDetalhe.toasts.finishError'));
    } finally {
      setBusy(false);
    }
  }

  async function handleExcluirChamado() {
    if (!isGestor) {
      toast.error(t('chamadoDetalhe.toasts.onlyManagerDelete'));
      return;
    }
    if (!window.confirm(t('chamadoDetalhe.delete.confirm'))) return;
    setBusy(true);
    try {
      await deletarChamado(id, { role: user.role, email: user.email });
      toast.success(t('chamadoDetalhe.toasts.deleted'));
      navigate(-1);
    } catch (e) {
      console.error('Erro ao excluir chamado:', e);
      toast.error(t('chamadoDetalhe.toasts.deleteError'));
    } finally {
      setBusy(false);
    }
  }

  // --------- render ---------
  if (loading) return <p style={{ padding: 20 }}>{t('common.loading')}</p>;
  if (!chamado) return <p style={{ padding: 20 }}>{t('chamadoDetalhe.notFound')}</p>;

  const openedAt = chamado?.dataAbertura ? fmtDateTime.format(asDate(chamado.dataAbertura)) : '—';
  const isPreventiva = (chamado?.tipo || '').toLowerCase() === 'preventiva';

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>{t('chamadoDetalhe.header.machine', { name: chamado.maquina })}</h1>
        <small>
          {t('chamadoDetalhe.header.openedBy', {
            name: chamado.operadorNome,
            date: openedAt,
          })}
        </small>
      </header>

      <div className={styles.card}>
        <div className={styles.detailsGrid}>
          <div className={styles.detailItem}>
            <strong>{t('chamadoDetalhe.fields.status')}</strong>
            <p>
              <span className={`${styles.statusBadge} ${styles[chamado.status?.toLowerCase()?.replace(' ', '')]}`}>
                {t(`status.${statusKey(chamado.status)}`)}
              </span>
            </p>
          </div>

          {chamado.atendidoPorNome && (
            <div className={styles.detailItem}>
              <strong>{t('chamadoDetalhe.fields.attendedBy') || 'Atendido por'}</strong>
              <p>{chamado.atendidoPorNome}</p>
              {chamado.atendidoEm && (
                <small>
                  {t('chamadoDetalhe.fields.attendedAt', { date: fmtDateTime.format(asDate(chamado.atendidoEm)) }) || `Atendido em: ${fmtDateTime.format(asDate(chamado.atendidoEm))}`}
                </small>
              )}
            </div>
          )}

          {chamado.manutentorNome && (
            <div className={styles.detailItem}>
              <strong>{t('chamadoDetalhe.fields.assignedTo') || 'Atribuído a'}</strong>
              <p>{chamado.manutentorNome}</p>
            </div>
          )}

          <div className={styles.detailItem}>
            <strong>{t('chamadoDetalhe.fields.reportedProblem')}</strong>
            <p style={{ wordBreak: 'break-word' }}>{chamado.descricao}</p>
          </div>

          {chamado.status === 'Concluido' && (
            isPreventiva ? (
              <div className={styles.detailItem}>
                <strong>{t('chamadoDetalhe.fields.checklistDone')}</strong>
                <p>
                  {(chamado.checklist || []).filter(i => i.resposta === 'sim').length} {t('chamadoDetalhe.of')} {(chamado.checklist || []).length}
                </p>
              </div>
            ) : (
              <div className={styles.detailItem}>
                <strong>{t('chamadoDetalhe.fields.performedService')}</strong>
                <p style={{ wordBreak: 'break-word' }}>{chamado.solucao}</p>
                <small>{t('chamadoDetalhe.fields.finishedAt', {
                  date: chamado.dataConclusao ? fmtDateTime.format(asDate(chamado.dataConclusao)) : '—',
                })}</small>
              </div>
            )
          )}

          {!isPreventiva && ['Em Andamento', 'Concluido'].includes(chamado.status) && (
            <div className={styles.detailItem}>
              <strong>{t('chamadoDetalhe.fields.cause')}</strong>
              {chamado.status === 'Em Andamento' ? (
                <select
                  id="causa"
                  value={causa}
                  onChange={(e) => setCausa(e.target.value)}
                  className={styles.select}
                  required
                >
                  <option value="" disabled>{t('chamadoDetalhe.selects.causePlaceholder')}</option>
                  {causas.map((nome) => (
                    <option key={nome} value={nome}>
                      {nome.charAt(0).toUpperCase() + nome.slice(1)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className={styles.readonlyField}>{chamado.causa || '–'}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Atribuição (gestor) */}
      {isGestor && chamado.status !== 'Concluido' && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{t('chamadoDetalhe.assign.title')}</h2>
          <div className={styles.formGroup}>
            <label htmlFor="manutentor">{t('chamadoDetalhe.assign.label')}</label>
            <select
              id="manutentor"
              className={styles.select}
              value={selectedManutentor}
              onChange={(e) => setSelectedManutentor(e.target.value)}
            >
              <option value="">{t('chamadoDetalhe.assign.placeholder')}</option>
              {manutentores.map((m) => (
                <option key={m.uid} value={m.uid}>{m.nome}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={handleAtribuir} className={styles.button} disabled={assigning || !selectedManutentor}>
              {assigning ? t('common.processing') : (chamado.assignedTo ? t('chamadoDetalhe.assign.reassign') : t('chamadoDetalhe.assign.assign'))}
            </button>
            {chamado.assignedTo && (
              <button
                onClick={handleRemoverAtribuicao}
                className={styles.button}
                disabled={assigning}
                style={{ backgroundColor: '#6c757d' }}
              >
                {assigning ? t('common.processing') : t('chamadoDetalhe.assign.remove')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Observações */}
      <div className={`${styles.card} ${styles.historySection}`}>
        <h2 className={styles.cardTitle}>{t('chamadoDetalhe.history.title')}</h2>

        {podeConcluir && (
          <div className={styles.formGroup}>
            <label htmlFor="observacao">{t('chamadoDetalhe.history.add')}</label>
            <textarea
              id="observacao"
              className={styles.textarea}
              rows="3"
              value={novaObservacao}
              onChange={(e) => setNovaObservacao(e.target.value)}
            />
            <button
              onClick={handleAdicionarObservacao}
              className={styles.button}
              disabled={busy}
              style={{ marginTop: 10 }}
            >
              {busy ? t('common.saving') : t('chamadoDetalhe.history.saveNote')}
            </button>
          </div>
        )}

        <ul className={styles.historyList}>
          {(chamado.observacoes || []).slice().reverse().map((obs, i) => (
            <li key={i} className={styles.historyItem}>
              <div className={styles.historyHeader}>
                <strong>{obs.autor || '—'}</strong>
                <span>{obs.data ? fmtDateTime.format(asDate(obs.data)) : '—'}</span>
              </div>
              <p className={styles.historyContent}>{obs.texto}</p>
            </li>
          ))}
          {(!chamado.observacoes || chamado.observacoes.length === 0) && <p>{t('chamadoDetalhe.history.empty')}</p>}
        </ul>
      </div>

      {/* Fotos da manutenção */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>
          {t('chamadoDetalhe.photos.title') || 'Fotos da manutenção'}
        </h2>

        {(() => {
          const podeEnviarFoto =
            (isOwner || isManutentor || isGestor) &&
            chamado.status !== 'Concluido';

          return (
            <>
              {podeEnviarFoto && (
                <div className={styles.formGroup} style={{ marginBottom: 16 }}>
                  <div className={styles.photoUploadWrapper}>
                    <div className={styles.photoUploadHeader}>
                      <span className={styles.photoUploadTitle}>
                        {t('chamadoDetalhe.photos.add') || 'Adicionar foto'}
                      </span>
                      <span className={styles.photoUploadHint}>
                        {t('chamadoDetalhe.photos.hint') || 'Formatos aceitos: JPG, PNG'}
                      </span>
                    </div>

                    <div className={styles.photoUploadBox}>
                      {/* input real (escondido) */}
                      <input
                        id="fotoUpload"
                        type="file"
                        accept="image/*"
                        onChange={handleFotoChange}
                        disabled={uploadingFoto}
                        className={styles.photoInputHidden}
                      />

                      {/* botão de escolher arquivo */}
                      <label htmlFor="fotoUpload" className={styles.chooseFileButton}>
                        {t('chamadoDetalhe.photos.choose') || 'Escolher arquivo'}
                      </label>

                      {/* nome do arquivo selecionado */}
                      <span className={styles.fileName}>
                        {fotoFile
                          ? fotoFile.name
                          : (t('chamadoDetalhe.photos.noFile') || 'Nenhum arquivo selecionado')}
                      </span>

                      {/* botão de enviar */}
                      <button
                        type="button"
                        onClick={handleUploadFoto}
                        className={styles.button}
                        disabled={uploadingFoto || !fotoFile}
                      >
                        {uploadingFoto
                          ? (t('common.saving') || 'Enviando...')
                          : (t('chamadoDetalhe.photos.uploadButton') || 'Enviar foto')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {(!fotos || fotos.length === 0) ? (
                <p>
                  {t('chamadoDetalhe.photos.empty') ||
                    'Nenhuma foto adicionada até o momento.'}
                </p>
              ) : (
                <div className={styles.photosGrid}>
                  {fotos.map((f) => (
                    <div key={f.id} className={styles.photoItem}>
                      {f.url ? (
                        <a href={f.url} target="_blank" rel="noreferrer">
                          <img
                            src={f.url}
                            alt="Foto da manutenção"
                            className={styles.photoThumb}
                          />
                        </a>
                      ) : (
                        <div className={styles.photoThumbFallback}>
                          <span>URL indisponível</span>
                        </div>
                      )}
                      <small>
                        {f.autorNome ? `${f.autorNome} • ` : ''}
                        {f.criadoEm
                          ? fmtDateTime.format(asDate(f.criadoEm))
                          : ''}
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Ações */}
      {podeAtender && (
        <div className={styles.card}>
          <button onClick={handleAtenderChamado} className={styles.button} disabled={busy}>
            {busy ? t('common.processing') : t('chamadoDetalhe.actions.take')}
          </button>
        </div>
      )}

      {podeConcluir && (
        isPreventiva ? (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>{t('chamadoDetalhe.preventive.title')}</h2>
            <form onSubmit={handleConcluirChamado} className={styles.checklistContainer}>
              {checklist.map((item, idx) => {
                const label = item.item || '(sem texto)';
                return (
                  <div key={idx} className={styles.checklistItem}>
                    <span className={styles.itemLabel}>{label}</span>
                    <div className={styles.radioGroup}>
                      <input
                        type="radio"
                        id={`sim-${idx}`}
                        name={`resposta-${idx}`}
                        checked={item.resposta === 'sim'}
                        onChange={() => handleChecklistItemToggle(idx, 'sim')}
                      />
                      <label htmlFor={`sim-${idx}`}>{t('common.yes')}</label>

                      <input
                        type="radio"
                        id={`nao-${idx}`}
                        name={`resposta-${idx}`}
                        checked={item.resposta === 'nao'}
                        onChange={() => handleChecklistItemToggle(idx, 'nao')}
                      />
                      <label htmlFor={`nao-${idx}`}>{t('common.no')}</label>
                    </div>
                  </div>
                );
              })}
              <button type="submit" className={styles.button} disabled={busy}>
                {busy ? t('chamadoDetalhe.actions.finishing') : t('chamadoDetalhe.actions.finish')}
              </button>
            </form>
          </div>
        ) : (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>{t('chamadoDetalhe.corrective.title')}</h2>
            <form onSubmit={handleConcluirChamado}>
              <div className={styles.formGroup}>
                <label htmlFor="solucao">{t('chamadoDetalhe.corrective.solutionLabel')}</label>
                <textarea
                  id="solucao"
                  className={styles.textarea}
                  rows="5"
                  value={solucao}
                  onChange={(e) => setSolucao(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className={styles.button} disabled={busy || !causa}>
                {busy ? t('common.saving') : t('chamadoDetalhe.actions.finish')}
              </button>
            </form>
          </div>
        )
      )}

      {(isGestor && ['Aberto','Em Andamento','Concluido'].includes(chamado.status)) && (
        <div className={styles.card} style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleExcluirChamado}
            className={`${styles.button} ${styles.buttonDanger}`}
            disabled={busy}
            title={t('chamadoDetalhe.delete.title')}
          >
            {busy ? t('common.deleting') : t('chamadoDetalhe.delete.button')}
          </button>
        </div>
      )}
    </div>
  );
}
