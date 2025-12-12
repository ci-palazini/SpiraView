// src/features/maquinas/pages/MaquinaDetalhePage.tsx
import React, { useState, useEffect, useRef, useMemo, FormEvent, ChangeEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    getMaquina,
    listarChamadosPorMaquina,
    addChecklistItem,
    removeChecklistItem,
    listarSubmissoesDiarias,
} from '../../../services/apiClient';
import toast from 'react-hot-toast';
import styles from './MaquinaDetalhePage.module.css';
import { FiTrash2, FiCheckCircle, FiXCircle, FiDownload } from 'react-icons/fi';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { df, statusKey } from '../../../i18n/format';

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
    respostas?: Record<string, string>;
    turno?: string;
}

interface Chamado {
    id: string;
    criado_em?: string;
    tipo?: string;
    status?: string;
    maquina?: string;
    descricao?: string;
    assunto?: string;
}

type TabType = 'ativos' | 'historico' | 'checklist' | 'qrcode';

// ---------- Helper Components ----------
interface ListaDeChamadosProps {
    lista: Chamado[];
    titulo: string;
    mensagemVazia: string;
}

function ListaDeChamados({ lista, titulo, mensagemVazia }: ListaDeChamadosProps) {
    const { t, i18n } = useTranslation();
    const fmtDate = useMemo(() => df({ dateStyle: 'short' }), [i18n.language]);

    if (!lista.length) {
        return (
            <div className={styles.listaVazia}>
                <h3>{titulo}</h3>
                <p>{mensagemVazia}</p>
            </div>
        );
    }

    return (
        <div className={styles.listaContainer}>
            <h3>{titulo}</h3>
            <ul className={styles.chamadosList}>
                {lista.map((chamado) => (
                    <li key={chamado.id} className={styles.chamadoItem}>
                        <Link to={`/chamados/${chamado.id}`} className={styles.chamadoLink}>
                            <span className={styles.chamadoTipo}>{chamado.tipo}</span>
                            <span className={styles.chamadoAssunto}>
                                {chamado.assunto || chamado.descricao || '—'}
                            </span>
                            <span className={styles.chamadoStatus}>
                                {t(statusKey(chamado.status || ''))}
                            </span>
                            <span className={styles.chamadoData}>
                                {chamado.criado_em ? fmtDate.format(new Date(chamado.criado_em)) : '—'}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ---------- Main Component ----------
const MaquinaDetalhePage = ({ user }: MaquinaDetalhePageProps) => {
    const { t, i18n } = useTranslation();
    const { id } = useParams<{ id: string }>();

    const [maquina, setMaquina] = useState<Maquina | null>(null);
    const [chamadosConcluidos, setChamadosConcluidos] = useState<Chamado[]>([]);
    const [chamadosAtivos, setChamadosAtivos] = useState<Chamado[]>([]);

    const [historicoDiario, setHistoricoDiario] = useState<HistoricoDia[]>([]);
    const [submissoesRecentes, setSubmissoesRecentes] = useState<Submissao[]>([]);

    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('ativos');
    const [novoItemChecklist, setNovoItemChecklist] = useState('');
    const [reloadTick, setReloadTick] = useState(0);

    // Modal de detalhe da submissão
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTitulo, setModalTitulo] = useState('');
    const [modalSubmissoes, setModalSubmissoes] = useState<Submissao[]>([]);

    const qrCodeRef = useRef<HTMLDivElement>(null);
    const fmtDate = useMemo(() => df({ dateStyle: 'short' }), [i18n.language]);
    const fmtDateTime = useMemo(() => df({ dateStyle: 'short', timeStyle: 'short' }), [i18n.language]);

    const isGestor = user?.role === 'gestor' || user?.role === 'admin';

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);

                const m: Maquina = await getMaquina(id!);
                if (!alive) return;

                setMaquina({
                    ...m,
                    checklistDiario: m.checklist_diario ?? m.checklistDiario ?? []
                });

                setHistoricoDiario(Array.isArray(m.historicoChecklist) ? m.historicoChecklist : []);
                setSubmissoesRecentes(Array.isArray(m.checklistHistorico) ? m.checklistHistorico : []);

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

    const handleDownloadQRCode = () => {
        const canvas = qrCodeRef.current?.querySelector('canvas');
        if (!canvas) return;
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = url;
        link.download = `qrcode-${maquina?.nome || id}.png`;
        link.click();
    };

    const splitNomes = (str: string | undefined): string[] =>
        (str || '').split(',').map(s => s.trim()).filter(Boolean);

    const fmtDia = (iso: string) => {
        try {
            return fmtDate.format(new Date(iso + 'T12:00:00'));
        } catch {
            return iso;
        }
    };

    const abrirDetalheOperador = async (dia: string, turno: string, operadorNome: string) => {
        try {
            const resp = await listarSubmissoesDiarias({
                maquinaId: id,
                date: dia,
                turno,
            });
            const items: Submissao[] = Array.isArray(resp)
                ? resp
                : (Array.isArray((resp as { items?: Submissao[] })?.items) ? (resp as { items: Submissao[] }).items : []);

            const filtradas = items.filter(
                (s) => (s.operador_nome || '').toLowerCase() === operadorNome.toLowerCase()
            );

            setModalTitulo(`${operadorNome} — ${fmtDia(dia)} (${turno === 'turno1' ? '1º turno' : '2º turno'})`);
            setModalSubmissoes(filtradas.length ? filtradas : items);
            setModalOpen(true);
        } catch (e) {
            console.error(e);
            toast.error(t('maquinaDetalhe.toasts.loadSubmissionError', 'Erro ao carregar submissão'));
        }
    };

    if (loading) {
        return (
            <div className={styles.pageContainer}>
                <p>{t('common.loading', 'Carregando...')}</p>
            </div>
        );
    }

    if (!maquina) {
        return (
            <div className={styles.pageContainer}>
                <p>{t('maquinaDetalhe.notFound', 'Máquina não encontrada.')}</p>
                <Link to="/maquinas">{t('maquinaDetalhe.backToList', 'Voltar para lista')}</Link>
            </div>
        );
    }

    const checklistItems = maquina.checklistDiario || [];

    return (
        <>
            <header className={styles.header}>
                <div>
                    <h1>{maquina.nome}</h1>
                    <Link to="/maquinas" className={styles.backLink}>
                        {t('maquinaDetalhe.backToList', '← Voltar')}
                    </Link>
                </div>
            </header>

            {/* Tabs para gestor */}
            {isGestor ? (
                <div className={styles.tabContainer}>
                    <div className={styles.tabs}>
                        <button
                            className={activeTab === 'ativos' ? styles.activeTab : ''}
                            onClick={() => setActiveTab('ativos')}
                        >
                            {t('maquinaDetalhe.tabs.active', 'Ativos')}
                        </button>
                        <button
                            className={activeTab === 'historico' ? styles.activeTab : ''}
                            onClick={() => setActiveTab('historico')}
                        >
                            {t('maquinaDetalhe.tabs.history', 'Histórico')}
                        </button>
                        <button
                            className={activeTab === 'checklist' ? styles.activeTab : ''}
                            onClick={() => setActiveTab('checklist')}
                        >
                            {t('maquinaDetalhe.tabs.checklist', 'Checklist')}
                        </button>
                        <button
                            className={activeTab === 'qrcode' ? styles.activeTab : ''}
                            onClick={() => setActiveTab('qrcode')}
                        >
                            {t('maquinaDetalhe.tabs.qrcode', 'QR Code')}
                        </button>
                    </div>

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
                            <div className={styles.checklistSection}>
                                <h3>{t('maquinaDetalhe.checklist.title')}</h3>

                                <ul className={styles.checklistList}>
                                    {checklistItems.map((item, idx) => (
                                        <li key={idx} className={styles.checklistItem}>
                                            <span>{item}</span>
                                            <button
                                                onClick={() => handleRemoverItemChecklist(item)}
                                                className={styles.removeButton}
                                                title={t('common.delete')}
                                            >
                                                <FiTrash2 />
                                            </button>
                                        </li>
                                    ))}
                                </ul>

                                <form
                                    onSubmit={(e: FormEvent) => {
                                        e.preventDefault();
                                        handleAdicionarItemChecklist();
                                    }}
                                    className={styles.checklistForm}
                                >
                                    <input
                                        type="text"
                                        value={novoItemChecklist}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNovoItemChecklist(e.target.value)}
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

            {/* Modal simples com o detalhe das respostas */}
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
