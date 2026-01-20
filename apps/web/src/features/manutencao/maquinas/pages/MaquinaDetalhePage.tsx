// src/features/maquinas/pages/MaquinaDetalhePage.tsx
import React, { useState, useEffect, useRef, useMemo, FormEvent, ChangeEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    getMaquina,
    listarChamadosPorMaquina,
    addChecklistItem,
    removeChecklistItem,
    reorderChecklistItems,
    listarSubmissoesDiarias,
} from '../../../../services/apiClient';
import toast from 'react-hot-toast';
import styles from './MaquinaDetalhePage.module.css';
import { FiTrash2, FiCheckCircle, FiXCircle, FiDownload } from 'react-icons/fi';
import { ChevronUp, ChevronDown, AlertCircle, History, ClipboardList, QrCode } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { df, statusKey } from '../../../../i18n/format';
import { Button, Input, EmptyState } from '../../../../shared/components';
import Modal from '../../../../shared/components/Modal';
import PageHeader from '../../../../shared/components/PageHeader';

// ---------- Types ----------
interface User {
    role?: string;
    email?: string;
}

export interface MaquinaDetalhePageProps {
    user: User;
}

interface Maquina {
    id: string;
    nome: string;
    checklist_diario?: string[];
    checklistDiario?: string[];
    historicoChecklist?: HistoricoDia[];
    checklistHistorico?: Submissao[];
}

interface HistoricoDia {
    dia: string;
    turno1_ok?: boolean;
    turno2_ok?: boolean;
    turno1_operadores?: string;
    turno2_operadores?: string;
}

interface Submissao {
    id?: string;
    criado_em?: string;
    operador_nome?: string;
    operador_email?: string;
    maquina_id?: string;
    respostas?: Record<string, string>;
    turno?: string;
}

interface Chamado {
    id: string;
    criado_em?: string;
    tipo?: string;
    status?: string;
    descricao?: string;
}

type TabType = 'ativos' | 'historico' | 'checklist' | 'qrcode';

// ---------- Main Component ----------
const MaquinaDetalhePage = ({ user }: MaquinaDetalhePageProps) => {
    const { t, i18n } = useTranslation();
    const { id } = useParams<{ id: string }>();

    const [maquina, setMaquina] = useState<Maquina | null>(null);
    const [chamadosConcluidos, setChamadosConcluidos] = useState<Chamado[]>([]);
    const [chamadosAtivos, setChamadosAtivos] = useState<Chamado[]>([]);

    // HistÃ³rico do back
    const [historicoDiario, setHistoricoDiario] = useState<HistoricoDia[]>([]);
    const [submissoesRecentes, setSubmissoesRecentes] = useState<Submissao[]>([]);

    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('ativos');
    const [novoItemChecklist, setNovoItemChecklist] = useState('');
    const [reloadTick, setReloadTick] = useState(0);

    // Modal de detalhe da submissÃ£o
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTitulo, setModalTitulo] = useState('');
    const [modalSubmissoes, setModalSubmissoes] = useState<Submissao[]>([]);

    const qrCodeRef = useRef<HTMLDivElement>(null);
    const fmtDate = useMemo(() => df({ dateStyle: 'short' }), [i18n.language]);
    const fmtDateTime = useMemo(() => df({ dateStyle: 'short', timeStyle: 'short' }), [i18n.language]);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);

                // 1) MÃ¡quina + histÃ³rico (o back jÃ¡ manda)
                const m = await getMaquina(id!);
                if (!alive) return;

                setMaquina({
                    ...m,
                    checklistDiario: m.checklist_diario ?? m.checklistDiario ?? []
                });

                setHistoricoDiario(Array.isArray(m.historicoChecklist) ? m.historicoChecklist : []);
                setSubmissoesRecentes(Array.isArray(m.checklistHistorico) ? m.checklistHistorico : []);

                // 2) Chamados
                const [abertos, andamento, concluidos] = await Promise.all([
                    listarChamadosPorMaquina(id!, { status: 'Aberto' }),
                    listarChamadosPorMaquina(id!, { status: 'Em Andamento' }),
                    listarChamadosPorMaquina(id!, { status: 'Concluido' }),
                ]);
                if (!alive) return;

                const sortByCriado = (a: Chamado, b: Chamado) =>
                    new Date(b.criado_em || 0).getTime() - new Date(a.criado_em || 0).getTime();
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
            await addChecklistItem(id!, novoItemChecklist.trim(), { role: user.role, email: user.email });
            toast.success(t('maquinaDetalhe.toasts.itemAdded'));
            setNovoItemChecklist('');
            setReloadTick(n => n + 1);
        } catch (e) {
            console.error(e);
            toast.error(t('maquinaDetalhe.toasts.itemAddError'));
        }
    };

    const handleRemoverItemChecklist = async (itemParaRemover: string) => {
        if (!window.confirm(t('maquinaDetalhe.checklist.confirmRemove', { item: itemParaRemover }))) return;
        try {
            await removeChecklistItem(id!, itemParaRemover, { role: user.role, email: user.email });
            toast.success(t('maquinaDetalhe.toasts.itemRemoved'));
            setReloadTick(n => n + 1);
        } catch (e) {
            console.error(e);
            toast.error(t('maquinaDetalhe.toasts.itemRemoveError'));
        }
    };

    const handleMoveItem = async (index: number, direction: 'up' | 'down') => {
        if (!maquina?.checklistDiario) return;
        const items = [...maquina.checklistDiario];
        const newIndex = direction === 'up' ? index - 1 : index + 1;

        if (newIndex < 0 || newIndex >= items.length) return;

        // Swap items
        [items[index], items[newIndex]] = [items[newIndex], items[index]];

        try {
            await reorderChecklistItems(id!, items, { role: user.role, email: user.email });
            setMaquina(prev => prev ? { ...prev, checklistDiario: items } : prev);
        } catch (e) {
            console.error(e);
            toast.error(t('maquinaDetalhe.toasts.reorderError', 'Erro ao reordenar itens'));
        }
    };

    if (loading) return <p style={{ padding: 20 }}>{t('maquinaDetalhe.loading')}</p>;
    if (!maquina) return <p style={{ padding: 20 }}>{t('maquinaDetalhe.notFound')}</p>;

    // ---------- ListaDeChamados interno (igual ao JSX original) ----------
    interface ListaDeChamadosProps {
        lista: Chamado[];
        titulo: string;
        mensagemVazia: string;
    }

    const ListaDeChamados = ({ lista, titulo, mensagemVazia }: ListaDeChamadosProps) => (
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
                                            status: t(`status.${statusKey ? statusKey(chamado.status || '') : 'open'}`)
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
            const pngUrl = (canvas as HTMLCanvasElement).toDataURL('image/png').replace('image/png', 'image/octet-stream');
            const downloadLink = document.createElement('a');
            downloadLink.href = pngUrl;
            downloadLink.download = `${maquina.nome}-QRCode.png`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        }
    };

    // ========= Detalhe por operador (modal) =========
    const deriveTurno = (turno: string | undefined, criadoEmStr: string | undefined): string => {
        const turnoStr = String(turno || '').toLowerCase();
        if (turnoStr === 'turno1' || turnoStr === '1' || turnoStr === '1Âº') return 'turno1';
        if (turnoStr === 'turno2' || turnoStr === '2' || turnoStr === '2Âº') return 'turno2';
        // sem turno explÃ­cito: deduz pelo horÃ¡rio
        const hh = parseInt((criadoEmStr || '').slice(11, 13), 10);
        return !isNaN(hh) && hh >= 14 ? 'turno2' : 'turno1';
    };

    const abrirDetalheOperador = async (diaISO: string, turno: string, operadorNome: string) => {
        try {
            // 1) Fallback local: procurar nas submissÃµes recentes que jÃ¡ vieram do back
            const locais = (submissoesRecentes || []).filter((s) => {
                const sDia = String(s.criado_em || '').slice(0, 10);
                const sTurno = deriveTurno(s.turno, s.criado_em);
                return (
                    String(s.maquina_id) === String(id) &&
                    sDia === diaISO &&
                    sTurno === turno &&
                    String(s.operador_nome || '').trim() === String(operadorNome || '').trim() &&
                    s.respostas
                );
            });

            if (locais.length > 0) {
                setModalTitulo(
                    `${fmtDate.format(new Date(`${diaISO}T00:00:00`))} â€¢ ${turno === 'turno1' ? t('maquinaDetalhe.checklist.columns.turn1') : t('maquinaDetalhe.checklist.columns.turn2')} â€¢ ${operadorNome}`
                );
                setModalSubmissoes(locais);
                setModalOpen(true);
                return;
            }

            // 2) Se nÃ£o encontrou localmente, tenta via e-mail
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
                toast.error(t('maquinaDetalhe.checklist.detailNoEmail', 'NÃ£o foi possÃ­vel localizar o e-mail deste operador para esse dia.'));
                return;
            }

            const subms = await listarSubmissoesDiarias({ operadorEmail: email, date: diaISO });
            const items: Submissao[] = Array.isArray(subms) ? subms : (Array.isArray((subms as { items?: Submissao[] })?.items) ? (subms as { items: Submissao[] }).items : []);
            const filtradas = items.filter((s) => {
                if (String(s.maquina_id) !== String(id)) return false;
                const sTurno = deriveTurno(s.turno, s.criado_em);
                return sTurno === turno;
            });

            if (filtradas.length === 0) {
                toast(t('maquinaDetalhe.checklist.detailEmpty', 'NÃ£o hÃ¡ submissÃµes encontradas para esse dia/turno.'));
                return;
            }

            setModalTitulo(
                `${fmtDate.format(new Date(`${diaISO}T00:00:00`))} â€¢ ${turno === 'turno1' ? t('maquinaDetalhe.checklist.columns.turn1') : t('maquinaDetalhe.checklist.columns.turn2')} â€¢ ${operadorNome}`
            );
            setModalSubmissoes(filtradas);
            setModalOpen(true);
        } catch (e) {
            console.error(e);
            toast.error(t('maquinaDetalhe.toasts.loadError'));
        }
    };

    // helper para transformar "Fulano, Sicrana" em array
    const splitNomes = (s: string | undefined): string[] =>
        String(s || '')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);

    // Helper para formatar a string YYYY-MM-DD vinda do back
    const fmtDia = (diaStr: string): string => {
        try { return fmtDate.format(new Date(`${diaStr}T00:00:00`)); }
        catch { return diaStr; }
    };

    return (
        <>
            <PageHeader
                title={maquina.nome}
                subtitle={t('maquinaDetalhe.subtitle')}
            />

            {(user.role === 'gestor industrial' || user.role === 'admin') ? (
                <div>
                    <nav className={styles.tabs}>
                        <button className={`${styles.tabButton} ${activeTab === 'ativos' ? styles.active : ''}`} onClick={() => setActiveTab('ativos')}>
                            <AlertCircle size={16} />
                            {t('maquinaDetalhe.tabs.active')}
                        </button>
                        <button className={`${styles.tabButton} ${activeTab === 'historico' ? styles.active : ''}`} onClick={() => setActiveTab('historico')}>
                            <History size={16} />
                            {t('maquinaDetalhe.tabs.history')}
                        </button>
                        <button className={`${styles.tabButton} ${activeTab === 'checklist' ? styles.active : ''}`} onClick={() => setActiveTab('checklist')}>
                            <ClipboardList size={16} />
                            {t('maquinaDetalhe.tabs.checklist')}
                        </button>
                        <button className={`${styles.tabButton} ${activeTab === 'qrcode' ? styles.active : ''}`} onClick={() => setActiveTab('qrcode')}>
                            <QrCode size={16} />
                            {t('maquinaDetalhe.tabs.qrcode')}
                        </button>
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
                                    <EmptyState title={t('maquinaDetalhe.checklist.empty')} />
                                )}

                                <ul className={styles.operatorList}>
                                    {maquina.checklistDiario?.map((item, index) => (
                                        <li key={index} className={styles.checklistItemManage}>
                                            <span className={styles.checklistItemNumber}>{index + 1}</span>
                                            <span>{item}</span>
                                            <div className={styles.checklistItemActions}>
                                                <button
                                                    onClick={() => handleMoveItem(index, 'up')}
                                                    className={styles.orderButton}
                                                    disabled={index === 0}
                                                    title={t('maquinaDetalhe.checklist.moveUp', 'Mover para cima')}
                                                >
                                                    <ChevronUp size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleMoveItem(index, 'down')}
                                                    className={styles.orderButton}
                                                    disabled={index === (maquina.checklistDiario?.length || 0) - 1}
                                                    title={t('maquinaDetalhe.checklist.moveDown', 'Mover para baixo')}
                                                >
                                                    <ChevronDown size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleRemoverItemChecklist(item)}
                                                    className={`${styles.opActionButton} ${styles.removeButton}`}
                                                    title={t('maquinaDetalhe.checklist.remove')}
                                                >
                                                    <FiTrash2 />
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>

                                <form
                                    className={styles.checklistInputForm}
                                    onSubmit={(e: FormEvent) => {
                                        e.preventDefault();
                                        handleAdicionarItemChecklist();
                                    }}
                                >
                                    <Input
                                        id="novo-item-checklist"
                                        type="text"
                                        value={novoItemChecklist}
                                        onChange={(e) => setNovoItemChecklist(e.target.value)}
                                        placeholder={t('maquinaDetalhe.checklist.placeholder')}
                                    />
                                    <Button type="submit">
                                        {t('maquinaDetalhe.checklist.add')}
                                    </Button>
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
                                                                title={t('maquinaDetalhe.checklist.viewSubmission', 'Ver submissÃ£o')}
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
                                                                title={t('maquinaDetalhe.checklist.viewSubmission', 'Ver submissÃ£o')}
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

                                <Button onClick={handleDownloadQRCode}>
                                    <FiDownload /> {t('maquinaDetalhe.qrcode.download')}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                // VISÃƒO DO MANUTENTOR
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

            <Modal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={modalTitulo}
            >
                {modalSubmissoes.map((s) => (
                    <div key={s.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                        <div style={{ marginBottom: 8, fontSize: 13, color: '#6b7280' }}>
                            {t('maquinaDetalhe.checklist.submittedAt', 'Enviado em')}: {s.criado_em ? fmtDateTime.format(new Date(s.criado_em)) : 'â€”'}
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
            </Modal>
        </>
    );
};

export default MaquinaDetalhePage;
