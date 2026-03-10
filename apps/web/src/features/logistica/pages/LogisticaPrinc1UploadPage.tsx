import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FiUploadCloud, FiFileText, FiCheck, FiAlertCircle, FiX, FiTrash2, FiClock } from 'react-icons/fi';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import PageHeader from '../../../shared/components/PageHeader';
import { formatDateTimeShort } from '../../../shared/utils/dateUtils';
import {
    uploadPrinc1,
    getPrinc1,
    deletePrinc1,
    type Princ1Response,
    type Princ1UploadResult,
} from '../../../services/apiClient';
import styles from './PainelUploadPage.module.css'; // Reusing standard Logistics upload css

export default function LogisticaPrinc1UploadPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);

    const [file, setFile] = useState<File | null>(null);
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [result, setResult] = useState<Princ1UploadResult | null>(null);
    const [currentUpload, setCurrentUpload] = useState<Princ1Response['uploadInfo']>(null);
    const [loadingHistory, setLoadingHistory] = useState(true);

    const fetchCurrentUpload = useCallback(async () => {
        setLoadingHistory(true);
        try {
            const data = await getPrinc1();
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
            toast.error(t('logisticaPrinc1.upload.errorNotExcel', 'Por favor, selecione um arquivo Excel ou CSV.'));
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
                const normalized = json.map(row => {
                    const newRow: Record<string, unknown> = {};
                    for (const key in row) newRow[key.trim()] = row[key];
                    return newRow;
                });
                setRows(normalized);
            } catch {
                toast.error(t('logisticaPrinc1.upload.errorRead', 'Erro ao ler arquivo.'));
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
        if (!rows.length || !file) return;
        setUploading(true);
        try {
            const res = await uploadPrinc1(rows, file.name);
            setResult(res);
            if (res.inserted > 0) {
                toast.success(res.message);
                setFile(null);
                setRows([]);
                if (inputRef.current) inputRef.current.value = '';
                await fetchCurrentUpload();
            } else {
                toast.error(res.message || t('logisticaPrinc1.upload.errorUpload', 'Nenhum dado importado. Verifique o arquivo.'));
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('Upload error:', err);
            toast.error(msg || t('logisticaPrinc1.upload.errorUpload', 'Erro ao processar upload.'));
        } finally {
            setUploading(false);
        }
    }, [rows, file, t, fetchCurrentUpload]);

    const handleDelete = useCallback(async () => {
        if (!currentUpload) return;
        if (!confirm(t('logisticaPrinc1.upload.confirmDelete', 'Tem certeza que deseja remover este upload do Princ 1?'))) return;
        setDeleting(true);
        try {
            await deletePrinc1(currentUpload.uploadId);
            toast.success(t('logisticaPrinc1.upload.deleteSuccess', 'Upload removido com sucesso.'));
            setCurrentUpload(null);
            setResult(null);
        } catch {
            toast.error(t('logisticaPrinc1.upload.deleteError', 'Erro ao remover upload.'));
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
                title={t('logisticaPrinc1.upload.title', 'Upload - Princ. 1')}
                subtitle={t('logisticaPrinc1.upload.subtitle', 'Importe o arquivo Excel/CSV de controle do Princ. 1')}
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
                            {t('logisticaPrinc1.upload.dropzone', 'Arraste o arquivo aqui, ou clique para selecionar')}
                        </p>
                        <p className={styles.dropzoneHint}>
                            {t('logisticaPrinc1.upload.dropzoneHint', 'Formatos suportados: .xlsx, .xls, .csv')}
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

                {file && (
                    <div className={styles.fileInfo}>
                        <FiFileText className={styles.fileIcon} />
                        <span className={styles.fileName}>{file.name}</span>
                        <span className={styles.fileSize}>{formatBytes(file.size)}</span>
                        <span className={styles.rowCount}>
                            {rows.length} {t('logisticaPrinc1.rows', 'registros')}
                        </span>
                        <button className={styles.removeBtn} onClick={handleClear} title={t('common.cancel', 'Cancelar')}>
                            <FiX />
                        </button>
                    </div>
                )}

                {rows.length > 0 && !result && (
                    <div className={styles.previewSection}>
                        <h3 className={styles.previewTitle}>
                            {t('logisticaPrinc1.upload.preview', 'Pré-visualização')} ({rows.length} {t('logisticaPrinc1.rows', 'linhas')})
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
                                        {t('logisticaPrinc1.uploading', 'Processando...')}
                                    </>
                                ) : (
                                    <>
                                        <FiUploadCloud />
                                        {t('logisticaPrinc1.upload.confirm', 'Confirmar Upload')}
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
                                {result.errors.slice(0, 10).map((e, i) => (
                                    <li key={i}>
                                        {t('logisticaPrinc1.upload.lineError', 'Linha')} {e.linha}: {e.erro}
                                    </li>
                                ))}
                                {result.errors.length > 10 && (
                                    <li>...{result.errors.length - 10} {t('logisticaPrinc1.upload.moreErrors', 'mais erros')}</li>
                                )}
                            </ul>
                        )}
                        {result.inserted === 0 && result.errors.length > 0 && (
                            <p className={styles.colHint}>
                                {t('logisticaPrinc1.upload.colHint', 'Colunas esperadas: Nº do item, Nome do item, Data de entrada...')}
                            </p>
                        )}
                        {result.inserted > 0 && (
                            <div className={styles.resultActions}>
                                <button className={styles.viewPainelBtn} onClick={() => navigate('/logistica/princ1/dashboard')}>
                                    {t('logisticaPrinc1.upload.viewPainel', 'Ver painel Princ. 1')}
                                </button>
                                <button className={styles.cancelBtn} onClick={handleClear}>
                                    {t('logisticaPrinc1.upload.newUpload', 'Novo upload')}
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
                        <span>{t('logisticaPrinc1.upload.history', 'Último Upload Ativo')}</span>
                    </div>
                </div>

                {loadingHistory ? (
                    <p style={{ color: '#64748b' }}>{t('common.loading', 'Carregando...')}</p>
                ) : !currentUpload ? (
                    <p style={{ color: '#64748b' }}>{t('logisticaPrinc1.upload.noUploads', 'Nenhum upload encontrado.')}</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className={styles.previewTable}>
                            <thead>
                                <tr>
                                    <th>{t('logisticaPrinc1.upload.linesCount', 'Registros')}</th>
                                    <th>{t('logisticaPrinc1.upload.uploadedAt', 'Enviado em')}</th>
                                    <th>{t('logisticaPrinc1.upload.uploadedBy', 'Enviado por')}</th>
                                    <th>{t('logisticaPrinc1.upload.status', 'Status')}</th>
                                    <th>{t('common.actions', 'Ações')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>{currentUpload.totalRows}</td>
                                    <td>{formatDateTimeShort(currentUpload.criadoEm)}</td>
                                    <td>{currentUpload.uploadPorEmail || '—'}</td>
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
                                            title={t('logisticaPrinc1.upload.deleteUpload', 'Remover upload')}
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
