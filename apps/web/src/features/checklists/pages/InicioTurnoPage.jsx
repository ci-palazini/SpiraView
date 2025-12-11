// src/pages/InicioTurnoPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './InicioTurnoPage.module.css';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

// API já existentes
import {
  listarMaquinas,
  listarSubmissoesDiarias,
  enviarChecklistDiaria,
  getMaquina, // usa checklist_diario / checklistDiario da máquina
} from '../../../services/apiClient';

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}
function normalizeChecklist(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && Array.isArray(raw.items)) return raw.items;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

export default function InicioTurnoPage({ user }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const operadorEmail = useMemo(
    () => String(user?.email || '').toLowerCase(),
    [user?.email]
  );
  const operadorNome = user?.nome || '';

  // PASSO 1 - seleção
  const [todasMaquinas, setTodasMaquinas] = useState([]);
  const [turno, setTurno] = useState('turno1');
  const [selecionadas, setSelecionadas] = useState([]);
  const [enviadasHoje, setEnviadasHoje] = useState(new Set());
  const [loading, setLoading] = useState(true);

  // PASSO 2 - checklists (wizard)
  const [modo, setModo] = useState('selecionar'); // 'selecionar' | 'checklist'
  const [idx, setIdx] = useState(0);              // índice da máquina atual
  const [maquinaAtual, setMaquinaAtual] = useState(null);
  const [perguntas, setPerguntas] = useState([]);
  const [respostas, setRespostas] = useState({}); // { pergunta: 'sim'|'nao' }
  const [salvando, setSalvando] = useState(false);

  // Carrega máquinas e já marca “enviada hoje” (do backend)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const lista = await listarMaquinas(); // [{id,nome,...}]
        const ordenada = [...lista].sort((a, b) =>
          String(a.nome || '').localeCompare(String(b.nome || ''), 'pt')
        );
        if (!alive) return;
        setTodasMaquinas(ordenada);

        // quem eu já enviei hoje (do backend)
        if (operadorEmail) {
          const resp = await listarSubmissoesDiarias({ operadorEmail, date: hojeISO() });
          const items = Array.isArray(resp) ? resp : (Array.isArray(resp?.items) ? resp.items : []);
          const ids = new Set(
            items
              .map(r => r?.maquinaId ?? r?.maquina_id ?? r?.maquina?.id ?? null)
              .filter(Boolean)
              .map(String)
          );
          if (!alive) return;
          setEnviadasHoje(ids);
        }
      } catch (e) {
        console.error(e);
        toast.error(t('common.loadError', 'Falha ao carregar dados.'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [operadorEmail, t]);

  // Selecionar / deselecionar
  const toggleMaquina = (id) => {
    setSelecionadas(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Avança para o passo de checklists
  const iniciarChecklists = async () => {
    if (selecionadas.length === 0) {
      toast.error(t('inicioTurno.alert.selectOne', 'Selecione ao menos 1 máquina.'));
      return;
    }
    setIdx(0);
    setModo('checklist');
  };

  // Carrega perguntas da máquina atual quando entramos no modo checklist ou trocamos idx
  useEffect(() => {
    let alive = true;
    (async () => {
      if (modo !== 'checklist') return;
      const id = selecionadas[idx];
      if (!id) return;

      try {
        setMaquinaAtual(null);
        setPerguntas([]);
        setRespostas({});
        const m = await getMaquina(id); // { id, nome, checklist_diario? }
        if (!alive) return;

        setMaquinaAtual(m);
        const raw = m.checklist_diario ?? m.checklistDiario ?? [];
        const lista = normalizeChecklist(raw);
        const iniciais = {};
        lista.forEach(item => { iniciais[item] = 'sim'; });
        setPerguntas(lista);
        setRespostas(iniciais);
      } catch (e) {
        console.error(e);
        toast.error(t('checklist.toastFail', 'Falha ao carregar checklist.'));
      }
    })();
    return () => { alive = false; };
  }, [modo, idx, selecionadas, t]);

  const handleResp = (pergunta, valor) => {
    setRespostas(prev => ({ ...prev, [pergunta]: valor }));
  };

  const enviarChecklistAtual = async () => {
    if (!maquinaAtual || salvando) return;
    setSalvando(true);
    try {
      await enviarChecklistDiaria({
        operadorEmail,
        operadorNome,
        maquinaId: maquinaAtual.id,
        maquinaNome: maquinaAtual.nome || '',
        date: hojeISO(),
        respostas,
        turno,
      });

      // marca como enviada hoje
      setEnviadasHoje(prev => new Set([...prev, String(maquinaAtual.id)]));

      // próxima máquina ou fim
      if (idx + 1 < selecionadas.length) {
        setIdx(idx + 1);
      } else {
        toast.success(t('checklist.allDone', 'Checklists concluídas!'));
        navigate('/', { replace: true }); // vai para a home do operador (MainLayout)
      }
    } catch (e) {
      console.error(e);
      toast.error(t('checklist.toastFail', 'Falha ao enviar checklist.'));
    } finally {
      setSalvando(false);
    }
  };

  // Sair (limpa sessão)
  const handleLogout = () => {
    try { localStorage.removeItem('usuario'); } catch { }
    navigate('/login', { replace: true });
  };

  // ------------- RENDER -------------
  if (loading) return <div className={styles.pageContainer}><p>Carregando…</p></div>;

  if (modo === 'selecionar') {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.card}>
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <h1>{t('inicioTurno.title', 'Início de turno')}</h1>
              <p>{t('inicioTurno.greeting', { name: operadorNome })}</p>
            </div>
            <button className={styles.escapeButton} onClick={handleLogout}>
              {t('common.logout', 'Sair')}
            </button>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="turno">{t('inicioTurno.fields.shift', 'Turno')}</label>
            <select
              id="turno"
              className={styles.select}
              value={turno}
              onChange={(e) => setTurno(e.target.value)}
            >
              <option value="turno1">{t('inicioTurno.shifts.shift1', 'Turno 1')}</option>
              <option value="turno2">{t('inicioTurno.shifts.shift2', 'Turno 2')}</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>{t('inicioTurno.fields.machinesLabel', 'Máquinas do seu turno')}</label>
            <div className={styles.machineList}>
              {todasMaquinas.map(m => {
                const jaEnviou = enviadasHoje.has(String(m.id));
                return (
                  <div key={m.id} className={styles.machineCheckbox}>
                    <input
                      type="checkbox"
                      id={`m-${m.id}`}
                      checked={selecionadas.includes(m.id)}
                      onChange={() => toggleMaquina(m.id)}
                    />
                    <label htmlFor={`m-${m.id}`}>
                      {m.nome}
                      {jaEnviou && (
                        <span className={styles.badgeEnviada}>
                          {t('inicioTurno.sentToday', '✓ enviada hoje')}
                        </span>
                      )}
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.actionsRow}>
            <button className={styles.button} onClick={iniciarChecklists}>
              {t('inicioTurno.confirmBtn', 'Confirmar e iniciar checklists')}
            </button>
            <button
              className={styles.buttonSecondary}
              onClick={() => navigate('/', { replace: true })}
            >
              {t('common.cancel', 'Cancelar')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // modo === 'checklist'
  return (
    <div className={styles.pageContainer}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <h1>
              {t('checklist.title', { machine: maquinaAtual?.nome || '' })}{' '}
              <small>({idx + 1}/{selecionadas.length})</small>
            </h1>
            <p>{t('checklist.greeting', { name: operadorNome })}</p>
          </div>
          <button className={styles.escapeButton} onClick={handleLogout}>
            {t('common.logout', 'Sair')}
          </button>
        </div>

        {perguntas.length === 0 && (
          <p>{t('checklist.empty', 'Não há itens configurados para esta máquina.')}</p>
        )}

        {perguntas.map((pergunta, i) => (
          <div key={i} className={styles.checklistItem}>
            <span>{pergunta}</span>
            <div className={styles.optionGroup}>
              <input
                type="radio"
                id={`sim-${i}`}
                name={`item-${i}`}
                checked={respostas[pergunta] === 'sim'}
                onChange={() => handleResp(pergunta, 'sim')}
              />
              <label htmlFor={`sim-${i}`}>{t('checklist.yes', 'Sim')}</label>

              <input
                type="radio"
                id={`nao-${i}`}
                name={`item-${i}`}
                checked={respostas[pergunta] === 'nao'}
                onChange={() => handleResp(pergunta, 'nao')}
              />
              <label htmlFor={`nao-${i}`}>{t('checklist.no', 'Não')}</label>
            </div>
          </div>
        ))}

        <div className={styles.actionsRow}>
          <button
            className={styles.buttonSecondary}
            disabled={idx === 0 || salvando}
            onClick={() => setIdx(Math.max(0, idx - 1))}
          >
            {t('common.back', 'Voltar')}
          </button>

          <button
            className={styles.submitButton}
            disabled={salvando}
            onClick={enviarChecklistAtual}
            title={t('checklist.send', 'Enviar')}
          >
            {salvando ? t('checklist.sending', 'Enviando…') :
              (idx + 1 < selecionadas.length
                ? t('checklist.sendAndNext', 'Enviar e próxima')
                : t('checklist.finishAll', 'Enviar e finalizar'))
            }
          </button>
        </div>
      </div>
    </div>
  );
}
