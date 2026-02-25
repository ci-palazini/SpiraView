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
    Clock,
    X
} from 'lucide-react';

// API já existentes
import {
    listarMaquinas,
    listarSubmissoesDiarias,
    enviarChecklistDiaria,
    getMaquina,
    getChecklistOverview,
} from '../../../../services/apiClient';

// ---------- Types ----------
interface User {
    email?: string;
    nome?: string;
}

interface InicioTurnoPageProps {
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
 * Retorna a data de referência do checklist considerando a regra de turnos:
 * - Se a hora atual for entre 00:00 e 00:44, pertence ao 2º turno do DIA ANTERIOR
 * - Caso contrário, é a data atual
 */
function getDataReferenciaChecklist(): string {
    const agora = new Date();
    const hora = agora.getHours();
    const minutos = agora.getMinutes();

    // Se for entre 00:00 e 00:44, pertence ao dia anterior (2º turno)
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
    const [overviewData, setOverviewData] = useState<Record<string, { t1Ok: boolean, t2Ok: boolean, t1Nomes: string[], t2Nomes: string[] }>>({});
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

    // Novo estado para o alerta
    const [showAlertTurno, setShowAlertTurno] = useState(true);

    // Carrega máquinas e já marca "enviada hoje" (do backend)
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const lista: Maquina[] = await listarMaquinas({ escopo: 'manutencao' });
                // buscar overview do dia para todas as máquinas e operadores
                let overviewResp: any[] = [];
                try {
                    overviewResp = await getChecklistOverview(getDataReferenciaChecklist());
                    if (!alive) return;
                    const overviewMap: Record<string, { t1Ok: boolean, t2Ok: boolean, t1Nomes: string[], t2Nomes: string[] }> = {};
                    overviewResp.forEach(o => {
                        overviewMap[String(o.id)] = {
                            t1Ok: o.turno1Ok,
                            t2Ok: o.turno2Ok,
                            t1Nomes: o.turno1Nomes,
                            t2Nomes: o.turno2Nomes
                        };
                    });
                    setOverviewData(overviewMap);
                } catch (e) {
                    console.error('Erro ao buscar overview diário', e);
                }

                // Filtrar máquinas que têm checklist configurado usando dados do overview
                const hasChecklistMap = new Map(overviewResp.map(o => [String(o.id), o.hasChecklist]));

                const ordenada = [...lista]
                    .filter(m => hasChecklistMap.get(String(m.id)) === true)
                    .sort((a, b) =>
                        String(a.nome || '').localeCompare(String(b.nome || ''), 'pt')
                    );
                if (!alive) return;
                setTodasMaquinas(ordenada);

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

                // Verifica se já existe submissão deste operador para esta máquina hoje
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
                    console.error('Erro ao buscar submissões anteriores:', e);
                }

                const iniciais: Respostas = {};
                lista.forEach(item => {
                    // Se já tem resposta anterior, usa ela
                    if (respostasAnteriores && item in respostasAnteriores) {
                        iniciais[item] = respostasAnteriores[item];
                    } else if (bloqueados.has(slugify(item))) {
                        // Se item está bloqueado por chamado, força 'nao'
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

            // marca como enviada hoje no overview local
            setOverviewData(prev => ({
                ...prev,
                [String(maquinaAtual.id)]: {
                    ...(prev[String(maquinaAtual.id)] || { t1Ok: false, t2Ok: false, t1Nomes: [], t2Nomes: [] }),
                    [turno === 'turno1' ? 't1Ok' : 't2Ok']: true,
                    [turno === 'turno1' ? 't1Nomes' : 't2Nomes']: [
                        ...(prev[String(maquinaAtual.id)]?.[turno === 'turno1' ? 't1Nomes' : 't2Nomes'] || []),
                        operadorNome
                    ].filter((v, i, a) => a.indexOf(v) === i) // unique names
                }
            }));

            // próxima máquina ou fim
            if (idx + 1 < selecionadas.length) {
                setIdx(idx + 1);
            } else {
                toast.success(t('checklist.allDone', 'Checklists concluídas!'));
                navigate('/', { replace: true });
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
        try { localStorage.removeItem('usuario'); } catch { /* ignore */ }
        window.dispatchEvent(new Event('auth-user-changed'));
        navigate('/login', { replace: true });
    };

    // ------------- RENDER -------------
    if (loading) {
        return (
            <div className={styles.pageContainer}>
                <div className={styles.loadingContainer}>
                    <div className={styles.spinner} />
                    <p>{t('common.loading', 'Carregando...')}</p>
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
                                {t('inicioTurno.title', 'Início de turno')}
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

                    {showAlertTurno && (
                        <div className={styles.shiftAlert}>
                            <div className={styles.shiftAlertIcon}>
                                <Clock size={20} />
                            </div>
                            <div className={styles.shiftAlertContent}>
                                <p className={styles.shiftAlertTitle}>{t('inicioTurno.alert.checkShiftTitle', 'Confirme seu turno!')}</p>
                                <p className={styles.shiftAlertText}>
                                    {t('inicioTurno.alert.checkShiftText', 'O sistema selecionou automaticamente o turno com base no horário. Verifique se está correto antes de prosseguir.')}
                                </p>
                            </div>
                            <button className={styles.shiftAlertClose} onClick={() => setShowAlertTurno(false)}>
                                <X size={16} />
                            </button>
                        </div>
                    )}

                    <div className={styles.formGroup}>
                        <label>{t('inicioTurno.fields.machinesLabel', 'Máquinas do seu turno')}</label>
                        <div className={styles.machineList}>
                            {todasMaquinas.map(m => {
                                const mIdStr = String(m.id);
                                const overview = overviewData[mIdStr];
                                const isT1 = turno === 'turno1';
                                const jaEnviouNoTurno = isT1 ? overview?.t1Ok : overview?.t2Ok;
                                const nomesEnviouNoTurno = isT1 ? overview?.t1Nomes : overview?.t2Nomes;

                                return (
                                    <label key={m.id} className={jaEnviouNoTurno ? styles.machineCheckboxEnviada : styles.machineCheckbox}>
                                        <input
                                            type="checkbox"
                                            checked={selecionadas.includes(m.id)}
                                            onChange={() => toggleMaquina(m.id)}
                                        />
                                        <span className={styles.machineInfo}>
                                            {m.nome}
                                            {jaEnviouNoTurno && (
                                                <span className={styles.badgeEnviada} title={nomesEnviouNoTurno?.join(', ')}>
                                                    <CheckCircle2 size={12} />
                                                    {t('inicioTurno.sentToday', 'enviado')}
                                                    {nomesEnviouNoTurno && nomesEnviouNoTurno.length > 0 && ` (${nomesEnviouNoTurno[0]})`}
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
                        {t('checklist.alreadySent', 'Checklist já enviado hoje')}
                    </div>
                )}

                {perguntas.length === 0 && (
                    <div className={styles.emptyState}>
                        {t('checklist.empty', 'Não há itens configurados para esta máquina.')}
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
                            title={isLocked ? t('checklist.itemLockedHint', 'Este item já possui um chamado aberto') : undefined}
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
                            t('checklist.sending', 'Enviando...')
                        ) : (
                            <>
                                <Send size={20} />
                                {idx + 1 < selecionadas.length
                                    ? t('checklist.sendAndNext', 'Enviar e próxima')
                                    : t('checklist.finishAll', 'Enviar e finalizar')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
