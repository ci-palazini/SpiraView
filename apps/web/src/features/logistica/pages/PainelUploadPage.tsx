// src/features/logistica/pages/PainelUploadPage.tsx
import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FiUploadCloud, FiFileText, FiCheck, FiAlertCircle, FiX, FiTrash2, FiClock } from 'react-icons/fi';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import PageHeader from '../../../shared/components/PageHeader';
import { formatDateTimeShort } from '../../../shared/utils/dateUtils';
import {
    uploadNotasEmbarque,
    getNotasEmbarque,
    deleteNotasEmbarque,
    type NotasEmbarqueResponse,
    type NotasEmbarqueUploadResult,
} from '../../../services/apiClient';
import styles from './PainelUploadPage.module.css';

export default function PainelUploadPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);

    const [file, setFile] = useState<File | null>(null);
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [result, setResult] = useState<NotasEmbarqueUploadResult | null>(null);
    const [currentUpload, setCurrentUpload] = useState<NotasEmbarqueResponse['uploadInfo']>(null);
    const [loadingHistory, setLoadingHistory] = useState(true);

    const fetchCurrentUpload = useCallback(async () => {
        setLoadingHistory(true);
        try {
            const data = await getNotasEmbarque();
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

    const processFile = useCallback((f: File) => {
        if (!f.name.match(/\.(csv|xlsx|xls)$/i)) {
            toast.error(t('logisticaPainel.errorNotExcel', 'Por favor, selecione um arquivo Excel ou CSV.'));
            return;
        }
        setFile(f);
        setResult(null);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
                // Normalize only key names, preserve native types
                const normalized = json.map(row => {
                    const newRow: Record<string, unknown> = {};
                    for (const key in row) newRow[key.trim()] = row[key];
                    return newRow;
                });
                setRows(normalized);
            } catch {
                toast.error(t('logisticaPainel.errorNotExcel', 'Erro ao ler arquivo.'));
                setRows([]);
            }
        };
        reader.readAsArrayBuffer(f);
    }, [t]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) processFile(f);
    }, [processFile]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback(() => setIsDragging(false), []);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) processFile(f);
    }, [processFile]);

    const handleClear = useCallback(() => {
        setFile(null);
        setRows([]);
        setResult(null);
        if (inputRef.current) inputRef.current.value = '';
    }, []);

    const handleUpload = useCallback(async () => {
        if (!rows.length) return;
        setUploading(true);
        try {
            const res = await uploadNotasEmbarque(rows);
            setResult(res);
            if (res.inserted > 0) {
                toast.success(res.message);
                setFile(null);
                setRows([]);
                if (inputRef.current) inputRef.current.value = '';
                await fetchCurrentUpload();
            } else {
                toast.error(res.message || t('logisticaPainel.errorUpload', 'Nenhuma nota importada. Verifique o arquivo.'));
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('Upload error:', err);
            toast.error(msg || t('logisticaPainel.errorUpload', 'Erro ao processar upload.'));
        } finally {
            setUploading(false);
        }
    }, [rows, t, fetchCurrentUpload]);

    const handleDelete = useCallback(async () => {
        if (!currentUpload) return;
        if (!confirm(t('logisticaPainel.confirmDelete', 'Tem certeza que deseja remover o upload atual?'))) return;
        setDeleting(true);
        try {
            await deleteNotasEmbarque(currentUpload.uploadId);
            toast.success(t('logisticaPainel.deleteSuccess', 'Upload removido com sucesso.'));
            setCurrentUpload(null);
            setResult(null);
        } catch {
            toast.error(t('logisticaPainel.deleteError', 'Erro ao remover upload.'));
        } finally {
            setDeleting(false);
        }
    }, [currentUpload, t]);

    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const previewCols = rows.length > 0 ? Object.keys(rows[0]).slice(0, 6) : [];
    const previewRows = rows.slice(0, 8);

    return (
        <>
            <PageHeader
                title={t('logisticaPainel.upload.title', 'Upload de Notas de Embarque')}
                subtitle={t('logisticaPainel.upload.subtitle', 'Importe o arquivo Excel ou CSV exportado do sistema')}
            />

            <div className={styles.container}>
                {/* Dropzone */}
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
                            {t('logisticaPainel.upload.dropzone', 'Arraste o arquivo aqui, ou clique para selecionar')}
                        </p>
                        <p className={styles.dropzoneHint}>
                            {t('logisticaPainel.upload.dropzoneHint', 'Formatos suportados: .xlsx, .xls, .csv')}
                        </p>
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                        />
                    </div>
                )}

                {/* File info */}
                {file && (
                    <div className={styles.fileInfo}>
                        <FiFileText className={styles.fileIcon} />
                        <span className={styles.fileName}>{file.name}</span>
                        <span className={styles.fileSize}>{formatBytes(file.size)}</span>
                        <span className={styles.rowCount}>
                            {rows.length} {t('logisticaPainel.rows', 'notas')}
                        </span>
                        <button className={styles.removeBtn} onClick={handleClear} title={t('common.cancel', 'Cancelar')}>
                            <FiX />
                        </button>
                    </div>
                )}

                {/* Preview table */}
                {rows.length > 0 && !result && (
                    <div className={styles.previewSection}>
                        <h3 className={styles.previewTitle}>
                            {t('logisticaPainel.upload.preview', 'Pré-visualização')} ({rows.length} {t('logisticaPainel.rows', 'linhas')})
                        </h3>
                        <div className={styles.previewTableWrapper}>
                            <table className={styles.previewTable}>
                                <thead>
                                    <tr>
                                        {previewCols.map(col => <th key={col}>{col}</th>)}
                                        {Object.keys(rows[0]).length > 6 && <th>…</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((row, i) => (
                                        <tr key={i}>
                                            {previewCols.map(col => (
                                                <td key={col}>{String(row[col] ?? '')}</td>
                                            ))}
                                            {Object.keys(rows[0]).length > 6 && <td>…</td>}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className={styles.actions}>
                            <button
                                className={styles.uploadBtn}
                                onClick={handleUpload}
                                disabled={uploading}
                            >
                                {uploading ? (
                                    <>
                                        <span className={styles.spinner} />
                                        {t('logisticaPainel.uploading', 'Processando...')}
                                    </>
                                ) : (
                                    <>
                                        <FiUploadCloud />
                                        {t('logisticaPainel.upload.confirm', 'Confirmar Upload')}
                                    </>
                                )}
                            </button>
                            <button className={styles.cancelBtn} onClick={handleClear} disabled={uploading}>
                                {t('common.cancel', 'Cancelar')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Result */}
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
                                {result.errors.slice(0, 10).map((e, i) => (
                                    <li key={i}>
                                        {t('logisticaPainel.upload.lineError', 'Linha')} {e.linha}: {e.erro}
                                    </li>
                                ))}
                                {result.errors.length > 10 && (
                                    <li>...{result.errors.length - 10} {t('logisticaPainel.upload.moreErrors', 'mais erros')}</li>
                                )}
                            </ul>
                        )}
                        {result.inserted === 0 && result.errors.length > 0 && (
                            <p className={styles.colHint}>
                                {t('logisticaPainel.upload.colHint', 'Colunas esperadas: Ordem de venda, Nota fiscal, Nome do cliente, Valor NET, Peso bruto, Dias em atraso, Data…')}
                            </p>
                        )}
                        {result.inserted > 0 && (
                            <div className={styles.resultActions}>
                                <button className={styles.viewPainelBtn} onClick={() => navigate('/logistica/painel')}>
                                    {t('logisticaPainel.upload.viewPainel', 'Ver painel')}
                                </button>
                                <button className={styles.cancelBtn} onClick={handleClear}>
                                    {t('logisticaPainel.upload.newUpload', 'Novo upload')}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Histórico */}
            <div className={styles.container} style={{ marginTop: 0 }}>
                <div className={styles.historyHeader}>
                    <div className={styles.historyTitle}>
                        <FiClock />
                        <span>{t('logisticaPainel.upload.history', 'Histórico de Uploads')}</span>
                        {currentUpload && (
                            <span className={styles.badge}>1 {t('logisticaPainel.upload.file', 'arquivo')}</span>
                        )}
                    </div>
                </div>

                {loadingHistory ? (
                    <p style={{ color: '#64748b' }}>{t('common.loading', 'Carregando...')}</p>
                ) : !currentUpload ? (
                    <p style={{ color: '#64748b' }}>{t('logisticaPainel.upload.noUploads', 'Nenhum upload encontrado.')}</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className={styles.previewTable}>
                            <thead>
                                <tr>
                                    <th>{t('logisticaPainel.upload.linesCount', 'Notas')}</th>
                                    <th>{t('logisticaPainel.upload.uploadedAt', 'Enviado em')}</th>
                                    <th>{t('logisticaPainel.upload.uploadedBy', 'Enviado por')}</th>
                                    <th>{t('logisticaPainel.upload.status', 'Status')}</th>
                                    <th>{t('common.actions', 'Ações')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>{currentUpload.totalRows}</td>
                                    <td>{formatDateTimeShort(currentUpload.uploadedAt)}</td>
                                    <td>{currentUpload.uploaderName || '—'}</td>
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
                                            title={t('logisticaPainel.upload.deleteUpload', 'Remover upload')}
                                        >
                                            <FiTrash2 />
                                            {deleting
                                                ? t('common.deleting', 'Removendo...')
                                                : t('common.delete', 'Remover')}
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
