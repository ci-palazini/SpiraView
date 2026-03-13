import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FiUploadCloud, FiFileText, FiCheck, FiAlertCircle, FiX, FiTrash2, FiClock } from 'react-icons/fi';
import toast from 'react-hot-toast';
import PageHeader from '../../../shared/components/PageHeader';
import { formatDateTimeShort } from '../../../shared/utils/dateUtils';
import {
    uploadLogisticaProposto,
    getLogisticaProposto,
    deleteLogisticaProposto,
    type LogisticaPropostoResponse,
    type LogisticaPropostoUploadResult,
} from '../../../services/apiClient';
import styles from './PainelUploadPage.module.css';

type PropostoParsedRow = {
    canal_vendas: number | null;
    canal_descricao: string;
    roteiro_separacao: string;
    data_hora: string;
    ordem_venda: string;
    conta_cliente: string;
    nome_cliente: string;
    numero_item: string;
    configuracao: string;
    filial: string;
    tipo_destino: string;
    localizacao: string;
    valor_net: string;
    cidade: string;
    estado: string;
};

const PREVIEW_COLUMNS: { key: keyof PropostoParsedRow; i18n: string; fallback: string }[] = [
    { key: 'roteiro_separacao', i18n: 'logisticaProposto.col.roteiro', fallback: 'Roteiro' },
    { key: 'data_hora', i18n: 'logisticaProposto.col.dateTime', fallback: 'Data/Hora' },
    { key: 'ordem_venda', i18n: 'logisticaProposto.col.ov', fallback: 'OV' },
    { key: 'nome_cliente', i18n: 'logisticaProposto.col.client', fallback: 'Cliente' },
    { key: 'valor_net', i18n: 'logisticaProposto.col.value', fallback: 'Valor NET' },
    { key: 'estado', i18n: 'logisticaProposto.col.state', fallback: 'UF' },
];

function normalizeCellValue(value: string): string {
    return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function parsePropostoHtml(content: string): PropostoParsedRow[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const rows = Array.from(doc.querySelectorAll('tr'));

    let currentCanal: number | null = null;
    let currentCanalDescricao = '';
    const parsedRows: PropostoParsedRow[] = [];

    for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td,th'))
            .map((cell) => normalizeCellValue(cell.textContent ?? ''))
            .filter(Boolean);

        if (cells.length === 0) continue;

        if (cells.length === 2 && /^\d+$/.test(cells[0]) && !/^\d{2}\/\d{2}\/\d{4}/.test(cells[1])) {
            currentCanal = Number(cells[0]);
            currentCanalDescricao = cells[1];
            continue;
        }

        const firstValue = (cells[0] || '').toLowerCase();
        if (firstValue === 'canal de vendas' || firstValue === 'total geral' || firstValue === 'roteiro de separação') {
            continue;
        }

        if (cells.length < 13) continue;

        const [
            roteiroSeparacao,
            dataHora,
            ordemVenda,
            contaCliente,
            nomeCliente,
            numeroItem,
            configuracao,
            filial,
            tipoDestino,
            localizacao,
            valorNet,
            cidade,
            estado,
        ] = cells;

        if (!/^\d+$/.test(roteiroSeparacao)) continue;
        if (!/^OV/i.test(ordemVenda)) continue;
        if (!/^\d{2}\/\d{2}\/\d{4}/.test(dataHora)) continue;

        parsedRows.push({
            canal_vendas: currentCanal,
            canal_descricao: currentCanalDescricao,
            roteiro_separacao: roteiroSeparacao,
            data_hora: dataHora,
            ordem_venda: ordemVenda,
            conta_cliente: contaCliente,
            nome_cliente: nomeCliente,
            numero_item: numeroItem,
            configuracao,
            filial,
            tipo_destino: tipoDestino,
            localizacao,
            valor_net: valorNet,
            cidade,
            estado,
        });
    }

    return parsedRows;
}

export default function LogisticaPropostoUploadPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);

    const [file, setFile] = useState<File | null>(null);
    const [rows, setRows] = useState<PropostoParsedRow[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [result, setResult] = useState<LogisticaPropostoUploadResult | null>(null);
    const [currentUpload, setCurrentUpload] = useState<LogisticaPropostoResponse['uploadInfo']>(null);
    const [loadingHistory, setLoadingHistory] = useState(true);

    const fetchCurrentUpload = useCallback(async () => {
        setLoadingHistory(true);
        try {
            const data = await getLogisticaProposto();
            setCurrentUpload(data.uploadInfo || null);
        } catch {
            // ignore
        } finally {
            setLoadingHistory(false);
        }
    }, []);

    useEffect(() => {
        fetchCurrentUpload();
    }, [fetchCurrentUpload]);

    const processFile = useCallback((selectedFile: File) => {
        if (!selectedFile.name.match(/\.(htm|html)$/i)) {
            toast.error(t('logisticaProposto.upload.errorNotHtml', 'Selecione um arquivo HTML (.htm ou .html).'));
            return;
        }

        setFile(selectedFile);
        setResult(null);

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = String(event.target?.result ?? '');
                const parsed = parsePropostoHtml(content);

                if (parsed.length === 0) {
                    toast.error(t('logisticaProposto.upload.errorParse', 'Não foi possível identificar linhas válidas no relatório.'));
                    setRows([]);
                    return;
                }

                setRows(parsed);
            } catch {
                toast.error(t('logisticaProposto.upload.errorRead', 'Erro ao ler o arquivo HTML.'));
                setRows([]);
            }
        };
        reader.readAsText(selectedFile);
    }, [t]);

    const handleDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        setIsDragging(false);
        const droppedFile = event.dataTransfer.files[0];
        if (droppedFile) processFile(droppedFile);
    }, [processFile]);

    const handleDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback(() => setIsDragging(false), []);

    const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (selectedFile) processFile(selectedFile);
    }, [processFile]);

    const handleClear = useCallback(() => {
        setFile(null);
        setRows([]);
        setResult(null);
        if (inputRef.current) inputRef.current.value = '';
    }, []);

    const handleUpload = useCallback(async () => {
        if (!rows.length || !file) return;

        setUploading(true);
        try {
            const response = await uploadLogisticaProposto(rows, file.name);
            setResult(response);

            if (response.inserted > 0) {
                toast.success(response.message);
                setFile(null);
                setRows([]);
                if (inputRef.current) inputRef.current.value = '';
                await fetchCurrentUpload();
            } else {
                toast.error(response.message || t('logisticaProposto.upload.errorUpload', 'Nenhum dado importado.'));
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            toast.error(message || t('logisticaProposto.upload.errorUpload', 'Erro ao processar upload.'));
        } finally {
            setUploading(false);
        }
    }, [rows, file, t, fetchCurrentUpload]);

    const handleDelete = useCallback(async () => {
        if (!currentUpload) return;
        if (!confirm(t('logisticaProposto.upload.confirmDelete', 'Tem certeza que deseja remover o upload atual?'))) return;

        setDeleting(true);
        try {
            await deleteLogisticaProposto(currentUpload.uploadId);
            toast.success(t('logisticaProposto.upload.deleteSuccess', 'Upload removido com sucesso.'));
            setCurrentUpload(null);
            setResult(null);
        } catch {
            toast.error(t('logisticaProposto.upload.deleteError', 'Erro ao remover upload.'));
        } finally {
            setDeleting(false);
        }
    }, [currentUpload, t]);

    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const previewRows = rows.slice(0, 8);

    return (
        <>
            <PageHeader
                title={t('logisticaProposto.upload.title', 'Upload - Faturamento Proposto')}
                subtitle={t('logisticaProposto.upload.subtitle', 'Importe o relatório HTML de faturamento proposto')}
            />

            <div className={styles.container}>
                {!file && (
                    <div
                        className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ''}`}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onClick={() => inputRef.current?.click()}
                    >
                        <FiUploadCloud className={styles.dropzoneIcon} />
                        <p className={styles.dropzoneText}>
                            {t('logisticaProposto.upload.dropzone', 'Arraste o arquivo aqui, ou clique para selecionar')}
                        </p>
                        <p className={styles.dropzoneHint}>
                            {t('logisticaProposto.upload.dropzoneHint', 'Formatos suportados: .htm, .html')}
                        </p>
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".htm,.html"
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                        />
                    </div>
                )}

                {file && (
                    <div className={styles.fileInfo}>
                        <FiFileText className={styles.fileIcon} />
                        <span className={styles.fileName}>{file.name}</span>
                        <span className={styles.fileSize}>{formatBytes(file.size)}</span>
                        <span className={styles.rowCount}>
                            {rows.length} {t('logisticaProposto.rows', 'registros')}
                        </span>
                        <button className={styles.removeBtn} onClick={handleClear} title={t('common.cancel', 'Cancelar')}>
                            <FiX />
                        </button>
                    </div>
                )}

                {rows.length > 0 && !result && (
                    <div className={styles.previewSection}>
                        <h3 className={styles.previewTitle}>
                            {t('logisticaProposto.upload.preview', 'Pré-visualização')} ({rows.length} {t('logisticaProposto.rows', 'linhas')})
                        </h3>

                        <div className={styles.previewTableWrapper}>
                            <table className={styles.previewTable}>
                                <thead>
                                    <tr>
                                        {PREVIEW_COLUMNS.map((column) => (
                                            <th key={column.key}>{t(column.i18n, column.fallback)}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((row, index) => (
                                        <tr key={`${row.roteiro_separacao}-${row.ordem_venda}-${index}`}>
                                            {PREVIEW_COLUMNS.map((column) => (
                                                <td key={column.key}>{String(row[column.key] ?? '')}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className={styles.actions}>
                            <button className={styles.uploadBtn} onClick={handleUpload} disabled={uploading}>
                                {uploading ? (
                                    <>
                                        <span className={styles.spinner} />
                                        {t('logisticaProposto.uploading', 'Processando...')}
                                    </>
                                ) : (
                                    <>
                                        <FiUploadCloud />
                                        {t('logisticaProposto.upload.confirm', 'Confirmar Upload')}
                                    </>
                                )}
                            </button>
                            <button className={styles.cancelBtn} onClick={handleClear} disabled={uploading}>
                                {t('common.cancel', 'Cancelar')}
                            </button>
                        </div>
                    </div>
                )}

                {result && (
                    <div className={`${styles.resultCard} ${result.inserted > 0 ? styles.resultCardSuccess : styles.resultCardError}`}>
                        <div className={styles.resultHeader}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {result.inserted > 0
                                    ? <FiCheck size={24} color="#16a34a" />
                                    : <FiAlertCircle size={24} color="#dc2626" />
                                }
                                <strong className={result.inserted > 0 ? styles.resultTitle : styles.resultTitleError}>
                                    {result.message}
                                </strong>
                            </div>
                            <button className={styles.closeBtn} onClick={handleClear} title={t('common.close', 'Fechar')}>
                                <FiX />
                            </button>
                        </div>

                        {result.errors.length > 0 && (
                            <ul className={styles.errorList}>
                                {result.errors.slice(0, 10).map((error, index) => (
                                    <li key={`${error.linha}-${index}`}>
                                        {t('logisticaProposto.upload.lineError', 'Linha')} {error.linha}: {error.erro}
                                    </li>
                                ))}
                                {result.errors.length > 10 && (
                                    <li>...{result.errors.length - 10} {t('logisticaProposto.upload.moreErrors', 'mais erros')}</li>
                                )}
                            </ul>
                        )}

                        {result.inserted > 0 && (
                            <div className={styles.resultActions}>
                                <button className={styles.viewPainelBtn} onClick={() => navigate('/logistica/proposto/dashboard')}>
                                    {t('logisticaProposto.upload.viewPainel', 'Ver dashboard')}
                                </button>
                                <button className={styles.cancelBtn} onClick={handleClear}>
                                    {t('logisticaProposto.upload.newUpload', 'Novo upload')}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className={styles.container} style={{ marginTop: 0 }}>
                <div className={styles.historyHeader}>
                    <div className={styles.historyTitle}>
                        <FiClock />
                        <span>{t('logisticaProposto.upload.history', 'Último Upload Ativo')}</span>
                    </div>
                </div>

                {loadingHistory ? (
                    <p style={{ color: '#64748b' }}>{t('common.loading', 'Carregando...')}</p>
                ) : !currentUpload ? (
                    <p style={{ color: '#64748b' }}>{t('logisticaProposto.upload.noUploads', 'Nenhum upload encontrado.')}</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className={styles.previewTable}>
                            <thead>
                                <tr>
                                    <th>{t('logisticaProposto.upload.linesCount', 'Registros')}</th>
                                    <th>{t('logisticaProposto.upload.uploadedAt', 'Enviado em')}</th>
                                    <th>{t('logisticaProposto.upload.uploadedBy', 'Enviado por')}</th>
                                    <th>{t('logisticaProposto.upload.status', 'Status')}</th>
                                    <th>{t('common.actions', 'Ações')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>{currentUpload.totalRows}</td>
                                    <td>{formatDateTimeShort(currentUpload.criadoEm)}</td>
                                    <td>{currentUpload.uploadPorNome || currentUpload.uploadPorEmail || '—'}</td>
                                    <td>
                                        <span style={{ color: '#16a34a', fontWeight: 500 }}>
                                            {t('common.active', 'Ativo')}
                                        </span>
                                    </td>
                                    <td>
                                        <button
                                            className={styles.deleteRowBtn}
                                            onClick={handleDelete}
                                            disabled={deleting}
                                            title={t('logisticaProposto.upload.deleteUpload', 'Remover upload')}
                                        >
                                            <FiTrash2 />
                                            {deleting ? t('common.deleting', 'Removendo...') : t('common.delete', 'Remover')}
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}
