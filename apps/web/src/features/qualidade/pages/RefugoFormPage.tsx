import { useState, ChangeEvent, FormEvent, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiSave, FiUploadCloud, FiFile, FiCheck, FiX, FiEdit2, FiTrash2, FiChevronLeft, FiChevronRight, FiChevronsRight, FiChevronsLeft, FiDownload } from 'react-icons/fi';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

import { http, listarOrigens, listarMotivos, listarResponsaveisSettings, QualidadeOpcao, criarOrigem, criarMotivo, criarResponsavel } from '../../../services/apiClient';
import { formatDate } from '../../../shared/utils/dateUtils';
import { ReconciliationModal, ReconciliationActions } from '../components/ReconciliationModal';
import PageHeader from '../../../shared/components/PageHeader';
import styles from './RefugoFormPage.module.css';

interface RefugoItem {
    id: string;
    data_ocorrencia: string;
    origem: string; // Renamed from setor
    origem_referencia: string;
    codigo_item: string;
    descricao_item: string;
    motivo_defeito: string;
    quantidade: number;
    custo: number;
    responsavel_nome: string;
    numero_ncr: string;
    tipo_lancamento?: 'REFUGO' | 'QUARENTENA';
    created_at?: string;
}

const INITIAL_FORM = {
    data_ocorrencia: new Date().toISOString().split('T')[0],
    origem_referencia: '',
    codigo_item: '',
    descricao_item: '',
    motivo_defeito: '',
    quantidade: '',
    custo: '',
    origem: '', // Renamed from setor
    responsavel_nome: '',
    numero_ncr: '',
    tipo_lancamento: 'REFUGO'
};

export default function RefugoFormPage() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [recentEntries, setRecentEntries] = useState<RefugoItem[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Pagination State
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    const [form, setForm] = useState(INITIAL_FORM);

    // Options Lists
    const [origensList, setOrigensList] = useState<QualidadeOpcao[]>([]);
    const [motivosList, setMotivosList] = useState<QualidadeOpcao[]>([]);
    const [responsaveisList, setResponsaveisList] = useState<QualidadeOpcao[]>([]);

    // Upload state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadMode, setUploadMode] = useState(false);
    const [importing, setImporting] = useState(false);

    // Upload Result State
    interface UploadResultSummary {
        sucesso: number;
        ignorado: number;
        erro: number;
        erros: string[];
    }
    const [uploadResult, setUploadResult] = useState<UploadResultSummary | null>(null);

    // Reconciliation State
    const [pendingUploadItems, setPendingUploadItems] = useState<any[]>([]);
    const [reconciliationData, setReconciliationData] = useState<{
        unknowns: { origens: string[]; motivos: string[]; responsaveis: string[] };
        existing: { origens: QualidadeOpcao[]; motivos: QualidadeOpcao[]; responsaveis: QualidadeOpcao[] };
    } | null>(null);

    useEffect(() => {
        fetchRecentEntries(page);
    }, [page]); // Re-fetch when page changes

    useEffect(() => {
        fetchOptions();
    }, []);

    const fetchOptions = async () => {
        try {
            const [origens, motivos, responsaveis] = await Promise.all([
                listarOrigens(),
                listarMotivos(),
                listarResponsaveisSettings()
            ]);
            setOrigensList(origens);
            setMotivosList(motivos);
            setResponsaveisList(responsaveis);
        } catch (err) {
            console.error('Failed to fetch options', err);
            toast.error(t('quality.config.loadError', 'Erro ao carregar opções (Origens/Motivos).'));
        }
    };

    const fetchRecentEntries = async (currentPage = 1) => {
        try {
            const res = await http.get<{ items: RefugoItem[], meta: any }>(`/qualidade/refugos?page=${currentPage}&limit=50`);
            // Handle both legacy (array) and new (object with meta) response structures for safety
            if (Array.isArray(res)) {
                setRecentEntries(res);
            } else {
                setRecentEntries(res.items || []);
                if (res.meta) {
                    setTotalPages(res.meta.totalPages);
                    setTotalItems(res.meta.total);
                }
            }
        } catch (err) {
            console.error('Failed to fetch recent entries', err);
        }
    };



    const processUpload = async (items: any[]) => {
        try {
            setImporting(true);
            const res = await http.post<any>('/qualidade/refugos/upload', { data: { items } });

            if (res.ok || res.success) {
                const summary = res.summary || { sucesso: items.length, erro: 0, ignorado: 0, erros: [] };
                setUploadResult(summary);

                if (summary.sucesso > 0) {
                    toast.success(t('quality.refugo.importSuccessMsg', { count: summary.sucesso, defaultValue: `${summary.sucesso} registros importados!` }));
                    fetchRecentEntries(1); // Refresh list
                } else if (summary.erro > 0) {
                    toast.error(t('quality.refugo.importPartialMsg', 'Houve erros na importação. Verifique os detalhes.'));
                } else if (summary.ignorado > 0) {
                    toast(t('quality.refugo.importIgnoredMsg', 'Alguns itens foram ignorados (duplicados).'), { icon: '⚠️' });
                } else {
                    toast.error(t('quality.refugo.importEmptyMsg', 'Nenhum registro foi importado. Verifique o formato do arquivo.'));
                }
            }
        } catch (err: any) {
            console.error(err);
            toast.error(t('quality.refugo.processError', { message: err.message, defaultValue: 'Erro ao processar: ' + err.message }));
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            setReconciliationData(null); // Close modal
        }
    }

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

                const data = XLSX.utils.sheet_to_json<any>(ws);

                console.log('Excel Data:', data);
                if (data.length === 0) {
                    toast.error(t('quality.refugo.emptyFileError', 'Arquivo vazio ou formato inválido'));
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

                const parseNumber = (val: any) => {
                    if (typeof val === 'number') return val;
                    if (typeof val === 'string') {
                        const normalized = val.replace(/\./g, '').replace(',', '.');
                        const num = parseFloat(normalized);
                        return isNaN(num) ? 0 : num;
                    }
                    return 0;
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
                    data_ocorrencia: parseDate(getValue(row, ['data', 'dt', 'date'])),
                    origem: String(getValue(row, ['origem', 'setor', 'area', 'depto', 'departamento']) || '').toUpperCase().trim(),
                    origem_referencia: String(getValue(row, ['referencia', 'op', 'ordem', 'ref']) || ''),
                    numero_ncr: String(getValue(row, ['ncr', 'nao conformidade', 'numero ncr']) || ''),
                    codigo_item: String(getValue(row, ['codigo', 'item', 'cod item', 'part number', 'material']) || ''),
                    descricao_item: String(getValue(row, ['descricao', 'desc', 'descricao item']) || ''),
                    motivo_defeito: String(getValue(row, ['motivo', 'defeito', 'causa']) || 'OUTROS').toUpperCase().trim(),
                    quantidade: parseNumber(getValue(row, ['qtd', 'qtde', 'quantidade', 'quant'])),
                    custo: parseNumber(getValue(row, ['custo', 'valor', 'preco', 'total', 'vl total'])),
                    responsavel_nome: String(getValue(row, ['responsavel', 'resp', 'funcionario']) || '').toUpperCase().trim()
                })).filter((i: any) => i.codigo_item && i.motivo_defeito && i.origem); // Basic filter

                console.log('Filtered Items:', items);

                if (items.length === 0) {
                    toast.error(t('quality.refugo.invalidFormatError', 'Nenhum registro válido encontrado. Verifique se as colunas obrigatórias (Data, Origem, Item, Motivo, Qtd, Custo) estão presentes e preenchidas.'));
                    setImporting(false);
                    return;
                }

                // VALIDATION FOR RECONCILIATION
                const uniqueOrigens = [...new Set(items.map((i: any) => i.origem).filter((x: string) => x))];
                const uniqueMotivos = [...new Set(items.map((i: any) => i.motivo_defeito).filter((x: string) => x))];
                const uniqueResponsaveis = [...new Set(items.map((i: any) => i.responsavel_nome).filter((x: string) => x))];

                const unknownOrigens = uniqueOrigens.filter(u => !origensList.some(k => k.nome === u));
                const unknownMotivos = uniqueMotivos.filter(u => !motivosList.some(k => k.nome === u));
                const unknownResponsaveis = uniqueResponsaveis.filter(u => !responsaveisList.some(k => k.nome === u));

                console.log('Unknowns:', { unknownOrigens, unknownMotivos, unknownResponsaveis });

                if (unknownOrigens.length > 0 || unknownMotivos.length > 0 || unknownResponsaveis.length > 0) {
                    console.log('Triggering Reconciliation Modal');
                    setPendingUploadItems(items);
                    setReconciliationData({
                        unknowns: {
                            origens: unknownOrigens as string[],
                            motivos: unknownMotivos as string[],
                            responsaveis: unknownResponsaveis as string[]
                        },
                        existing: {
                            origens: origensList,
                            motivos: motivosList,
                            responsaveis: responsaveisList
                        }
                    });
                    setImporting(false); // Stop "importing" spinner, show modal
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    return;
                }

                // If no unknowns, proceed
                await processUpload(items);

            } catch (err: any) {
                console.error(err);
                toast.error(t('quality.refugo.processError', { message: err.message, defaultValue: 'Erro ao processar: ' + err.message }));
                setImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleReconciliationConfirm = async (actions: ReconciliationActions) => {
        setReconciliationData(null);
        setImporting(true);
        const toastId = toast.loading(t('quality.refugo.processingAdjustments', 'Processando ajustes...'));

        try {
            // 1. Create new items
            const newOrigens = Object.entries(actions.origens).filter(([_, a]) => a.type === 'create').map(([k]) => k);
            const newMotivos = Object.entries(actions.motivos).filter(([_, a]) => a.type === 'create').map(([k]) => k);
            const newResponsaveis = Object.entries(actions.responsaveis).filter(([_, a]) => a.type === 'create').map(([k]) => k);

            await Promise.all([
                ...newOrigens.map(n => criarOrigem(n)),
                ...newMotivos.map(n => criarMotivo(n)),
                ...newResponsaveis.map(n => criarResponsavel(n))
            ]);

            // Refresh options in background
            fetchOptions();

            // 2. Map items
            const mappedItems = pendingUploadItems.map(item => {
                const newItem = { ...item };

                // Map Origem
                if (actions.origens[item.origem]) {
                    const action = actions.origens[item.origem];
                    if (action.type === 'map' && action.targetValue) {
                        newItem.origem = action.targetValue;
                    }
                    // if create, it stays as is, which matches the newly created item
                }

                // Map Motivo
                if (actions.motivos[item.motivo_defeito]) {
                    const action = actions.motivos[item.motivo_defeito];
                    if (action.type === 'map' && action.targetValue) {
                        newItem.motivo_defeito = action.targetValue;
                    }
                }

                // Map Responsavel
                if (actions.responsaveis[item.responsavel_nome]) {
                    const action = actions.responsaveis[item.responsavel_nome];
                    if (action.type === 'map' && action.targetValue) {
                        newItem.responsavel_nome = action.targetValue;
                    }
                }

                return newItem;
            });

            toast.dismiss(toastId);
            await processUpload(mappedItems);

        } catch (e) {
            console.error(e);
            toast.error(t('quality.refugo.createAdjustmentsError', 'Erro ao criar novos itens.'), { id: toastId });
            setImporting(false);
        }
    };

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleEdit = (item: RefugoItem) => {
        setEditingId(item.id);
        setForm({
            data_ocorrencia: item.data_ocorrencia ? item.data_ocorrencia.split('T')[0] : '',
            origem_referencia: item.origem_referencia || '',
            codigo_item: item.codigo_item || '',
            descricao_item: item.descricao_item || '',
            motivo_defeito: item.motivo_defeito || '',
            quantidade: String(item.quantidade),
            custo: String(item.custo),
            origem: item.origem || '',
            responsavel_nome: item.responsavel_nome || '',
            numero_ncr: item.numero_ncr || '',
            tipo_lancamento: item.tipo_lancamento || 'REFUGO'
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setForm({ ...INITIAL_FORM, data_ocorrencia: new Date().toISOString().split('T')[0] });
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm(t('quality.refugo.confirmDelete', 'Tem certeza que deseja excluir este lançamento?'))) return;
        try {
            await http.delete(`/qualidade/refugos/${id}`);
            toast.success(t('quality.refugo.deleteSuccess', 'Lançamento excluído.'));
            fetchRecentEntries();
        } catch (err: any) {
            console.error(err);
            toast.error(t('quality.refugo.deleteError', 'Erro ao excluir.'));
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                ...form,
                quantidade: Number(form.quantidade),
                custo: Number(form.custo)
            };

            if (editingId) {
                await http.put(`/qualidade/refugos/${editingId}`, { data: payload });
                toast.success(t('quality.refugo.updateSuccess', 'Lançamento atualizado!'));
            } else {
                await http.post('/qualidade/refugos', { data: payload });
                toast.success(t('quality.success', 'Lançamento realizado com sucesso!'));
            }

            handleCancelEdit();
            fetchRecentEntries();
        } catch (err: any) {
            console.error(err);
            toast.error(err?.message || (editingId ? 'Erro ao atualizar.' : t('quality.error', 'Erro ao salvar lançamento.')));
        } finally {
            setLoading(false);
        }
    };

    const handleExportBackup = async () => {
        const toastId = toast.loading(t('quality.refugo.exporting', 'Gerando backup...'));
        try {
            // Fetch ALL data with high limit
            const res = await http.get<{ items: RefugoItem[] }>('/qualidade/refugos?limit=100000');
            const items = Array.isArray(res) ? res : (res.items || []);

            if (items.length === 0) {
                toast.error(t('quality.refugo.noDataToExport', 'Sem dados para exportar.'), { id: toastId });
                return;
            }

            // Map to clean format
            const exportData = items.map(item => ({
                Data: new Date(item.data_ocorrencia).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
                Origem: item.origem,
                'Ref. (OP)': item.origem_referencia,
                NCR: item.numero_ncr,
                'Cód. Item': item.codigo_item,
                'Desc. Item': item.descricao_item,
                Motivo: item.motivo_defeito,
                Qtd: item.quantidade,
                Custo: item.custo,
                Responsável: item.responsavel_nome,
                Tipo: item.tipo_lancamento || 'REFUGO'
            }));

            // Generate Sheet
            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Backup Refugos");

            // Download
            const dateStr = new Date().toISOString().split('T')[0];
            XLSX.writeFile(wb, `backup_refugos_${dateStr}.xlsx`);

            toast.success(t('quality.refugo.exportSuccess', 'Backup baixado com sucesso!'), { id: toastId });
        } catch (err: any) {
            console.error(err);
            toast.error(t('quality.refugo.exportError', 'Erro ao gerar backup.'), { id: toastId });
        }
    };

    return (
        <>
            <PageHeader
                title={editingId ? t('quality.refugo.editTitle', 'Editar Lançamento') : t('quality.newScrap', 'Refugo')}
                subtitle={t('quality.formSubtitle', 'Registre as não-conformidades e refugos identificados no processo.')}
                actions={
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            className={styles.secondaryBtn}
                            onClick={handleExportBackup}
                            title={t('quality.refugo.downloadBackup', 'Baixar todos os dados')}
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
                            {uploadMode ? t('quality.refugo.cancelUpload', 'Cancelar Upload') : t('quality.refugo.importExcel', 'Importar Excel')}
                        </button>
                    </div>
                }
            />
            {reconciliationData && (
                <ReconciliationModal
                    unknowns={reconciliationData.unknowns}
                    existing={reconciliationData.existing}
                    onConfirm={handleReconciliationConfirm}
                    onCancel={() => {
                        setReconciliationData(null);
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
                                <h3 className={styles.textLg}>{t('quality.refugo.importTitle', 'Importar planilha de Refugos')}</h3>
                                <p className={styles.textSm}>{t('quality.refugo.importHelp', 'Selecione um arquivo .xlsx com as colunas: Data, Origem, Item, Qtd, Custo...')}</p>
                            </div>

                            <div className={styles.uploadActions}>
                                <input
                                    type="file"
                                    accept=".xlsx, .xls"
                                    onChange={handleFileChange}
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                />
                                <button
                                    className={styles.primaryBtn}
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={importing}
                                >
                                    {importing ? t('quality.refugo.importing', 'Importando...') : t('quality.refugo.selectFile', 'Selecionar Arquivo')}
                                </button>
                            </div>

                            {uploadResult && (
                                <div className={`${styles.resultCard} ${uploadResult.erro === 0 ? styles.resultSuccess : styles.resultError}`}>
                                    <div className={styles.resultHeader}>
                                        <h3 className={styles.resultTitle}>
                                            {uploadResult.erro === 0 ? (
                                                <><FiCheck style={{ verticalAlign: 'middle', marginRight: 8 }} /> {t('quality.refugo.importSuccess', 'Importação Concluída')}</>
                                            ) : (
                                                <><div style={{ color: '#dc2626', display: 'flex', alignItems: 'center' }}><FiX style={{ verticalAlign: 'middle', marginRight: 8 }} /> {t('quality.refugo.importError', 'Importação com Erros')}</div></>
                                            )}
                                        </h3>
                                        <button
                                            className={styles.closeBtn}
                                            onClick={() => setUploadResult(null)}
                                            title={t('common.close', 'Fechar')}
                                        >
                                            <FiX />
                                        </button>
                                    </div>
                                    <ul className={styles.resultList}>
                                        <li><strong>{t('quality.refugo.importedCount', 'Registros importados:')}</strong> {uploadResult.sucesso}</li>
                                        {uploadResult.ignorado > 0 && (
                                            <li><strong>{t('quality.refugo.ignoredCount', 'Registros ignorados (duplicados):')}</strong> {uploadResult.ignorado}</li>
                                        )}
                                        {uploadResult.erro > 0 && (
                                            <li><strong>{t('quality.refugo.errorLinesCount', 'Linhas com erro:')}</strong> {uploadResult.erro}</li>
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
                                    {editingId ? t('quality.refugo.editing', 'Editando Registro') : t('quality.refugo.new', 'Novo Registro')}
                                </h3>
                                {editingId && (
                                    <button className={styles.secondaryBtn} onClick={handleCancelEdit} style={{ fontSize: '0.8rem', padding: '4px 12px', height: 'auto' }}>
                                        {t('quality.refugo.cancelEdit', 'Cancelar Edição')}
                                    </button>
                                )}
                            </div>

                            <form onSubmit={handleSubmit} className={styles.form}>
                                <div className={styles.row}>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="data_ocorrencia">{t('common.date', 'Data')}</label>
                                        <input
                                            className={styles.input}
                                            type="date"
                                            id="data_ocorrencia"
                                            name="data_ocorrencia"
                                            value={form.data_ocorrencia}
                                            onChange={handleChange}
                                            required
                                        />
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="origem">{t('quality.origin', 'Origem')}</label>
                                        <select
                                            className={styles.select}
                                            id="origem"
                                            name="origem"
                                            value={form.origem}
                                            onChange={handleChange}
                                            required
                                        >
                                            <option value="" disabled>{t('common.select', 'Selecione...')}</option>
                                            {origensList.map(opt => <option key={opt.id} value={opt.nome}>{opt.nome}</option>)}
                                        </select>
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="tipo_lancamento">{t('common.type', 'Tipo')}</label>
                                        <select
                                            className={styles.select}
                                            id="tipo_lancamento"
                                            name="tipo_lancamento"
                                            value={form.tipo_lancamento}
                                            // @ts-ignore
                                            onChange={handleChange}
                                            required
                                        >
                                            <option value="REFUGO">{t('common.refugo', 'Refugo')}</option>
                                            <option value="QUARENTENA">{t('common.quarentena', 'Quarentena')}</option>
                                        </select>
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="origem_referencia">{t('quality.reference', 'Referência (OP)')}</label>
                                        <input
                                            className={styles.input}
                                            id="origem_referencia"
                                            name="origem_referencia"
                                            value={form.origem_referencia}
                                            onChange={handleChange}
                                        />
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="numero_ncr">{t('quality.ncr', 'NCR')}</label>
                                        <input
                                            className={styles.input}
                                            id="numero_ncr"
                                            name="numero_ncr"
                                            value={form.numero_ncr}
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>

                                <div className={styles.row}>
                                    <div className={styles.field} style={{ flex: 1 }}>
                                        <label className={styles.label} htmlFor="codigo_item">{t('quality.itemCode', 'Código Item')}</label>
                                        <input
                                            className={styles.input}
                                            id="codigo_item"
                                            name="codigo_item"
                                            value={form.codigo_item}
                                            onChange={handleChange}
                                            required
                                        />
                                    </div>
                                    <div className={styles.field} style={{ flex: 3 }}>
                                        <label className={styles.label} htmlFor="descricao_item">{t('quality.itemDesc', 'Descrição Item')}</label>
                                        <input
                                            className={styles.input}
                                            id="descricao_item"
                                            name="descricao_item"
                                            value={form.descricao_item}
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>

                                <div className={styles.row}>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="motivo_defeito">{t('quality.defectReason', 'Motivo Defeito')}</label>
                                        <select
                                            className={styles.select}
                                            id="motivo_defeito"
                                            name="motivo_defeito"
                                            value={form.motivo_defeito}
                                            onChange={handleChange}
                                            required
                                        >
                                            <option value="" disabled>{t('common.select', 'Selecione...')}</option>
                                            {motivosList.map(opt => <option key={opt.id} value={opt.nome}>{opt.nome}</option>)}
                                        </select>
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="quantidade">{t('quality.quantity', 'Quantidade')}</label>
                                        <input
                                            className={styles.input}
                                            type="number"
                                            id="quantidade"
                                            name="quantidade"
                                            value={form.quantidade}
                                            onChange={handleChange}
                                            required
                                        />
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="custo">{t('quality.cost', 'Custo Total (R$)')}</label>
                                        <input
                                            className={styles.input}
                                            type="number"
                                            id="custo"
                                            name="custo"
                                            value={form.custo}
                                            onChange={handleChange}
                                            required
                                        />
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.label} htmlFor="responsavel_nome">{t('quality.responsible', 'Responsável')}</label>
                                        <select
                                            className={styles.select}
                                            id="responsavel_nome"
                                            name="responsavel_nome"
                                            value={form.responsavel_nome}
                                            onChange={handleChange}
                                        >
                                            <option value="">{t('common.select', 'Selecione...')}</option>
                                            {responsaveisList.map(opt => (
                                                <option key={opt.id} value={opt.nome}>{opt.nome}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className={styles.actions}>
                                    <button
                                        type="submit"
                                        className={styles.primaryBtn}
                                        disabled={loading}
                                    >
                                        <FiSave size={18} />
                                        {loading ? t('common.saving', 'Salvando...') : (editingId ? t('quality.refugo.updateBtn', 'Atualizar Lançamento') : t('common.save', 'Salvar Lançamento'))}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    <div className={styles.tableCard}>
                        <div className={styles.cardHeader}>
                            <h3 className={styles.cardTitle}>{t('quality.refugo.recentEntries', 'Últimos Lançamentos')}</h3>
                        </div>
                        {recentEntries.length === 0 ? (
                            <div className={styles.emptyState}>{t('quality.refugo.noEntries', 'Nenhum registro encontrado recentemente.')}</div>
                        ) : (
                            <div className={styles.tableContainer}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>{t('common.date', 'Data')}</th>
                                            <th>{t('quality.origin', 'Origem')}</th>
                                            <th>{t('quality.reference', 'OP')}</th>
                                            <th>{t('quality.ncr', 'NCR')}</th>
                                            <th>{t('quality.itemCode', 'Item')}</th>
                                            <th>{t('quality.quantity', 'Qtd')}</th>
                                            <th>{t('quality.cost', 'Custo')}</th>
                                            <th>{t('common.type', 'Tipo')}</th>
                                            <th>{t('quality.defectReason', 'Motivo')}</th>
                                            <th>{t('quality.responsible', 'Responsável')}</th>
                                            <th style={{ textAlign: 'center' }}>{t('common.actions', 'Ações')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentEntries.map((item) => (
                                            <tr key={item.id}>
                                                <td>{new Date(item.data_ocorrencia).toLocaleDateString('pt-BR')}</td>
                                                <td>{item.origem}</td>
                                                <td>{item.origem_referencia}</td>
                                                <td>{item.numero_ncr}</td>
                                                <td>
                                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{item.codigo_item}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{item.descricao_item}</div>
                                                </td>
                                                <td>{item.quantidade}</td>
                                                <td>
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.custo)}
                                                </td>
                                                <td>
                                                    {item.tipo_lancamento === 'QUARENTENA' ? (
                                                        <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#fed7aa', color: '#c2410c', fontWeight: 'bold' }}>{t('common.quarentenaAbbr', 'Qua')}</span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#bbf7d0', color: '#15803d', fontWeight: 'bold' }}>{t('common.refugoAbbr', 'Ref')}</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className={styles.badge}>
                                                        {item.motivo_defeito}
                                                    </span>
                                                </td>
                                                <td>{item.responsavel_nome}</td>
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
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className={styles.pagination}>
                            {/* First Page Button */}
                            {page > 1 && (
                                <button
                                    className={styles.pageBtn}
                                    onClick={() => setPage(1)}
                                    title={t('common.firstPage', 'Primeira Página')}
                                >
                                    <FiChevronsLeft size={18} />
                                </button>
                            )}

                            <button
                                className={styles.pageBtn}
                                disabled={page === 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                title={t('common.prevPage', 'Página Anterior')}
                            >
                                <FiChevronLeft size={18} />
                            </button>

                            {/* Window of 3 pages logic: always show current, prev and next if possible */}
                            {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                                let pNum = page;

                                // Adjust window start based on current page
                                if (page === 1) pNum = i + 1;
                                else if (page === totalPages) pNum = totalPages - 2 + i;
                                else pNum = page - 1 + i;

                                // Boundary enforcement
                                if (pNum < 1) pNum = i + 1;
                                if (pNum > totalPages) return null;

                                return (
                                    <button
                                        key={pNum}
                                        className={`${styles.pageBtn} ${page === pNum ? styles.activePage : ''}`}
                                        onClick={() => setPage(pNum)}
                                    >
                                        {pNum}
                                    </button>
                                );
                            }).filter(Boolean)}

                            <button
                                className={styles.pageBtn}
                                disabled={page === totalPages}
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                title={t('common.nextPage', 'Próxima Página')}
                            >
                                <FiChevronRight size={18} />
                            </button>

                            {/* Last Page Button */}
                            {page < totalPages && (
                                <button
                                    className={styles.pageBtn}
                                    onClick={() => setPage(totalPages)}
                                    title={t('common.lastPage', 'Última Página')}
                                >
                                    <FiChevronsRight size={18} />
                                </button>
                            )}

                            <div className={styles.totalInfo}>
                                Exibindo {(page - 1) * 50 + 1} - {Math.min(page * 50, totalItems)} de {totalItems}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
