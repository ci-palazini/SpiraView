// src/features/checklists/pages/InicioTurnoPage.tsx
import React, { useEffect, useMemo, useState, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './InicioTurnoPage.module.css';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
    LogOut,
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    AlertTriangle,
    ClipboardCheck,
    User,
    Send,
} from 'lucide-react';

// API jÃ¡ existentes
import {
    listarMaquinas,
    listarSubmissoesDiarias,
    enviarChecklistDiaria,
    getMaquina,
} from '../../../../services/apiClient';

// ---------- Types ----------
interface User {
    email?: string;
    nome?: string;
}

export interface InicioTurnoPageProps {
    user: User;
}

interface Maquina {
    id: string;
    nome?: string;
    checklist_diario?: unknown;
    checklistDiario?: unknown;
    itensComChamadoAberto?: string[];
}

interface SubmissaoItem {
    maquinaId?: string;
    maquina_id?: string;
    maquina?: { id?: string };
}

type Respostas = Record<string, 'sim' | 'nao'>;

// ---------- Helpers ----------
/**
 * Retorna a data de referÃªncia do checklist considerando a regra de turnos:
 * - Se a hora atual for entre 00:00 e 00:44, pertence ao 2Âº turno do DIA ANTERIOR
 * - Caso contrÃ¡rio, Ã© a data atual
 */
function getDataReferenciaChecklist(): string {
    const agora = new Date();
    const hora = agora.getHours();
    const minutos = agora.getMinutes();

    // Se for entre 00:00 e 00:44, pertence ao dia anterior (2Âº turno)
    if (hora === 0 && minutos < 45) {
        const ontem = new Date(agora);
        ontem.setDate(ontem.getDate() - 1);
        return ontem.toISOString().slice(0, 10);
    }
    return agora.toISOString().slice(0, 10);
}

function normalizeChecklist(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown[] }).items)) {
        return (raw as { items: string[] }).items;
    }
    if (typeof raw === 'string') {
        try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
    }
    return [];
}

function slugify(input: string): string {
    return String(input ?? '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
}

// ---------- Component ----------
export default function InicioTurnoPage({ user }: InicioTurnoPageProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const operadorEmail = useMemo(
        () => String(user?.email || '').toLowerCase(),
        [user?.email]
    );
    const operadorNome = user?.nome || '';

    const getTurnoPadrao = (): string => {
        const h = new Date().getHours();
        const m = new Date().getMinutes();
        // 2º Turno: começa às 15:18 e vai até 00:44 do dia seguinte
        // Mas aqui simplificamos a sugestão inicial
        const agora = h * 60 + m;
        const inicioTurno2 = 15 * 60 + 18; // 15:18
        const fimTurno2 = 24 * 60 + 44;    // 00:44 (considerando extensão do dia)

        // Se for de madrugada (antes das 05:00), provavelmente ainda é 2º turno estendido
        if (h < 5) return 'turno2';

        // Se passou das 15:18, sugere 2º turno
        if (agora >= inicioTurno2) return 'turno2';

        return 'turno1';
    };

    // PASSO 1 - seleção
    const [todasMaquinas, setTodasMaquinas] = useState<Maquina[]>([]);
    const [turno, setTurno] = useState(() => getTurnoPadrao());
    const [selecionadas, setSelecionadas] = useState<string[]>([]);
    const [enviadasHoje, setEnviadasHoje] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);

    // PASSO 2 - checklists (wizard)
    const [modo, setModo] = useState<'selecionar' | 'checklist'>('selecionar');
    const [idx, setIdx] = useState(0);
    const [maquinaAtual, setMaquinaAtual] = useState<Maquina | null>(null);
    const [perguntas, setPerguntas] = useState<string[]>([]);
    const [respostas, setRespostas] = useState<Respostas>({});
    const [salvando, setSalvando] = useState(false);
    const [itensBloqueados, setItensBloqueados] = useState<Set<string>>(new Set());
    const [jaEnviouEsta, setJaEnviouEsta] = useState(false);

    // Carrega mÃ¡quinas e jÃ¡ marca "enviada hoje" (do backend)
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const lista: Maquina[] = await listarMaquinas({ escopo: 'manutencao' });
                const ordenada = [...lista].sort((a, b) =>
                    String(a.nome || '').localeCompare(String(b.nome || ''), 'pt')
                );
                if (!alive) return;
                setTodasMaquinas(ordenada);

                // quem eu jÃ¡ enviei hoje (do backend)
                if (operadorEmail) {
                    const resp = await listarSubmissoesDiarias({ operadorEmail, date: getDataReferenciaChecklist() });
                    const items: SubmissaoItem[] = Array.isArray(resp) ? resp : (Array.isArray((resp as { items?: SubmissaoItem[] })?.items) ? (resp as { items: SubmissaoItem[] }).items : []);
                    const ids = new Set<string>(
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
    const toggleMaquina = (id: string) => {
        setSelecionadas(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // AvanÃ§a para o passo de checklists
    const iniciarChecklists = async () => {
        if (selecionadas.length === 0) {
            toast.error(t('inicioTurno.alert.selectOne', 'Selecione ao menos 1 mÃ¡quina.'));
            return;
        }
        setIdx(0);
        setModo('checklist');
    };

    // Carrega perguntas da mÃ¡quina atual quando entramos no modo checklist ou trocamos idx
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
                setItensBloqueados(new Set());
                setJaEnviouEsta(false);
                const m: Maquina = await getMaquina(id);
                if (!alive) return;

                setMaquinaAtual(m);
                const raw = m.checklist_diario ?? m.checklistDiario ?? [];
                const lista = normalizeChecklist(raw);

                // Itens com chamado aberto ficam bloqueados
                const bloqueados = new Set<string>(m.itensComChamadoAberto || []);
                setItensBloqueados(bloqueados);

                // Verifica se jÃ¡ existe submissÃ£o deste operador para esta mÃ¡quina hoje
                let respostasAnteriores: Respostas | null = null;
                try {
                    const submissoes = await listarSubmissoesDiarias({
                        operadorEmail,
                        maquinaId: id,
                        date: getDataReferenciaChecklist(),
                    });
                    if (submissoes.length > 0) {
                        const ultimaSubmissao = submissoes[0];
                        const respostasRaw = ultimaSubmissao.respostas;
                        if (respostasRaw && typeof respostasRaw === 'object') {
                            respostasAnteriores = respostasRaw as Respostas;
                        }
                    }
                } catch (e) {
                    console.error('Erro ao buscar submissÃµes anteriores:', e);
                }

                const iniciais: Respostas = {};
                lista.forEach(item => {
                    // Se jÃ¡ tem resposta anterior, usa ela
                    if (respostasAnteriores && item in respostasAnteriores) {
                        iniciais[item] = respostasAnteriores[item];
                    } else if (bloqueados.has(slugify(item))) {
                        // Se item estÃ¡ bloqueado por chamado, forÃ§a 'nao'
                        iniciais[item] = 'nao';
                    } else {
                        iniciais[item] = 'sim';
                    }
                });

                setPerguntas(lista);
                setRespostas(iniciais);
                setJaEnviouEsta(respostasAnteriores !== null);
            } catch (e) {
                console.error(e);
                toast.error(t('checklist.toastFail', 'Falha ao carregar checklist.'));
            }
        })();
        return () => { alive = false; };
    }, [modo, idx, selecionadas, t, operadorEmail]);

    const handleResp = (pergunta: string, valor: 'sim' | 'nao') => {
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
                date: getDataReferenciaChecklist(),
                respostas,
                turno,
            });

            // marca como enviada hoje
            setEnviadasHoje(prev => new Set([...prev, String(maquinaAtual.id)]));

            // prÃ³xima mÃ¡quina ou fim
            if (idx + 1 < selecionadas.length) {
                setIdx(idx + 1);
            } else {
                toast.success(t('checklist.allDone', 'Checklists concluÃ­das!'));
                navigate('/', { replace: true });
            }
        } catch (e) {
            console.error(e);
            toast.error(t('checklist.toastFail', 'Falha ao enviar checklist.'));
        } finally {
            setSalvando(false);
        }
    };

    // Sair (limpa sessÃ£o)
    const handleLogout = () => {
        try { localStorage.removeItem('usuario'); } catch { /* ignore */ }
        navigate('/login', { replace: true });
    };

    // ------------- RENDER -------------
    if (loading) {
        return (
            <div className={styles.pageContainer}>
                <div className={styles.loadingContainer}>
                    <div className={styles.spinner} />
                    <p>{t('common.loading', 'Carregandoâ€¦')}</p>
                </div>
            </div>
        );
    }

    if (modo === 'selecionar') {
        return (
            <div className={styles.pageContainer}>
                <div className={styles.card}>
                    <div className={styles.header}>
                        <div className={styles.headerTitle}>
                            <h1>
                                <ClipboardCheck size={28} style={{ marginRight: 10, verticalAlign: 'middle' }} />
                                {t('inicioTurno.title', 'InÃ­cio de turno')}
                            </h1>
                            <p>
                                <User className={styles.userIcon} />
                                {t('inicioTurno.greeting', { name: operadorNome })}
                            </p>
                        </div>
                        <button className={styles.escapeButton} onClick={handleLogout}>
                            <LogOut size={18} />
                            {t('common.logout', 'Sair')}
                        </button>
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="turno">{t('inicioTurno.fields.shift', 'Turno')}</label>
                        <select
                            id="turno"
                            className={styles.select}
                            value={turno}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => setTurno(e.target.value)}
                        >
                            <option value="turno1">{t('inicioTurno.shifts.shift1', 'Turno 1')}</option>
                            <option value="turno2">{t('inicioTurno.shifts.shift2', 'Turno 2')}</option>
                        </select>
                    </div>

                    <div className={styles.formGroup}>
                        <label>{t('inicioTurno.fields.machinesLabel', 'MÃ¡quinas do seu turno')}</label>
                        <div className={styles.machineList}>
                            {todasMaquinas.map(m => {
                                const jaEnviou = enviadasHoje.has(String(m.id));
                                return (
                                    <label key={m.id} className={styles.machineCheckbox}>
                                        <input
                                            type="checkbox"
                                            checked={selecionadas.includes(m.id)}
                                            onChange={() => toggleMaquina(m.id)}
                                        />
                                        <span className={styles.machineInfo}>
                                            {m.nome}
                                            {jaEnviou && (
                                                <span className={styles.badgeEnviada}>
                                                    <CheckCircle2 size={12} />
                                                    {t('inicioTurno.sentToday', 'enviado')}
                                                </span>
                                            )}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    <div className={styles.actionsRow}>
                        <button
                            className={styles.buttonSecondary}
                            onClick={() => navigate('/', { replace: true })}
                        >
                            <ArrowLeft size={18} />
                            {t('common.cancel', 'Cancelar')}
                        </button>
                        <button className={styles.button} onClick={iniciarChecklists}>
                            {t('inicioTurno.confirmBtn', 'Confirmar e iniciar')}
                            <ArrowRight size={18} />
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
                            {maquinaAtual?.nome || ''}
                            <small> ({idx + 1}/{selecionadas.length})</small>
                        </h1>
                        <p>
                            <User className={styles.userIcon} />
                            {t('inicioTurno.greeting', { name: operadorNome })}
                        </p>
                    </div>
                    <button className={styles.escapeButton} onClick={handleLogout}>
                        <LogOut size={18} />
                        {t('common.logout', 'Sair')}
                    </button>
                </div>

                {jaEnviouEsta && (
                    <div className={styles.badgeEnviada} style={{ marginBottom: 20, display: 'inline-flex' }}>
                        <CheckCircle2 size={14} />
                        {t('checklist.alreadySent', 'Checklist jÃ¡ enviado hoje')}
                    </div>
                )}

                {perguntas.length === 0 && (
                    <div className={styles.emptyState}>
                        {t('checklist.empty', 'NÃ£o hÃ¡ itens configurados para esta mÃ¡quina.')}
                    </div>
                )}

                {perguntas.map((pergunta, i) => {
                    const itemKey = slugify(pergunta);
                    const isLocked = itensBloqueados.has(itemKey);
                    const resp = respostas[pergunta];
                    const isDisabled = isLocked || jaEnviouEsta;

                    return (
                        <div
                            key={i}
                            className={isLocked ? styles.checklistItemLocked : styles.checklistItem}
                            title={isLocked ? t('checklist.itemLockedHint', 'Este item jÃ¡ possui um chamado aberto') : undefined}
                        >
                            <span>
                                {pergunta}
                                {isLocked && (
                                    <span className={styles.badgeChamadoAberto}>
                                        <AlertTriangle size={12} />
                                        {t('checklist.itemLocked', 'Chamado aberto')}
                                    </span>
                                )}
                            </span>
                            <div className={styles.optionGroup}>
                                <button
                                    type="button"
                                    className={`${resp === 'sim'
                                        ? styles.radioButtonSimActive
                                        : styles.radioButtonSim
                                        } ${isDisabled ? styles.radioButtonDisabled : ''}`}
                                    onClick={() => !isDisabled && handleResp(pergunta, 'sim')}
                                    disabled={isDisabled}
                                >
                                    <CheckCircle2 size={20} />
                                    {t('checklist.yes', 'OK')}
                                </button>

                                <button
                                    type="button"
                                    className={`${resp === 'nao'
                                        ? styles.radioButtonNaoActive
                                        : styles.radioButtonNao
                                        } ${isDisabled ? styles.radioButtonDisabled : ''}`}
                                    onClick={() => !isDisabled && handleResp(pergunta, 'nao')}
                                    disabled={isDisabled}
                                >
                                    <AlertTriangle size={20} />
                                    {t('checklist.no', 'Problema')}
                                </button>
                            </div>
                        </div>
                    );
                })}

                <div className={styles.actionsRow}>
                    <button
                        className={styles.buttonSecondary}
                        disabled={salvando}
                        onClick={() => {
                            if (idx === 0) {
                                setModo('selecionar');
                            } else {
                                setIdx(idx - 1);
                            }
                        }}
                    >
                        <ArrowLeft size={18} />
                        {t('common.back', 'Voltar')}
                    </button>

                    <button
                        className={styles.submitButton}
                        disabled={salvando}
                        onClick={enviarChecklistAtual}
                        title={t('checklist.send', 'Enviar')}
                    >
                        {salvando ? (
                            t('checklist.sending', 'Enviandoâ€¦')
                        ) : (
                            <>
                                <Send size={20} />
                                {idx + 1 < selecionadas.length
                                    ? t('checklist.sendAndNext', 'Enviar e prÃ³xima')
                                    : t('checklist.finishAll', 'Enviar e finalizar')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
