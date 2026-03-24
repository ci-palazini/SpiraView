// src/features/chamados/pages/ChamadoDetalhe.tsx
import React, { useEffect, useState, useMemo, useCallback, ChangeEvent, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useParams, useNavigate } from 'react-router-dom';
import {
    getChamado, listarManutentores, listarCausasRaiz,
    atribuirChamado, removerAtribuicao, atenderChamado, entrarChamado, sairChamado,
    adicionarObservacao, concluirChamado, deletarChamado,
    atualizarChecklistChamado,
    listarFotosChamado,
    uploadFotoChamado,
} from '../../../../services/apiClient';
import styles from './ChamadoDetalhe.module.css';
import { useTranslation } from 'react-i18next';
import { statusKey } from '../../../../i18n/format';
import { Button, Select, Card, CardHeader, Badge } from '../../../../shared/components';
import usePermissions from '../../../../hooks/usePermissions';
import { ChevronLeft, ChevronRight, X, FileDown } from 'lucide-react';
import { generatePreventiveReport } from '../utils/generatePreventiveReport';

// ---------- Types ----------
interface User {
    id?: string;
    uid?: string;
    userId?: string;
    email?: string;
    role?: string;
}

interface ChamadoDetalheProps {
    user: User;
}

interface ChecklistItem {
    item: string;
    resposta: 'sim' | 'nao' | null;
}

interface Observacao {
    autor: string;
    data: string | null;
    texto: string;
}

interface Foto {
    id: string;
    url?: string;
    autorNome?: string;
    criadoEm?: string;
}

interface Manutentor {
    uid: string;
    nome: string;
    email: string;
}

interface CausaRaiz {
    nome: string;
}

interface ApiChamado {
    id: string;
    maquina?: string;
    descricao?: string;
    status?: string;
    tipo?: string;
    causa?: string;
    solucao?: string;
    checklist?: unknown[];
    observacoes?: Array<{
        autor?: string;
        criado_em?: string;
        data?: string;
        texto?: string;
    }>;
    criado_por?: string;
    criado_em?: string;
    concluido_em?: string;
    operadorNome?: string;
    dataAbertura?: string;
    dataConclusao?: string;
    manutentor_id?: string;
    manutentor?: string;
    manutentor_email?: string;
    manutentores?: Array<{
        id: string;
        nome: string;
        email: string;
        papel: 'principal' | 'co';
        entrou_em: string;
    }>;
}

interface ChamadoMapped {
    id: string;
    maquina: string;
    descricao: string;
    status: string;
    tipo: string;
    causa: string;
    solucao: string;
    checklist: ChecklistItem[];
    observacoes: Observacao[];
    operadorNome: string;
    dataAbertura: string | null;
    dataConclusao: string | null;
    manutentorId: string | null;
    manutentorNome: string;
    manutentorEmail: string;
    manutentores: { id: string; nome: string; email: string; papel: 'principal' | 'co'; entrou_em: string }[];
}

// ---------- Helpers ----------
function asDate(v: unknown): Date | null {
    try {
        if (!v) return null;
        if (v instanceof Date) return v;
        if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
            return (v as { toDate: () => Date }).toDate();
        }
        const d = typeof v === 'string' ? new Date(v.replace(' ', 'T')) : new Date(v as number);
        return isNaN(d.getTime()) ? null : d;
    } catch { return null; }
}

function normChecklistItem(it: unknown): ChecklistItem {
    if (typeof it === 'string') return { item: it, resposta: null };
    const obj = it as { item?: string; texto?: string; key?: string; resposta?: string } | null;
    const itemTxt = obj?.item || obj?.texto || obj?.key || '';
    const raw = String(obj?.resposta ?? '').toLowerCase();
    const resp: 'sim' | 'nao' | null = raw === 'sim' ? 'sim' : raw === 'nao' ? 'nao' : null;
    return { item: itemTxt, resposta: resp };
}

// ---------- Component ----------
export default function ChamadoDetalhe({ user }: ChamadoDetalheProps) {
    const { t, i18n } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [chamado, setChamado] = useState<ChamadoMapped | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    // edição / conclusão
    const [solucao, setSolucao] = useState('');
    const [causa, setCausa] = useState('');
    const [causas, setCausas] = useState<string[]>([]);

    // checklist preventiva
    const [checklist, setChecklist] = useState<ChecklistItem[]>([]);

    // observações
    const [novaObservacao, setNovaObservacao] = useState('');

    // fotos de manutenção
    const [fotos, setFotos] = useState<Foto[]>([]);
    const [fotoFile, setFotoFile] = useState<File | null>(null);
    const [uploadingFoto, setUploadingFoto] = useState(false);
    const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

    // atribuição (gestor)
    const [manutentores, setManutentores] = useState<Manutentor[]>([]);
    const [selectedManutentor, setSelectedManutentor] = useState('');
    const [assigning, setAssigning] = useState(false);

    const perm = usePermissions(user as any);

    const canGerirChamados = perm.canEdit('chamados_gestao');
    const isManutentor = perm.canEdit('meus_chamados');
    const isOperador = !canGerirChamados && !isManutentor;

    const fmtDate = useMemo(
        () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short' }),
        [i18n.language]
    );
    const fmtDateTime = useMemo(
        () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }),
        [i18n.language]
    );

    // --------- carregar chamado ---------
    const loadChamado = useCallback(async (silent = false) => {
        if (!id) return;
        try {
            if (!silent) setLoading(true);
            const c: ApiChamado = await getChamado(id);

            // normaliza responsabilidades do chamado
            const normId = c.manutentor_id ?? null;
            const normNome = c.manutentor ?? '';
            const normEmail = (c.manutentor_email ?? '').toLowerCase();

            const mapped: ChamadoMapped = {
                id: c.id,
                maquina: c.maquina || '',
                descricao: c.descricao || '',
                status: c.status || '',
                tipo: c.tipo || '',
                causa: c.causa || '',
                solucao: c.solucao || '',
                checklist: [],
                operadorNome: c.operadorNome ?? c.criado_por ?? '',
                dataAbertura: c.dataAbertura ?? c.criado_em ?? null,
                dataConclusao: c.dataConclusao ?? c.concluido_em ?? null,

                manutentorId: normId,
                manutentorNome: normNome,
                manutentorEmail: normEmail,

                manutentores: (c.manutentores || []) as ChamadoMapped['manutentores'],

                observacoes: (c.observacoes || []).map(o => ({
                    autor: o.autor || '',
                    data: o.criado_em || o.data || null,
                    texto: o.texto || '',
                })),
            };

            const list = Array.isArray(c.checklist)
                ? c.checklist.map(normChecklistItem).filter(x => x.item)
                : [];

            setChamado(mapped);
            setCausa(mapped.causa || '');
            setChecklist(list);
            if (mapped.manutentorId) setSelectedManutentor(mapped.manutentorId);

            // carrega fotos deste chamado
            try {
                const fotosLista = await listarFotosChamado(id as string);
                setFotos(Array.isArray(fotosLista) ? fotosLista : []);
            } catch (errFotos) {
                console.error('Erro ao listar fotos do chamado:', errFotos);
            }
        } catch (e) {
            console.error(e);
            toast.error(t('chamadoDetalhe.toasts.loadError'));
        } finally {
            if (!silent) setLoading(false);
        }
    }, [id, t]);

    useEffect(() => {
        loadChamado();
    }, [loadChamado]);


    // --------- lightbox keyboard support ---------
    useEffect(() => {
        if (selectedPhotoIndex === null) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setSelectedPhotoIndex(null);
            if (e.key === 'ArrowLeft') navigatePhoto(-1);
            if (e.key === 'ArrowRight') navigatePhoto(1);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedPhotoIndex, fotos.length]);

    function navigatePhoto(delta: number) {
        if (selectedPhotoIndex === null) return;
        setSelectedPhotoIndex(prev => {
            if (prev === null) return null;
            const next = prev + delta;
            if (next < 0) return 0;
            if (next >= fotos.length) return fotos.length - 1;
            return next;
        });
    }
    useEffect(() => {
        (async () => {
            try {
                const list: CausaRaiz[] = await listarCausasRaiz();
                setCausas(list.map(x => x.nome).filter(Boolean));
            } catch (e) {
                console.error('Erro ao listar causas:', e);
            }
        })();
    }, []);

    // --------- manutentores (somente gestor) ---------
    useEffect(() => {
        if (!canGerirChamados) return;
        (async () => {
            try {
                const lista = await listarManutentores();
                setManutentores(lista.map((u: { id: string; nome?: string; email?: string }) => ({
                    uid: u.id,
                    nome: u.nome || u.email || u.id,
                    email: u.email || '',
                })));
            } catch {
                toast.error(t('chamadoDetalhe.toasts.listMaintDenied'));
            }
        })();
    }, [canGerirChamados, t]);

    // --------- permissões ---------
    const userId = user?.uid || user?.id || user?.userId || null;
    const userEmail = (user?.email || '').toLowerCase();

    const isOwner = useMemo(() => {
        if (!chamado) return false;
        const principal = chamado.manutentores.find(m => m.papel === 'principal');
        if (!principal) {
            // fallback para chamados sem entrada em chamado_manutentores ainda
            const byId = !!userId && !!chamado.manutentorId && String(chamado.manutentorId) === String(userId);
            const byEmail = !!userEmail && !!chamado.manutentorEmail && chamado.manutentorEmail === userEmail;
            return byId || byEmail;
        }
        const byId = !!userId && String(principal.id) === String(userId);
        const byEmail = !!userEmail && principal.email === userEmail;
        return byId || byEmail;
    }, [chamado, userId, userEmail]);

    const podeAtender =
        isManutentor &&
        chamado?.status === 'Aberto' &&
        (!chamado?.manutentorNome || isOwner);

    const jaEstaNaLista = useMemo(() => {
        if (!chamado || !userId) return false;
        return chamado.manutentores.some(
            m => String(m.id) === String(userId) || (userEmail && m.email === userEmail)
        );
    }, [chamado, userId, userEmail]);

    // "podeTrabalhar" = está no chamado como principal ou co-manutentor
    const podeTrabalhar =
        isManutentor &&
        chamado?.status === 'Em Andamento' &&
        (isOwner || jaEstaNaLista);

    const podeEntrar =
        isManutentor &&
        chamado?.status === 'Em Andamento' &&
        !jaEstaNaLista;

    const podeSair = useMemo(() => {
        if (!chamado || !userId) return false;
        return chamado.manutentores.some(
            m => m.papel === 'co' && (String(m.id) === String(userId) || (userEmail && m.email === userEmail))
        );
    }, [chamado, userId, userEmail]);

    const podeConcluir = podeTrabalhar;

    // --------- handlers ---------
    function handleFotoChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] || null;
        setFotoFile(file);
    }

    async function handleUploadFoto() {
        if (!fotoFile) {
            toast.error(t('chamadoDetalhe.photos.selectFile') || 'Selecione uma foto primeiro.');
            return;
        }

        // pode mandar foto se for dono, manutentor ou gestor
        if (!isOwner && !isManutentor && !canGerirChamados) {
            toast.error(
                t('chamadoDetalhe.photos.permissionDenied') ||
                'Você não tem permissão para enviar fotos.'
            );
            return;
        }

        setUploadingFoto(true);
        try {
            const nova = await uploadFotoChamado(id as string, fotoFile, {
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
            await atribuirChamado(id as string, { manutentorEmail: alvo?.email || '', role: user.role, email: user.email });
            toast.success(t('chamadoDetalhe.toasts.assigned'));
            loadChamado(true);
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
            await removerAtribuicao(id as string, { role: user.role, email: user.email });
            setSelectedManutentor('');
            toast.success(t('chamadoDetalhe.toasts.unassigned'));
            loadChamado(true);
        } catch (e) {
            console.error(e);
            toast.error(t('chamadoDetalhe.toasts.unassignError'));
        } finally {
            setAssigning(false);
        }
    }

    async function handleAtenderChamado() {
        if (chamado?.manutentorId && !isOwner) {
            toast.error(t('chamadoDetalhe.toasts.assignedToOther'));
            return;
        }
        setBusy(true);
        try {
            await atenderChamado(id as string, { role: user.role, email: user.email });
            toast.success(t('chamadoDetalhe.toasts.taken'));
            loadChamado(true);
        } catch (e) {
            console.error(e);
            toast.error(t('chamadoDetalhe.toasts.takeError'));
        } finally {
            setBusy(false);
        }
    }

    async function handleEntrarChamado() {
        setBusy(true);
        try {
            await entrarChamado(id as string, { role: user.role, email: user.email });
            toast.success(t('chamadoDetalhe.toasts.joined'));
            loadChamado(true);
        } catch (e) {
            console.error(e);
            toast.error(t('chamadoDetalhe.toasts.joinError'));
        } finally {
            setBusy(false);
        }
    }

    async function handleSairChamado() {
        setBusy(true);
        try {
            await sairChamado(id as string, { role: user.role, email: user.email });
            toast.success(t('chamadoDetalhe.toasts.left'));
            loadChamado(true);
        } catch (e) {
            console.error(e);
            toast.error(t('chamadoDetalhe.toasts.leaveError'));
        } finally {
            setBusy(false);
        }
    }

    // marca sim/nao e PERSISTE no back (gera corretiva no server se virar sim->nao)
    async function handleChecklistItemToggle(index: number, value: 'sim' | 'nao') {
        const novo = [...checklist];
        novo[index] = { ...novo[index], resposta: value };
        setChecklist(novo);
        try {
            await atualizarChecklistChamado(id as string, novo, { role: user.role, email: user.email });
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
            await adicionarObservacao(id as string, { texto, role: user.role, email: user.email });
            setNovaObservacao('');
            toast.success(t('chamadoDetalhe.toasts.noteAdded'));
            loadChamado(true);
        } catch (e) {
            console.error(e);
            toast.error(t('chamadoDetalhe.toasts.noteError'));
        } finally {
            setBusy(false);
        }
    }

    async function handleConcluirChamado(e: FormEvent) {
        e.preventDefault();
        if (!isOwner && !jaEstaNaLista) {
            toast.error(t('chamadoDetalhe.toasts.finishOnlyOwner'));
            return;
        }
        setBusy(true);
        try {
            if (chamado?.tipo === 'preventiva') {
                const unanswered = checklist.filter(i => i.resposta === null).length;
                if (unanswered > 0) {
                    toast.error(t('chamadoDetalhe.toasts.checklistIncomplete') || `Responda todos os itens do checklist (${unanswered} pendente${unanswered > 1 ? 's' : ''}).`);
                    setBusy(false);
                    return;
                }
                await concluirChamado(id as string, { tipo: 'preventiva', checklist }, { role: user.role, email: user.email });
            } else {
                if (!causa) { toast.error(t('chamadoDetalhe.toasts.selectCause')); setBusy(false); return; }
                if (!solucao.trim()) { toast.error(t('chamadoDetalhe.toasts.describeService')); setBusy(false); return; }
                await concluirChamado(id as string, { tipo: 'corretiva', causa, solucao }, { role: user.role, email: user.email });
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
        if (!canGerirChamados) {
            toast.error(t('chamadoDetalhe.toasts.onlyManagerDelete'));
            return;
        }
        if (!window.confirm(t('chamadoDetalhe.delete.confirm'))) return;
        setBusy(true);
        try {
            await deletarChamado(id as string, { role: user.role, email: user.email });
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

    const openedAt = chamado?.dataAbertura ? fmtDateTime.format(asDate(chamado.dataAbertura) as Date) : '—';
    const isPreventiva = (chamado?.tipo || '').toLowerCase() === 'preventiva';

    return (
        <div className={styles.container}>
            <button className={styles.backButton} onClick={() => navigate(-1)}>
                <ChevronLeft size={18} />
                {t('common.back', 'Voltar')}
            </button>
            <header className={styles.header}>
                <h1>{t('chamadoDetalhe.header.machine', { name: chamado.maquina })}</h1>
                <small>
                    {t('chamadoDetalhe.header.openedBy', {
                        name: chamado.operadorNome,
                        date: openedAt,
                    })}
                </small>
            </header>

            <Card>
                <div className={styles.detailsGrid}>
                    <div className={styles.detailItem}>
                        <strong>{t('chamadoDetalhe.fields.status')}</strong>
                        <p>
                            <span className={`${styles.statusBadge} ${styles[chamado.status?.toLowerCase()?.replace(' ', '')]}`}>
                                {t(`status.${statusKey(chamado.status)}`)}
                            </span>
                        </p>
                    </div>

                    {chamado.manutentores.length > 0 && (
                        <div className={styles.detailItem}>
                            <strong>{t('chamadoDetalhe.fields.coMaintainers')}</strong>
                            {chamado.manutentores.map(m => (
                                <p key={m.id}>
                                    {m.nome}
                                    {m.papel === 'co' && (
                                        <span style={{ marginLeft: 6, fontSize: '0.75rem', opacity: 0.7 }}>
                                            ({t('chamadoDetalhe.fields.coMaintainerLabel')})
                                        </span>
                                    )}
                                </p>
                            ))}
                        </div>
                    )}
                    {!chamado.manutentores.length && chamado.manutentorNome && (
                        <div className={styles.detailItem}>
                            <strong>{t('chamadoDetalhe.fields.assignedTo') || 'Atribuído a'}</strong>
                            <p>{chamado.manutentorNome}</p>
                        </div>
                    )}

                    <div className={`${styles.detailItem} ${styles.detailItemFull}`}>
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
                            <div className={`${styles.detailItem} ${styles.detailItemFull}`}>
                                <strong>{t('chamadoDetalhe.fields.performedService')}</strong>
                                <p style={{ wordBreak: 'break-word' }}>{chamado.solucao}</p>
                                <small>{t('chamadoDetalhe.fields.finishedAt', {
                                    date: chamado.dataConclusao ? fmtDateTime.format(asDate(chamado.dataConclusao) as Date) : '—',
                                })}</small>
                            </div>
                        )
                    )}

                    {/* PDF Download button — concluded preventive only */}
                    {chamado.status === 'Concluido' && isPreventiva && (
                        <div className={`${styles.detailItem} ${styles.detailItemFull}`} style={{ paddingTop: 8 }}>
                            <Button
                                variant="secondary"
                                onClick={async () => {
                                    await generatePreventiveReport(
                                        {
                                            maquina: chamado.maquina,
                                            descricao: chamado.descricao,
                                            manutentorNome: chamado.manutentorNome,
                                            dataAbertura: chamado.dataAbertura,
                                            dataConclusao: chamado.dataConclusao,
                                            checklist: (checklist.length > 0 ? checklist : (chamado.checklist || []))
                                                .map(i => ({ ...i, resposta: (i.resposta ?? 'nao') as 'sim' | 'nao' })),
                                            observacoes: chamado.observacoes || [],
                                            fotos: fotos
                                                .filter((f) => !!f.url)
                                                .map((f) => ({
                                                    url: f.url as string,
                                                    autorNome: f.autorNome,
                                                    criadoEm: f.criadoEm,
                                                })),
                                        },
                                        {
                                            title: t('chamadoDetalhe.pdf.title'),
                                            subtitle: t('chamadoDetalhe.pdf.subtitle'),
                                            machine: t('chamadoDetalhe.pdf.machine'),
                                            description: t('chamadoDetalhe.pdf.description'),
                                            maintainer: t('chamadoDetalhe.pdf.maintainer'),
                                            maintenanceLeader: t('chamadoDetalhe.pdf.maintenanceLeader'),
                                            maintenanceLeaderName: 'Almir Evaristo Da Silva Filho',
                                            coordinator: t('chamadoDetalhe.pdf.coordinator'),
                                            openedAt: t('chamadoDetalhe.pdf.openedAt'),
                                            concludedAt: t('chamadoDetalhe.pdf.concludedAt'),
                                            checklistTitle: t('chamadoDetalhe.pdf.checklistTitle'),
                                            itemCol: t('chamadoDetalhe.pdf.itemCol'),
                                            resultCol: t('chamadoDetalhe.pdf.resultCol'),
                                            conforme: t('chamadoDetalhe.pdf.conforme'),
                                            naoConforme: t('chamadoDetalhe.pdf.naoConforme'),
                                            observationsTitle: t('chamadoDetalhe.pdf.observationsTitle'),
                                            noObservations: t('chamadoDetalhe.pdf.noObservations'),
                                            page: t('chamadoDetalhe.pdf.page'),
                                            of: t('chamadoDetalhe.pdf.of'),
                                            generatedAt: t('chamadoDetalhe.pdf.generatedAt'),
                                            coordinatorName: 'Leandro Rocha da Silva',
                                            photosTitle: t('chamadoDetalhe.pdf.photosTitle'),
                                        },
                                    );
                                }}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                            >
                                <FileDown size={18} />
                                {t('chamadoDetalhe.actions.downloadPdf')}
                            </Button>
                        </div>
                    )}

                    {!isPreventiva && ['Em Andamento', 'Concluido'].includes(chamado.status) && (
                        <div className={styles.detailItem}>
                            <strong>{t('chamadoDetalhe.fields.cause')}</strong>
                            {chamado.status === 'Em Andamento' ? (
                                <Select
                                    id="causa"
                                    value={causa}
                                    onChange={(e) => setCausa(e.target.value)}
                                    required
                                >
                                    <option value="" disabled>{t('chamadoDetalhe.selects.causePlaceholder')}</option>
                                    {causas.map((nome) => (
                                        <option key={nome} value={nome}>
                                            {nome.charAt(0).toUpperCase() + nome.slice(1)}
                                        </option>
                                    ))}
                                </Select>
                            ) : (
                                <p className={styles.readonlyField}>{chamado.causa || '–'}</p>
                            )}
                        </div>
                    )}
                </div>
            </Card>

            {/* Atribuição (gestor) */}
            {canGerirChamados && chamado.status !== 'Concluido' && (
                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>{t('chamadoDetalhe.assign.title')}</h2>
                    <Select
                        id="manutentor"
                        label={t('chamadoDetalhe.assign.label')}
                        value={selectedManutentor}
                        onChange={(e) => setSelectedManutentor(e.target.value)}
                    >
                        <option value="">{t('chamadoDetalhe.assign.placeholder')}</option>
                        {manutentores.map((m) => (
                            <option key={m.uid} value={m.uid}>{m.nome}</option>
                        ))}
                    </Select>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <Button onClick={handleAtribuir} loading={assigning} disabled={!selectedManutentor}>
                            {chamado.manutentorId ? t('chamadoDetalhe.assign.reassign') : t('chamadoDetalhe.assign.assign')}
                        </Button>
                        {chamado.manutentorId && (
                            <Button variant="secondary" onClick={handleRemoverAtribuicao} loading={assigning}>
                                {t('chamadoDetalhe.assign.remove')}
                            </Button>
                        )}
                    </div>
                </div>
            )
            }

            {/* Observações */}
            <div className={`${styles.card} ${styles.historySection}`}>
                <h2 className={styles.cardTitle}>{t('chamadoDetalhe.history.title')}</h2>

                {(podeTrabalhar || canGerirChamados) && chamado.status !== 'Concluido' && (
                    <div className={styles.formGroup}>
                        <label htmlFor="observacao">{t('chamadoDetalhe.history.add')}</label>
                        <textarea
                            id="observacao"
                            className={styles.textarea}
                            rows={3}
                            value={novaObservacao}
                            onChange={(e) => setNovaObservacao(e.target.value)}
                        />
                        <Button onClick={handleAdicionarObservacao} loading={busy} style={{ marginTop: 10 }}>
                            {t('chamadoDetalhe.history.saveNote')}
                        </Button>
                    </div>
                )}

                <ul className={styles.historyList}>
                    {(chamado.observacoes || []).slice().reverse().map((obs, i) => (
                        <li key={i} className={styles.historyItem}>
                            <div className={styles.historyHeader}>
                                <strong>{obs.autor || '—'}</strong>
                                <span>{obs.data ? fmtDateTime.format(asDate(obs.data) as Date) : '—'}</span>
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
                        (isOwner || isManutentor || canGerirChamados) &&
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
                                            <Button
                                                type="button"
                                                onClick={handleUploadFoto}
                                                loading={uploadingFoto}
                                                disabled={!fotoFile}
                                            >
                                                {t('chamadoDetalhe.photos.uploadButton') || 'Enviar foto'}
                                            </Button>
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
                                                <div
                                                    onClick={() => setSelectedPhotoIndex(fotos.indexOf(f))}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    <img
                                                        src={f.url}
                                                        alt="Foto da manutenção"
                                                        className={styles.photoThumb}
                                                    />
                                                </div>
                                            ) : (
                                                <div className={styles.photoThumbFallback}>
                                                    <span>URL indisponível</span>
                                                </div>
                                            )}
                                            <small>
                                                {f.autorNome ? `${f.autorNome} • ` : ''}
                                                {f.criadoEm
                                                    ? fmtDateTime.format(asDate(f.criadoEm) as Date)
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
            {
                podeAtender && (
                    <div className={styles.card}>
                        <Button onClick={handleAtenderChamado} loading={busy}>
                            {t('chamadoDetalhe.actions.take')}
                        </Button>
                    </div>
                )
            }

            {
                podeEntrar && (
                    <div className={styles.card}>
                        <Button variant="secondary" onClick={handleEntrarChamado} loading={busy}>
                            {t('chamadoDetalhe.actions.join')}
                        </Button>
                    </div>
                )
            }

            {
                podeSair && (
                    <div className={styles.card}>
                        <Button variant="secondary" onClick={handleSairChamado} loading={busy}>
                            {t('chamadoDetalhe.actions.leave')}
                        </Button>
                    </div>
                )
            }

            {
                podeConcluir && (
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
                                <Button type="submit" loading={busy}>
                                    {t('chamadoDetalhe.actions.finish')}
                                </Button>
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
                                        rows={5}
                                        value={solucao}
                                        onChange={(e) => setSolucao(e.target.value)}
                                        required
                                    />
                                </div>
                                <Button type="submit" loading={busy} disabled={!causa}>
                                    {t('chamadoDetalhe.actions.finish')}
                                </Button>
                            </form>
                        </div>
                    )
                )
            }

            {
                (canGerirChamados && ['Aberto', 'Em Andamento', 'Concluido'].includes(chamado.status)) && (
                    <div className={styles.card} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                            variant="danger"
                            onClick={handleExcluirChamado}
                            loading={busy}
                            title={t('chamadoDetalhe.delete.title')}
                        >
                            {t('chamadoDetalhe.delete.button')}
                        </Button>
                    </div>
                )
            }

            {/* Lightbox Overlay */}
            {selectedPhotoIndex !== null && fotos[selectedPhotoIndex] && (
                <div className={styles.lightboxOverlay} onClick={() => setSelectedPhotoIndex(null)}>
                    <div className={styles.lightboxContent} onClick={e => e.stopPropagation()}>
                        <button className={styles.lightboxClose} onClick={() => setSelectedPhotoIndex(null)}>
                            <X size={32} />
                        </button>

                        {selectedPhotoIndex > 0 && (
                            <button className={`${styles.lightboxNav} ${styles.lightboxPrev}`} onClick={() => navigatePhoto(-1)}>
                                <ChevronLeft size={48} />
                            </button>
                        )}

                        <img
                            src={fotos[selectedPhotoIndex].url}
                            alt={`Foto da manutenção ${selectedPhotoIndex + 1}`}
                            className={styles.lightboxImage}
                        />

                        {selectedPhotoIndex < fotos.length - 1 && (
                            <button className={`${styles.lightboxNav} ${styles.lightboxNext}`} onClick={() => navigatePhoto(1)}>
                                <ChevronRight size={48} />
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
