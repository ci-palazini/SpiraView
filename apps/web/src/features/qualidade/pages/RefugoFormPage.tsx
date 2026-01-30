import { useState, ChangeEvent, FormEvent, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiSave, FiUploadCloud, FiFile, FiCheck, FiX, FiEdit2, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

import { http, listarOrigens, listarMotivos, QualidadeOpcao } from '../../../services/apiClient';
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
    numero_ncr: ''
};

export default function RefugoFormPage() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [recentEntries, setRecentEntries] = useState<RefugoItem[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [form, setForm] = useState(INITIAL_FORM);

    // Options Lists
    const [origensList, setOrigensList] = useState<QualidadeOpcao[]>([]);
    const [motivosList, setMotivosList] = useState<QualidadeOpcao[]>([]);

    // Upload state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadMode, setUploadMode] = useState(false);
    const [importing, setImporting] = useState(false);

    useEffect(() => {
        fetchRecentEntries();
        fetchOptions();
    }, []);

    const fetchOptions = async () => {
        try {
            const [origens, motivos] = await Promise.all([
                listarOrigens(),
                listarMotivos()
            ]);
            setOrigensList(origens);
            setMotivosList(motivos);
        } catch (err) {
            console.error('Failed to fetch options', err);
            toast.error('Erro ao carregar opções (Origens/Motivos).');
        }
    };

    const fetchRecentEntries = async () => {
        try {
            const res = await http.get<{ items: RefugoItem[] }>('/qualidade/refugos');
            const data = Array.isArray(res) ? res : (res.items || []);
            setRecentEntries(data);
        } catch (err) {
            console.error('Failed to fetch recent entries', err);
        }
    };

    const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const workbook = XLSX.read(bstr, { type: 'binary' });
                const wsname = workbook.SheetNames[0];
                const ws = workbook.Sheets[wsname];

                const data = XLSX.utils.sheet_to_json<any>(ws);

                if (data.length === 0) {
                    toast.error('Arquivo vazio ou formato inválido');
                    return;
                }

                const normalizeKey = (key: string) => key
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, "") // Remove accents
                    .replace(/[^a-z0-9]/g, ""); // Remove non-alphanumeric (newlines, spaces, symbols)

                const getValue = (row: any, aliases: string[]) => {
                    const keys = Object.keys(row);
                    // 1. Try exact normalized match
                    let foundKey = keys.find(k => aliases.some(alias => normalizeKey(k) === normalizeKey(alias)));

                    // 2. Try partial match (key includes alias)
                    if (!foundKey) {
                        foundKey = keys.find(k => aliases.some(alias => normalizeKey(k).includes(normalizeKey(alias))));
                    }

                    if (foundKey) return row[foundKey];

                    // console.warn('Column not found for aliases:', aliases, 'Available keys:', keys);
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
                    // Map legacy 'setor' or new 'origem' column from Excel
                    origem: String(getValue(row, ['origem', 'setor', 'area', 'depto', 'departamento']) || '').toUpperCase(),
                    origem_referencia: String(getValue(row, ['referencia', 'op', 'ordem', 'ref']) || ''),
                    numero_ncr: String(getValue(row, ['ncr', 'nao conformidade', 'numero ncr']) || ''),
                    codigo_item: String(getValue(row, ['codigo', 'item', 'cod item', 'part number', 'material']) || ''),
                    descricao_item: String(getValue(row, ['descricao', 'desc', 'descricao item']) || ''),
                    motivo_defeito: String(getValue(row, ['motivo', 'defeito', 'causa']) || 'OUTROS').toUpperCase(),
                    quantidade: parseNumber(getValue(row, ['qtd', 'qtde', 'quantidade', 'quant'])),
                    custo: parseNumber(getValue(row, ['custo', 'valor', 'preco', 'total', 'vl total'])),
                    responsavel_nome: String(getValue(row, ['responsavel', 'resp', 'funcionario']) || '')
                }));

                const res = await http.post<any>('/qualidade/refugos/upload', { data: { items } });

                if (res.ok || res.success) {
                    const summary = res.summary || { sucesso: items.length, erro: 0, erros: [] };
                    toast.success(`${summary.sucesso} registros importados!`);

                    fetchRecentEntries();

                    if (summary.erro > 0) {
                        toast.error(`${summary.erro} falhas. Verifique o console.`);
                        console.error(summary.erros);
                        if (summary.erros.length > 0) {
                            alert(`Erros na importação:\n${summary.erros.slice(0, 10).join('\n')}\n...`);
                        }
                    } else {
                        setUploadMode(false);
                    }
                }
            } catch (err: any) {
                console.error(err);
                toast.error('Erro ao processar: ' + err.message);
            } finally {
                setImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
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
            numero_ncr: item.numero_ncr || ''
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setForm({ ...INITIAL_FORM, data_ocorrencia: new Date().toISOString().split('T')[0] });
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir este lançamento?')) return;
        try {
            await http.delete(`/qualidade/refugos/${id}`);
            toast.success('Lançamento excluído.');
            fetchRecentEntries();
        } catch (err: any) {
            console.error(err);
            toast.error('Erro ao excluir.');
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
                toast.success('Lançamento atualizado!');
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

    return (
        <>
            <PageHeader
                title={editingId ? 'Editar Lançamento' : t('quality.newScrap', 'Refugo')}
                subtitle={t('quality.formSubtitle', 'Registre as não-conformidades e refugos identificados no processo.')}
                actions={
                    <button
                        className={styles.secondaryBtn}
                        onClick={() => setUploadMode(!uploadMode)}
                    >
                        {uploadMode ? <FiX /> : <FiUploadCloud />}
                        {uploadMode ? 'Cancelar Upload' : 'Importar Excel'}
                    </button>
                }
            />
            <div className={styles.container}>

                <div className={styles.contentGrid}>
                    {uploadMode ? (
                        <div className={styles.uploadCard}>
                            <div className={styles.uploadHeader}>
                                <FiFile size={48} color="#9ca3af" style={{ marginBottom: 16 }} />
                                <h3 className={styles.textLg}>Importar planilha de Refugos</h3>
                                <p className={styles.textSm}>Selecione um arquivo .xlsx com as colunas: Data, Origem, Item, Qtd, Custo...</p>
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
                                    {importing ? 'Importando...' : 'Selecionar Arquivo'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.formCard}>
                            <div className={styles.cardHeader}>
                                <h3 className={styles.cardTitle}>
                                    {editingId ? 'Editando Registro' : 'Novo Registro'}
                                </h3>
                                {editingId && (
                                    <button className={styles.secondaryBtn} onClick={handleCancelEdit} style={{ fontSize: '0.8rem', padding: '4px 12px', height: 'auto' }}>
                                        Cancelar Edição
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
                                        <input
                                            className={styles.input}
                                            id="responsavel_nome"
                                            name="responsavel_nome"
                                            value={form.responsavel_nome}
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>

                                <div className={styles.actions}>
                                    <button
                                        type="submit"
                                        className={styles.primaryBtn}
                                        disabled={loading}
                                    >
                                        <FiSave size={18} />
                                        {loading ? t('common.saving', 'Salvando...') : (editingId ? 'Atualizar Lançamento' : t('common.save', 'Salvar Lançamento'))}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    <div className={styles.tableCard}>
                        <div className={styles.cardHeader}>
                            <h3 className={styles.cardTitle}>Últimos Lançamentos</h3>
                        </div>
                        {recentEntries.length === 0 ? (
                            <div className={styles.emptyState}>Nenhum registro encontrado recentemante.</div>
                        ) : (
                            <div className={styles.tableContainer}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Data</th>
                                            <th>Origem</th>
                                            <th>OP</th>
                                            <th>Item</th>
                                            <th>Qtd</th>
                                            <th>Custo</th>
                                            <th>Motivo</th>
                                            <th style={{ textAlign: 'center' }}>Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentEntries.map((item) => (
                                            <tr key={item.id}>
                                                <td>{new Date(item.data_ocorrencia).toLocaleDateString()}</td>
                                                <td>{item.origem}</td>
                                                <td>{item.origem_referencia}</td>
                                                <td>
                                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{item.codigo_item}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{item.descricao_item}</div>
                                                </td>
                                                <td>{item.quantidade}</td>
                                                <td>
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.custo)}
                                                </td>
                                                <td>
                                                    <span className={styles.badge}>
                                                        {item.motivo_defeito}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <div className={styles.actionButtons}>
                                                        <button
                                                            className={`${styles.actionBtn} ${styles.editBtn}`}
                                                            onClick={() => handleEdit(item)}
                                                            title="Editar"
                                                        >
                                                            <FiEdit2 size={16} />
                                                        </button>
                                                        <button
                                                            className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                                            onClick={() => handleDelete(item.id)}
                                                            title="Excluir"
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
                </div>
            </div>
        </>
    );
}
