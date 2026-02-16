import { useState, ChangeEvent, FormEvent, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FiSave, FiUploadCloud, FiFile, FiCheck, FiX, FiEdit2, FiTrash2, FiChevronLeft, FiChevronRight, FiChevronsRight, FiChevronsLeft, FiDownload, FiExternalLink, FiLink, FiXCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

import { http, criarNaoConformidade, QualidadeOpcao } from '../../../services/apiClient';
import { NcReconciliationModal, ActionItem } from '../components/NcReconciliationModal';
import PageHeader from '../../../shared/components/PageHeader';
import HelpTooltip from '../../../shared/components/HelpTooltip';
import styles from './RetrabalhoPage.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RetrabalhoItem {
    id: string;
    data: string;
    codigo: string;
    ordem_producao: string;
    descricao: string;
    nao_conformidade: string;
    solicitante: string;
    ocorrencia: number;
    severidade: number;
    deteccao: number;
    causa_provavel: string;
    ncr: string;
    horas_retrabalho: string;
    pdca_plano_id: string | null;
    pdca_plano_numero: string | null;
    created_at?: string;
}



interface SolicitanteOption {
    id: string;
    nome: string;
}

const INITIAL_FORM = {
    data: new Date().toISOString().split('T')[0],
    codigo: '',
    ordem_producao: '',
    descricao: '',
    nao_conformidade: '',
    solicitante: '',
    ocorrencia: '1',
    severidade: '1',
    deteccao: '1',
    causa_provavel: '',
    ncr: '',
    horas_retrabalho: '',
};

const CAUSAS_PROVAVEIS = ['MAN', 'METHOD', 'MACHINE', 'MATERIAL', 'DESIGN'];

// ── Component ─────────────────────────────────────────────────────────────────

export default function RetrabalhoPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [entries, setEntries] = useState<RetrabalhoItem[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Pagination
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    const [form, setForm] = useState(INITIAL_FORM);

    // Options
    const [ncList, setNcList] = useState<QualidadeOpcao[]>([]);
    const [solicitanteList, setSolicitanteList] = useState<SolicitanteOption[]>([]);

    // Upload state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadMode, setUploadMode] = useState(false);
    const [importing, setImporting] = useState(false);

    interface UploadResultSummary {
        sucesso: number;
        ignorado: number;
        erro: number;
        erros: string[];
    }
    const [uploadResult, setUploadResult] = useState<UploadResultSummary | null>(null);

    // PDCA linking state
    interface PdcaPlano {
        id: string;
        titulo: string;
        status: string;
    }
    const [pdcaPlanos, setPdcaPlanos] = useState<PdcaPlano[]>([]);
    const [linkModalOpen, setLinkModalOpen] = useState(false);
    const [linkingItemId, setLinkingItemId] = useState<string | null>(null);
    const [selectedPdcaId, setSelectedPdcaId] = useState<string>('');
    const [newPdcaTitulo, setNewPdcaTitulo] = useState('');
    const [linkingLoading, setLinkingLoading] = useState(false);

    // Reconciliation State
    const [pendingUploadItems, setPendingUploadItems] = useState<any[]>([]);
    const [ncReconciliationData, setNcReconciliationData] = useState<{
        unknowns: string[];
        existing: QualidadeOpcao[];
    } | null>(null);

    // ── Effects ────────────────────────────────────────────────────────────

    useEffect(() => {
        fetchEntries(page);
    }, [page]);

    useEffect(() => {
        fetchOptions();
        fetchPdcaPlanos();
    }, []);

    // ── Data Fetching ──────────────────────────────────────────────────────

    const fetchOptions = async () => {
        try {
            const [ncs, sols] = await Promise.all([
                http.get<QualidadeOpcao[]>('/qualidade/nao-conformidades'),
                http.get<SolicitanteOption[]>('/qualidade/solicitantes')
            ]);
            setNcList(Array.isArray(ncs) ? ncs : []);
            setSolicitanteList(Array.isArray(sols) ? sols : []);
        } catch (err) {
            console.error('Failed to fetch options', err);
            toast.error(t('quality.retrabalho.loadOptionsError', 'Erro ao carregar opções.'));
        }
    };

    const fetchEntries = async (currentPage = 1) => {
        try {
            const res = await http.get<{ items: RetrabalhoItem[], meta: any }>(`/qualidade/retrabalho?page=${currentPage}&limit=50`);
            if (Array.isArray(res)) {
                setEntries(res);
            } else {
                setEntries(res.items || []);
                if (res.meta) {
                    setTotalPages(res.meta.totalPages);
                    setTotalItems(res.meta.total);
                }
            }
        } catch (err) {
            console.error('Failed to fetch entries', err);
        }
    };

    const fetchPdcaPlanos = async () => {
        try {
            const res = await http.get<{ items: PdcaPlano[] }>('/pdca/planos');
            setPdcaPlanos(res.items || []);
        } catch (err) {
            console.error('Failed to fetch PDCA plans', err);
        }
    };

    // ── Form Handlers ──────────────────────────────────────────────────────

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                ...form,
                ocorrencia: Number(form.ocorrencia),
                severidade: Number(form.severidade),
                deteccao: Number(form.deteccao),
            };

            if (editingId) {
                await http.put(`/qualidade/retrabalho/${editingId}`, { data: payload });
                toast.success(t('quality.retrabalho.updateSuccess', 'Registro atualizado!'));
            } else {
                await http.post('/qualidade/retrabalho', { data: payload });
                toast.success(t('quality.retrabalho.createSuccess', 'Registro criado com sucesso!'));
            }

            handleCancelEdit();
            fetchEntries();
        } catch (err: any) {
            console.error(err);
            toast.error(err?.message || t('quality.retrabalho.saveError', 'Erro ao salvar.'));
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (item: RetrabalhoItem) => {
        setEditingId(item.id);
        setForm({
            data: item.data ? item.data.split('T')[0] : '',
            codigo: item.codigo || '',
            ordem_producao: item.ordem_producao || '',
            descricao: item.descricao || '',
            nao_conformidade: item.nao_conformidade || '',
            solicitante: item.solicitante || '',
            ocorrencia: String(item.ocorrencia || 3),
            severidade: String(item.severidade || 3),
            deteccao: String(item.deteccao || 3),
            causa_provavel: item.causa_provavel || '',
            ncr: item.ncr || '',
            horas_retrabalho: item.horas_retrabalho || '',
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setForm({ ...INITIAL_FORM, data: new Date().toISOString().split('T')[0] });
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm(t('quality.retrabalho.confirmDelete', 'Tem certeza que deseja excluir este registro?'))) return;
        try {
            await http.delete(`/qualidade/retrabalho/${id}`);
            toast.success(t('quality.retrabalho.deleteSuccess', 'Registro excluído.'));
            fetchEntries();
        } catch (err: any) {
            console.error(err);
            toast.error(t('quality.retrabalho.deleteError', 'Erro ao excluir.'));
        }
    };

    // ── PDCA Linking ────────────────────────────────────────────────────────

    const openLinkModal = (itemId: string) => {
        setLinkingItemId(itemId);
        setSelectedPdcaId('');
        setNewPdcaTitulo('');
        setLinkModalOpen(true);
    };

    const handleLinkPdca = async () => {
        if (!linkingItemId) return;

        setLinkingLoading(true);
        try {
            let planoId = selectedPdcaId;

            // If creating a new plan
            if (!planoId && newPdcaTitulo.trim()) {
                const res = await http.post<{ id: string }>('/pdca/planos', { data: { titulo: newPdcaTitulo.trim(), origem: 'Retrabalho' } });
                planoId = res.id;
                await fetchPdcaPlanos(); // refresh list
            }

            if (!planoId) {
                toast.error(t('quality.retrabalho.selectOrCreatePlan', 'Selecione um plano existente ou crie um novo.'));
                setLinkingLoading(false);
                return;
            }

            // Link the plan to the retrabalho record
            await http.put(`/qualidade/retrabalho/${linkingItemId}`, { data: { pdca_plano_id: planoId } });
            toast.success(t('quality.retrabalho.planLinked', 'Plano de ação vinculado!'));
            setLinkModalOpen(false);
            setLinkingItemId(null);
            fetchEntries(page);
        } catch (err: any) {
            console.error(err);
            toast.error(err?.message || t('quality.retrabalho.linkError', 'Erro ao vincular plano.'));
        } finally {
            setLinkingLoading(false);
        }
    };

    const handleUnlinkPdca = async (itemId: string) => {
        if (!window.confirm(t('quality.retrabalho.confirmUnlink', 'Desvincular plano de ação deste registro?'))) return;
        try {
            await http.put(`/qualidade/retrabalho/${itemId}`, { data: { pdca_plano_id: null } });
            toast.success(t('quality.retrabalho.planUnlinked', 'Plano desvinculado.'));
            fetchEntries(page);
        } catch (err: any) {
            console.error(err);
            toast.error(t('quality.retrabalho.unlinkError', 'Erro ao desvincular.'));
        }
    };

    // ── Upload ──────────────────────────────────────────────────────────────

    const processUpload = async (items: any[]) => {
        try {
            setImporting(true);
            const res = await http.post<any>('/qualidade/retrabalho/upload', { data: { items } });

            if (res.ok || res.success) {
                const summary = res.summary || { sucesso: items.length, erro: 0, ignorado: 0, erros: [] };
                setUploadResult(summary);

                if (summary.sucesso > 0) {
                    toast.success(t('quality.retrabalho.importSuccessMsg', { count: summary.sucesso, defaultValue: `${summary.sucesso} registros importados!` }));
                    fetchEntries(1);
                } else if (summary.erro > 0) {
                    toast.error(t('quality.retrabalho.importPartialMsg', 'Houve erros na importação.'));
                } else if (summary.ignorado > 0) {
                    toast(t('quality.retrabalho.importIgnoredMsg', 'Alguns itens foram ignorados (duplicados).'), { icon: '⚠️' });
                }
            }
        } catch (err: any) {
            console.error(err);
            toast.error(t('quality.retrabalho.processError', 'Erro ao processar upload: ' + err.message));
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            setNcReconciliationData(null); // Close modal
        }
    };

    const handleNcReconciliationConfirm = async (actions: Record<string, ActionItem>) => {
        setNcReconciliationData(null);
        setImporting(true);
        const toastId = toast.loading(t('quality.retrabalho.processingAdjustments', 'Processando ajustes...'));

        try {
            // 1. Create new NCs
            const newNcs = Object.entries(actions).filter(([_, a]) => a.type === 'create').map(([k]) => k);
            await Promise.all(newNcs.map(n => criarNaoConformidade(n)));

            // Refresh options
            fetchOptions();

            // 2. Map items
            const mappedItems = pendingUploadItems.map(item => {
                const newItem = { ...item };
                const nc = item.nao_conformidade;

                if (actions[nc]) {
                    const action = actions[nc];
                    if (action.type === 'map' && action.targetValue) {
                        newItem.nao_conformidade = action.targetValue;
                    }
                    // if create, stays as is
                }
                return newItem;
            });

            toast.dismiss(toastId);
            await processUpload(mappedItems);

        } catch (e) {
            console.error(e);
            toast.error(t('quality.retrabalho.createAdjustmentsError', 'Erro ao criar novos itens.'), { id: toastId });
            setImporting(false);
        }
    };

    const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        setUploadResult(null);

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const workbook = XLSX.read(bstr, { type: 'binary' });
                const wsname = workbook.SheetNames[0];
                const ws = workbook.Sheets[wsname];

                const data = XLSX.utils.sheet_to_json<any>(ws, { defval: '' });

                if (data.length === 0) {
                    toast.error(t('quality.retrabalho.emptyFileError', 'Arquivo vazio ou formato inválido'));
                    setImporting(false);
                    return;
                }

                const normalizeKey = (key: string) => key
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z0-9]/g, "");

                const getValue = (row: any, aliases: string[]) => {
                    const keys = Object.keys(row);
                    let foundKey = keys.find(k => aliases.some(alias => normalizeKey(k) === normalizeKey(alias)));
                    if (!foundKey) {
                        foundKey = keys.find(k => aliases.some(alias => normalizeKey(k).includes(normalizeKey(alias))));
                    }
                    if (foundKey) return row[foundKey];
                    return null;
                };

                const parseDate = (val: any) => {
                    if (!val) return new Date().toISOString().split('T')[0];
                    if (typeof val === 'number') {
                        const date = new Date((val - (25567 + 2)) * 86400 * 1000);
                        return date.toISOString().split('T')[0];
                    }
                    if (typeof val === 'string' && val.includes('/')) {
                        const parts = val.split('/');
                        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
                    }
                    if (typeof val === 'string' && val.includes('-')) return val.split('T')[0];
                    return new Date().toISOString().split('T')[0];
                };

                const items = data.map((row: any) => ({
                    data: parseDate(getValue(row, ['data', 'dt', 'date'])),
                    codigo: String(getValue(row, ['codigo', 'cod', 'code']) || '').trim(),
                    ordem_producao: String(getValue(row, ['ordem de producao', 'op', 'ordem', 'ordemproducao']) || '').trim(),
                    descricao: String(getValue(row, ['descricao', 'desc', 'description']) || '').trim(),
                    nao_conformidade: String(getValue(row, ['nao conformidade', 'naoconformidade', 'nc', 'nonconformity']) || '').toUpperCase().trim(),
                    solicitante: String(getValue(row, ['solicitante', 'requester', 'solicit']) || '').toUpperCase().trim(),
                    ocorrencia: Number(getValue(row, ['ocorrencia', 'occurrence', 'occ'])) || 3,
                    severidade: Number(getValue(row, ['severidade', 'severity', 'sev'])) || 3,
                    deteccao: Number(getValue(row, ['deteccao', 'detection', 'det'])) || 3,
                    causa_provavel: String(getValue(row, ['causa provavel', 'causaprovavel', 'causa', '4m1d', '4m 1d']) || '').toUpperCase().trim(),
                    ncr: String(getValue(row, ['ncr', 'ncrnum']) || '').trim(),
                    horas_retrabalho: String(getValue(row, ['horas de retrabalho', 'horasretrabalho', 'horas', 'hours']) || '').trim(),
                })).filter((i: any) => i.codigo && i.data);

                if (items.length === 0) {
                    toast.error(t('quality.retrabalho.invalidFormatError', 'Nenhum registro válido. Verifique se as colunas obrigatórias (Data, Código, Ocorrência, Severidade, Detecção) estão presentes.'));
                    setImporting(false);
                    return;
                }

                // VALIDATION FOR RECONCILIATION
                const uniqueNcs = [...new Set(items.map((i: any) => i.nao_conformidade).filter((x: string) => x))];
                const unknownNcs = uniqueNcs.filter(u => !ncList.some(k => k.nome === u));

                if (unknownNcs.length > 0) {
                    setPendingUploadItems(items);
                    setNcReconciliationData({
                        unknowns: unknownNcs as string[],
                        existing: ncList
                    });
                    setImporting(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    return;
                }

                await processUpload(items);

            } catch (err: any) {
                console.error(err);
                toast.error(t('quality.retrabalho.processError', 'Erro ao processar: ' + err.message));
                setImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    // ── Export ──────────────────────────────────────────────────────────────

    const handleExportBackup = async () => {
        const toastId = toast.loading(t('quality.retrabalho.exporting', 'Gerando backup...'));
        try {
            const res = await http.get<{ items: RetrabalhoItem[] }>('/qualidade/retrabalho?limit=100000');
            const items = Array.isArray(res) ? res : (res.items || []);

            if (items.length === 0) {
                toast.error(t('quality.retrabalho.noDataToExport', 'Sem dados para exportar.'), { id: toastId });
                return;
            }

            const exportData = items.map(item => ({
                Data: new Date(item.data).toLocaleDateString('pt-BR'),
                Código: item.codigo,
                'Ordem de Produção': item.ordem_producao,
                Descrição: item.descricao,
                'Não Conformidade': item.nao_conformidade,
                Solicitante: item.solicitante,
                Ocorrência: item.ocorrencia,
                Severidade: item.severidade,
                Detecção: item.deteccao,
                Total: item.ocorrencia * item.severidade * item.deteccao,
                'Causa Provável (4M 1D)': item.causa_provavel,
                NCR: item.ncr,
                'Horas de Retrabalho': item.horas_retrabalho,
                'Plano de Ação': item.pdca_plano_numero || '',
            }));

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Retrabalho");

            const dateStr = new Date().toISOString().split('T')[0];
            XLSX.writeFile(wb, `backup_retrabalho_${dateStr}.xlsx`);

            toast.success(t('quality.retrabalho.exportSuccess', 'Backup baixado!'), { id: toastId });
        } catch (err: any) {
            console.error(err);
            toast.error(t('quality.retrabalho.exportError', 'Erro ao gerar backup.'), { id: toastId });
        }
    };

    // ── Helpers ─────────────────────────────────────────────────────────────

    const calcTotal = (o: number, s: number, d: number) => o * s * d;
    const formTotal = calcTotal(Number(form.ocorrencia), Number(form.severidade), Number(form.deteccao));

    const getTotalClass = (total: number) => {
        if (total >= 16) return styles.totalHigh;
        if (total >= 10) return styles.totalMedium;
        return styles.totalLow;
    };

    // ── Pagination helpers ─────────────────────────────────────────────────

    const renderPagination = () => {
        if (totalPages <= 1) return null;
        const pages: number[] = [];
        for (let i = 1; i <= totalPages; i++) pages.push(i);

        return (
            <div className={styles.pagination}>
                <button className={styles.pageBtn} disabled={page === 1} onClick={() => setPage(1)}>
                    <FiChevronsLeft />
                </button>
                <button className={styles.pageBtn} disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                    <FiChevronLeft />
                </button>
                {pages.map(p => (
                    <button
                        key={p}
                        className={`${styles.pageBtn} ${p === page ? styles.activePage : ''}`}
                        onClick={() => setPage(p)}
                    >
                        {p}
                    </button>
                ))}
                <button className={styles.pageBtn} disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                    <FiChevronRight />
                </button>
                <button className={styles.pageBtn} disabled={page === totalPages} onClick={() => setPage(totalPages)}>
                    <FiChevronsRight />
                </button>
                <span className={styles.totalInfo}>{totalItems} {t('common.records', 'registros')}</span>
            </div>
        );
    };

    const renderHelpContent = (type: 'occurrence' | 'severity' | 'detection') => (
        <div style={{ display: 'grid', gap: '8px', textAlign: 'left' }}>
            {[1, 2, 3, 4, 5].map(n => (
                <div key={n} style={{ display: 'flex', gap: '6px', fontSize: '0.8rem', alignItems: 'flex-start' }}>
                    <span style={{
                        fontWeight: '700',
                        color: '#3b82f6',
                        // Robust style: ensure number is visible and aligned
                        minWidth: '20px',
                        flexShrink: 0
                    }}>{n}:</span>
                    <span style={{ flex: 1, paddingTop: '2px' }}>{t(`quality.retrabalho.help.${type}.level_${n}`)}</span>
                </div>
            ))}
        </div>
    );

    return (
        <>
            <PageHeader
                title={editingId ? t('quality.retrabalho.editTitle', 'Editar Retrabalho') : t('quality.retrabalho.title', 'Retrabalho')}
                subtitle={t('quality.retrabalho.subtitle', 'Registre e gerencie os retrabalhos identificados no processo.')}
                actions={
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            className={styles.secondaryBtn}
                            onClick={handleExportBackup}
                            title={t('quality.retrabalho.downloadBackup', 'Baixar todos os dados')}
                        >
                            <FiDownload />
                            <span className={styles.hideMobile}>{t('common.export', 'Exportar')}</span>
                        </button>
                        <button
                            className={styles.secondaryBtn}
                            onClick={() => {
                                setUploadMode(!uploadMode);
                                setUploadResult(null);
                            }}
                        >
                            {uploadMode ? <FiX /> : <FiUploadCloud />}
                            {uploadMode ? t('quality.retrabalho.cancelUpload', 'Cancelar Upload') : t('quality.retrabalho.importExcel', 'Importar Excel/CSV')}
                        </button>
                    </div>
                }
            />

            {ncReconciliationData && (
                <NcReconciliationModal
                    unknowns={ncReconciliationData.unknowns}
                    existing={ncReconciliationData.existing}
                    onConfirm={handleNcReconciliationConfirm}
                    onCancel={() => {
                        setNcReconciliationData(null);
                        setImporting(false);
                        setUploadResult(null);
                    }}
                />
            )}
            <div className={styles.container}>
                <div className={styles.contentGrid}>
                    {uploadMode ? (
                        <div className={styles.uploadCard}>
                            <div className={styles.uploadHeader}>
                                <FiFile size={48} color="#9ca3af" style={{ marginBottom: 16 }} />
                                <h3>{t('quality.retrabalho.importTitle', 'Importar planilha de Retrabalho')}</h3>
                                <p>{t('quality.retrabalho.importHelp', 'Selecione um arquivo .xlsx ou .csv com as colunas: Data, Código, OP, Descrição, NC, Solicitante, Ocorrência, Severidade, Detecção, Causa Provável, NCR, Horas de Retrabalho')}</p>
                            </div>

                            <div>
                                <input
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    onChange={handleFileChange}
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                />
                                <button
                                    className={styles.primaryBtn}
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={importing}
                                >
                                    {importing ? t('quality.retrabalho.importing', 'Importando...') : t('quality.retrabalho.selectFile', 'Selecionar Arquivo')}
                                </button>
                            </div>

                            {uploadResult && (
                                <div className={`${styles.resultCard} ${uploadResult.erro === 0 ? styles.resultSuccess : styles.resultError}`}>
                                    <div className={styles.resultHeader}>
                                        <h3 className={styles.resultTitle}>
                                            {uploadResult.erro === 0 ? (
                                                <><FiCheck style={{ verticalAlign: 'middle', marginRight: 8 }} /> {t('quality.retrabalho.importSuccess', 'Importação Concluída')}</>
                                            ) : (
                                                <div style={{ color: '#dc2626', display: 'flex', alignItems: 'center' }}><FiX style={{ verticalAlign: 'middle', marginRight: 8 }} /> {t('quality.retrabalho.importError', 'Importação com Erros')}</div>
                                            )}
                                        </h3>
                                        <button className={styles.closeBtn} onClick={() => setUploadResult(null)}><FiX /></button>
                                    </div>
                                    <ul className={styles.resultList}>
                                        <li><strong>{t('quality.retrabalho.importedCount', 'Registros importados:')}</strong> {uploadResult.sucesso}</li>
                                        {uploadResult.ignorado > 0 && (
                                            <li><strong>{t('quality.retrabalho.ignoredCount', 'Ignorados (duplicados):')}</strong> {uploadResult.ignorado}</li>
                                        )}
                                        {uploadResult.erro > 0 && (
                                            <li><strong>{t('quality.retrabalho.errorLinesCount', 'Linhas com erro:')}</strong> {uploadResult.erro}</li>
                                        )}
                                    </ul>
                                    {uploadResult.erros && uploadResult.erros.length > 0 && (
                                        <div className={styles.errorList}>
                                            {uploadResult.erros.map((err, i) => (
                                                <div key={i} className={styles.errorRow}>
                                                    <span className={styles.errorMsg}>{err}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className={styles.formCard}>
                            <div className={styles.cardHeader}>
                                <h3 className={styles.cardTitle}>
                                    {editingId ? t('quality.retrabalho.editing', 'Editando Registro') : t('quality.retrabalho.new', 'Novo Registro')}
                                </h3>
                                {editingId && (
                                    <button className={styles.secondaryBtn} onClick={handleCancelEdit} style={{ fontSize: '0.8rem', padding: '4px 12px', height: 'auto' }}>
                                        {t('quality.retrabalho.cancelEdit', 'Cancelar Edição')}
                                    </button>
                                )}
                            </div>

                            <form onSubmit={handleSubmit} className={styles.form}>
                                {/* Row 1: Date, Code, OP, NCR */}
                                <div className={styles.row}>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="data">{t('common.date', 'Data')}</label>
                                        <input className={styles.input} type="date" id="data" name="data" value={form.data} onChange={handleChange} required />
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="codigo">{t('quality.retrabalho.code', 'Código')}</label>
                                        <input className={styles.input} id="codigo" name="codigo" value={form.codigo} onChange={handleChange} required />
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="ordem_producao">{t('quality.retrabalho.op', 'Ordem de Produção')}</label>
                                        <input className={styles.input} id="ordem_producao" name="ordem_producao" value={form.ordem_producao} onChange={handleChange} />
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="ncr">{t('quality.ncr', 'NCR')}</label>
                                        <input className={styles.input} id="ncr" name="ncr" value={form.ncr} onChange={handleChange} />
                                    </div>
                                </div>

                                {/* Row 2: Description (full width) */}
                                <div className={styles.row}>
                                    <div className={styles.field} style={{ flex: 1 }}>
                                        <label className={styles.label} htmlFor="descricao">{t('quality.retrabalho.description', 'Descrição')}</label>
                                        <input className={styles.input} id="descricao" name="descricao" value={form.descricao} onChange={handleChange} />
                                    </div>
                                </div>

                                {/* Row 3: NC, Solicitante, Causa Provável */}
                                <div className={styles.row}>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="nao_conformidade">{t('quality.retrabalho.nc', 'Não Conformidade')}</label>
                                        <select className={styles.select} id="nao_conformidade" name="nao_conformidade" value={form.nao_conformidade} onChange={handleChange}>
                                            <option value="">{t('common.select', 'Selecione...')}</option>
                                            {ncList.map(opt => <option key={opt.id} value={opt.nome}>{opt.nome}</option>)}
                                        </select>
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="solicitante">{t('quality.retrabalho.requester', 'Solicitante')}</label>
                                        <select className={styles.select} id="solicitante" name="solicitante" value={form.solicitante} onChange={handleChange}>
                                            <option value="">{t('common.select', 'Selecione...')}</option>
                                            {solicitanteList.map(opt => <option key={opt.id} value={opt.nome}>{opt.nome}</option>)}
                                        </select>
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="causa_provavel">{t('quality.retrabalho.probableCause', 'Causa Provável (4M1D)')}</label>
                                        <select className={styles.select} id="causa_provavel" name="causa_provavel" value={form.causa_provavel} onChange={handleChange}>
                                            <option value="">{t('common.select', 'Selecione...')}</option>
                                            {CAUSAS_PROVAVEIS.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Row 4: O, S, D, Total, Horas */}
                                <div className={styles.row}>
                                    <div className={styles.field} style={{ minWidth: '100px', flex: 0.5 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                                            <label className={styles.label} htmlFor="ocorrencia" style={{ marginBottom: 0 }}>{t('quality.retrabalho.occurrence', 'Ocorrência')}</label>
                                            <HelpTooltip content={renderHelpContent('occurrence')} placement="top-left" />
                                        </div>
                                        <select className={styles.select} id="ocorrencia" name="ocorrencia" value={form.ocorrencia} onChange={handleChange} required>
                                            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                    </div>
                                    <div className={styles.field} style={{ minWidth: '100px', flex: 0.5 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                                            <label className={styles.label} htmlFor="severidade" style={{ marginBottom: 0 }}>{t('quality.retrabalho.severity', 'Severidade')}</label>
                                            <HelpTooltip content={renderHelpContent('severity')} />
                                        </div>
                                        <select className={styles.select} id="severidade" name="severidade" value={form.severidade} onChange={handleChange} required>
                                            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                    </div>
                                    <div className={styles.field} style={{ minWidth: '100px', flex: 0.5 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                                            <label className={styles.label} htmlFor="deteccao" style={{ marginBottom: 0 }}>{t('quality.retrabalho.detection', 'Detecção')}</label>
                                            <HelpTooltip content={renderHelpContent('detection')} />
                                        </div>
                                        <select className={styles.select} id="deteccao" name="deteccao" value={form.deteccao} onChange={handleChange} required>
                                            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                    </div>
                                    <div className={styles.field} style={{ minWidth: '80px', flex: 0.4 }}>
                                        <label className={styles.label}>{t('quality.retrabalho.total', 'Total')}</label>
                                        <div style={{ display: 'flex', alignItems: 'center', height: '44px' }}>
                                            <span className={getTotalClass(formTotal)}>{formTotal}</span>
                                        </div>
                                    </div>
                                    <div className={styles.field} style={{ minWidth: '120px', flex: 0.7 }}>
                                        <label className={styles.label} htmlFor="horas_retrabalho">{t('quality.retrabalho.hours', 'Horas Retrabalho')}</label>
                                        <input className={styles.input} id="horas_retrabalho" name="horas_retrabalho" value={form.horas_retrabalho} onChange={handleChange} placeholder="HH:MM:SS" />
                                    </div>
                                </div>

                                {formTotal >= 18 && (
                                    <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#991b1b', fontSize: '0.85rem', fontWeight: 600 }}>
                                        ⚠️ {t('quality.retrabalho.actionPlanRequired', 'Total ≥ 18 — Plano de ação PDCA obrigatório. Vincule um plano após salvar.')}
                                    </div>
                                )}

                                <div className={styles.actions}>
                                    <button type="submit" className={styles.primaryBtn} disabled={loading}>
                                        <FiSave size={18} />
                                        {loading ? t('common.saving', 'Salvando...') : (editingId ? t('quality.retrabalho.updateBtn', 'Atualizar') : t('common.save', 'Salvar'))}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Table */}
                    <div className={styles.tableCard}>
                        <div className={styles.cardHeader}>
                            <h3 className={styles.cardTitle}>{t('quality.retrabalho.recentEntries', 'Registros de Retrabalho')}</h3>
                        </div>
                        {entries.length === 0 ? (
                            <div className={styles.emptyState}>{t('quality.retrabalho.noEntries', 'Nenhum registro encontrado.')}</div>
                        ) : (
                            <div className={styles.tableContainer}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>{t('common.date', 'Data')}</th>
                                            <th>{t('quality.retrabalho.code', 'Código')}</th>
                                            <th>{t('quality.retrabalho.op', 'OP')}</th>
                                            <th>{t('quality.retrabalho.description', 'Descrição')}</th>
                                            <th>{t('quality.retrabalho.nc', 'NC')}</th>
                                            <th>{t('quality.retrabalho.requester', 'Solic.')}</th>
                                            <th>O</th>
                                            <th>S</th>
                                            <th>D</th>
                                            <th>{t('quality.retrabalho.total', 'Total')}</th>
                                            <th>{t('quality.retrabalho.cause', '4M1D')}</th>
                                            <th>{t('quality.ncr', 'NCR')}</th>
                                            <th>{t('quality.retrabalho.hours', 'Horas')}</th>
                                            <th>{t('quality.retrabalho.actionPlan', 'Plano')}</th>
                                            <th style={{ textAlign: 'center' }}>{t('common.actions', 'Ações')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {entries.map((item) => {
                                            const total = calcTotal(item.ocorrencia, item.severidade, item.deteccao);
                                            return (
                                                <tr key={item.id}>
                                                    <td>{new Date(item.data).toLocaleDateString('pt-BR')}</td>
                                                    <td style={{ fontWeight: 600 }}>{item.codigo}</td>
                                                    <td>{item.ordem_producao}</td>
                                                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.descricao}</td>
                                                    <td><span className={styles.badge}>{item.nao_conformidade}</span></td>
                                                    <td>{item.solicitante}</td>
                                                    <td>{item.ocorrencia}</td>
                                                    <td>{item.severidade}</td>
                                                    <td>{item.deteccao}</td>
                                                    <td><span className={getTotalClass(total)}>{total}</span></td>
                                                    <td><span className={styles.badge}>{item.causa_provavel}</span></td>
                                                    <td>{item.ncr}</td>
                                                    <td>{item.horas_retrabalho}</td>
                                                    <td>
                                                        {item.pdca_plano_id ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <button
                                                                    className={`${styles.pdcaLink} ${styles.pdcaLinked}`}
                                                                    onClick={() => navigate(`/pdca/planos/${item.pdca_plano_id}`)}
                                                                    title={t('quality.retrabalho.viewPlan', 'Ver plano')}
                                                                >
                                                                    🟢 #{item.pdca_plano_numero || '—'}
                                                                    <FiExternalLink size={12} />
                                                                </button>
                                                                <button
                                                                    className={styles.unlinkBtn}
                                                                    onClick={() => handleUnlinkPdca(item.id)}
                                                                    title={t('quality.retrabalho.unlinkPlan', 'Desvincular plano')}
                                                                >
                                                                    <FiXCircle size={13} />
                                                                </button>
                                                            </div>
                                                        ) : total >= 18 ? (
                                                            <button
                                                                className={`${styles.pdcaLink} ${styles.pdcaRequired}`}
                                                                onClick={() => openLinkModal(item.id)}
                                                                title={t('quality.retrabalho.linkPlan', 'Vincular plano de ação')}
                                                            >
                                                                🔴 <FiLink size={12} /> {t('quality.retrabalho.linkBtn', 'Vincular')}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                className={`${styles.pdcaLink} ${styles.pdcaOptional}`}
                                                                onClick={() => openLinkModal(item.id)}
                                                                title={t('quality.retrabalho.linkPlanOptional', 'Vincular plano (opcional)')}
                                                                style={{ cursor: 'pointer' }}
                                                            >
                                                                — <FiLink size={11} style={{ opacity: 0.4 }} />
                                                            </button>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <div className={styles.actionButtons}>
                                                            <button
                                                                className={`${styles.actionBtn} ${styles.editBtn}`}
                                                                onClick={() => handleEdit(item)}
                                                                title={t('quality.config.edit', 'Editar')}
                                                            >
                                                                <FiEdit2 size={16} />
                                                            </button>
                                                            <button
                                                                className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                                                onClick={() => handleDelete(item.id)}
                                                                title={t('quality.config.delete', 'Excluir')}
                                                            >
                                                                <FiTrash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {renderPagination()}
                    </div>
                </div>
            </div>

            {/* PDCA Link Modal */}
            {linkModalOpen && (
                <div className={styles.modalOverlay} onClick={() => setLinkModalOpen(false)}>
                    <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3>{t('quality.retrabalho.linkPdcaTitle', 'Vincular Plano de Ação')}</h3>
                            <button className={styles.closeBtn} onClick={() => setLinkModalOpen(false)}><FiX /></button>
                        </div>

                        <div className={styles.modalBody}>
                            {/* Option 1: Select existing */}
                            <div style={{ marginBottom: '16px' }}>
                                <label className={styles.label} style={{ marginBottom: '6px', display: 'block', fontWeight: 600 }}>
                                    {t('quality.retrabalho.selectExistingPlan', 'Selecionar plano existente:')}
                                </label>
                                <select
                                    className={styles.select}
                                    value={selectedPdcaId}
                                    onChange={(e) => { setSelectedPdcaId(e.target.value); if (e.target.value) setNewPdcaTitulo(''); }}
                                >
                                    <option value="">{t('common.select', 'Selecione...')}</option>
                                    {pdcaPlanos.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.titulo} ({p.status === 'aberto' ? 'Aberto' : p.status === 'em_andamento' ? 'Em Andamento' : p.status})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', margin: '12px 0', fontWeight: 600 }}>— {t('common.or', 'ou')} —</div>

                            {/* Option 2: Create new */}
                            <div>
                                <label className={styles.label} style={{ marginBottom: '6px', display: 'block', fontWeight: 600 }}>
                                    {t('quality.retrabalho.createNewPlan', 'Criar novo plano:')}
                                </label>
                                <input
                                    className={styles.input}
                                    placeholder={t('quality.retrabalho.planTitlePlaceholder', 'Título do plano de ação...')}
                                    value={newPdcaTitulo}
                                    onChange={(e) => { setNewPdcaTitulo(e.target.value); if (e.target.value) setSelectedPdcaId(''); }}
                                />
                            </div>
                        </div>

                        <div className={styles.modalFooter}>
                            <button className={styles.secondaryBtn} onClick={() => setLinkModalOpen(false)}>
                                {t('common.cancel', 'Cancelar')}
                            </button>
                            <button
                                className={styles.primaryBtn}
                                onClick={handleLinkPdca}
                                disabled={linkingLoading || (!selectedPdcaId && !newPdcaTitulo.trim())}
                            >
                                <FiLink size={16} />
                                {linkingLoading
                                    ? t('common.saving', 'Salvando...')
                                    : selectedPdcaId
                                        ? t('quality.retrabalho.linkSelectedBtn', 'Vincular')
                                        : t('quality.retrabalho.createAndLinkBtn', 'Criar e Vincular')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
