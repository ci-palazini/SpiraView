// src/features/configuracoes/pages/SafetyUploadPage.tsx
import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiUploadCloud, FiFile, FiCheck, FiAlertCircle, FiTrash2, FiX } from 'react-icons/fi';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import PageHeader from '../../../shared/components/PageHeader';
import { http } from '../../../services/apiClient';
import { formatDateTime } from '../../../shared/utils/dateUtils';
import type { User } from '../../../App';
import styles from './SafetyUploadPage.module.css';

interface UploadResumo {
    totalLinhasCsv: number;
    registrosUnicos: number;
    novos: number;
    atualizados: number;
}

interface UploadHistory {
    id: string;
    nome_arquivo: string;
    total_linhas: number;
    registros_novos: number;
    registros_atualizados: number;
    criado_em: string;
    enviado_por: string | null;
}

interface SafetyUploadPageProps {
    user: User;
}

export default function SafetyUploadPage({ user }: SafetyUploadPageProps) {
    const { t } = useTranslation();
    const inputRef = useRef<HTMLInputElement>(null);

    const [file, setFile] = useState<File | null>(null);
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; resumo: UploadResumo } | null>(null);
    const [history, setHistory] = useState<UploadHistory[]>([]);

    const fetchHistory = useCallback(async () => {
        try {
            const data = await http.get<UploadHistory[]>('/safety/uploads');
            setHistory(data);
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const processFile = useCallback((f: File) => {
        setFile(f);
        setResult(null);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
                    defval: '',
                    raw: false,
                });
                setRows(json);
            } catch {
                toast.error(t('safety_upload.parse_error'));
                setRows([]);
            }
        };
        reader.readAsArrayBuffer(f);
    }, [t]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files[0];
        if (f && /\.(csv|xlsx|xls)$/i.test(f.name)) {
            processFile(f);
        } else {
            toast.error(t('safety_upload.invalid_file'));
        }
    }, [processFile, t]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) processFile(f);
    }, [processFile]);

    const handleUpload = useCallback(async () => {
        if (!rows.length) return;
        setUploading(true);
        try {
            const res = await http.post<{ ok: boolean; resumo: UploadResumo }>('/safety/upload', {
                data: { nomeArquivo: file?.name || 'upload.csv', inputRows: rows },
            });
            setResult(res);
            
            if (res.ok) {
                toast.success(t('safety_upload.success'));
                setFile(null);
                setRows([]);
                if (inputRef.current) inputRef.current.value = '';
                fetchHistory();
            }
        } catch (err: any) {
            toast.error(err?.message || t('safety_upload.upload_error'));
        } finally {
            setUploading(false);
        }
    }, [rows, file, t, fetchHistory]);

    const handleClear = useCallback(() => {
        setFile(null);
        setRows([]);
        setResult(null);
        if (inputRef.current) inputRef.current.value = '';
    }, []);

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
                title={t('safety_upload.title')}
                subtitle={t('safety_upload.subtitle')}
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
                            {t('safety_upload.dropzone')}
                        </p>
                        <p className={styles.dropzoneHint}>
                            {t('safety_upload.dropzone_hint')}
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
                        <FiFile className={styles.fileIcon} />
                        <span className={styles.fileName}>{file.name}</span>
                        <span className={styles.fileSize}>{formatBytes(file.size)}</span>
                        <button className={styles.removeBtn} onClick={handleClear} title={t('common.cancel')}>
                            <FiX />
                        </button>
                    </div>
                )}

                {/* Preview table */}
                {rows.length > 0 && !result && (
                    <div className={styles.previewSection}>
                        <h3 className={styles.previewTitle}>
                            {t('safety_upload.preview_title')} ({rows.length} {t('safety_upload.rows')})
                        </h3>
                        <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                            <table className={styles.previewTable}>
                                <thead>
                                    <tr>
                                        {previewCols.map((col) => (
                                            <th key={col}>{col}</th>
                                        ))}
                                        {Object.keys(rows[0]).length > 6 && <th>...</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((row, i) => (
                                        <tr key={i}>
                                            {previewCols.map((col) => (
                                                <td key={col}>{String(row[col] ?? '')}</td>
                                            ))}
                                            {Object.keys(rows[0]).length > 6 && <td>...</td>}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Actions */}
                        <div className={styles.actions}>
                            <button
                                className={styles.uploadBtn}
                                onClick={handleUpload}
                                disabled={uploading}
                            >
                                {uploading ? (
                                    <>
                                        <span className={styles.spinner}></span>
                                        {t('safety_upload.sending')}
                                    </>
                                ) : (
                                    <>
                                        <FiUploadCloud />
                                        {t('safety_upload.send')}
                                    </>
                                )}
                            </button>
                            <button
                                className={styles.cancelBtn}
                                onClick={handleClear}
                                disabled={uploading}
                            >
                                {t('common.cancel')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Success result */}
                {result?.ok && (
                    <div className={`${styles.resultCard} ${styles.resultCardSuccess}`}>
                        <div className={styles.resultHeader}>
                            <FiCheck size={24} />
                            <strong className={styles.resultTitle}>
                                {t('safety_upload.success')}
                            </strong>
                        </div>
                        <div className={styles.resultStats}>
                            <div className={styles.resultStat}>
                                <p className={styles.resultStatValue}>
                                    {result.resumo.registrosUnicos}
                                </p>
                                <p className={styles.resultStatLabel}>{t('safety_upload.result_unique')}</p>
                            </div>
                            <div className={styles.resultStat}>
                                <p className={`${styles.resultStatValue} ${styles.resultStatValueSuccess}`}>
                                    {result.resumo.novos}
                                </p>
                                <p className={styles.resultStatLabel}>{t('safety_upload.result_created')}</p>
                            </div>
                            <div className={styles.resultStat}>
                                <p className={`${styles.resultStatValue} ${styles.resultStatValueWarning}`}>
                                    {result.resumo.atualizados}
                                </p>
                                <p className={styles.resultStatLabel}>{t('safety_upload.result_updated')}</p>
                            </div>
                            <div className={styles.resultStat}>
                                <p className={styles.resultStatValue}>
                                    {result.resumo.totalLinhasCsv}
                                </p>
                                <p className={styles.resultStatLabel}>{t('safety_upload.result_csv_lines')}</p>
                            </div>
                        </div>
                        <button className={styles.newUploadBtn} onClick={handleClear}>
                            {t('safety_upload.new_upload')}
                        </button>
                    </div>
                )}

                {/* Upload history */}
                {history.length > 0 && (
                    <div className={styles.historySection}>
                        <h3 className={styles.historyTitle}>
                            {t('safety_upload.history_title')}
                        </h3>
                        <table className={styles.historyTable}>
                            <thead>
                                <tr>
                                    <th>{t('safety_upload.history_file')}</th>
                                    <th style={{ textAlign: 'center' }}>{t('safety_upload.history_created')}</th>
                                    <th style={{ textAlign: 'center' }}>{t('safety_upload.history_updated')}</th>
                                    <th>{t('safety_upload.history_uploaded_by')}</th>
                                    <th>{t('safety_upload.history_date')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((h) => (
                                    <tr key={h.id}>
                                        <td>{h.nome_arquivo}</td>
                                        <td style={{ textAlign: 'center' }} className={styles.statNew}>
                                            {h.registros_novos}
                                        </td>
                                        <td style={{ textAlign: 'center' }} className={styles.statUpdated}>
                                            {h.registros_atualizados}
                                        </td>
                                        <td>{h.enviado_por || '—'}</td>
                                        <td>{formatDateTime(h.criado_em)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {history.length === 0 && !file && (
                    <div className={styles.emptyState}>
                        {t('safety_upload.history_empty')}
                    </div>
                )}
            </div>
        </>
    );
}
