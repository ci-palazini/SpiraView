// src/features/planejamento/pages/CapacidadeUploadPage.tsx
import { useState, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { FiUploadCloud, FiFileText, FiX, FiCheck, FiAlertTriangle, FiClock } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

import PageHeader from '../../../shared/components/PageHeader';
import { uploadCapacidade, listarUploadsCapacidade, type CapacidadeUpload, type CapacidadeUploadResult } from '../../../services/apiClient';
import { formatDateTime } from '../../../shared/utils/dateUtils';
import styles from './CapacidadeUploadPage.module.css';

interface User {
    role?: string;
    email?: string;
}

interface CapacidadeUploadPageProps {
    user: User;
}

export default function CapacidadeUploadPage({ user }: CapacidadeUploadPageProps) {
    const { t } = useTranslation();
    const [file, setFile] = useState<File | null>(null);
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<CapacidadeUploadResult | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Histórico de uploads
    const [uploads, setUploads] = useState<CapacidadeUpload[]>([]);
    const [loadingUploads, setLoadingUploads] = useState(true);

    const fetchUploads = useCallback(async () => {
        try {
            setLoadingUploads(true);
            const data = await listarUploadsCapacidade({ role: user.role, email: user.email });
            setUploads(data);
        } catch (err) {
            console.error('Erro ao buscar uploads:', err);
        } finally {
            setLoadingUploads(false);
        }
    }, [user]);

    useEffect(() => {
        fetchUploads();
    }, [fetchUploads]);

    const processFile = useCallback((f: File) => {
        setFile(f);
        setResult(null);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
                setRows(json);
                toast.success(t('planejamento.upload.fileLoaded', `Arquivo carregado: ${json.length} linhas`));
            } catch (err) {
                console.error(err);
                toast.error(t('planejamento.upload.readError', 'Erro ao ler arquivo Excel'));
                setFile(null);
                setRows([]);
            }
        };
        reader.readAsArrayBuffer(f);
    }, [t]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files[0];
        if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) {
            processFile(f);
        } else {
            toast.error(t('planejamento.upload.invalidFormat', 'Envie um arquivo .xlsx ou .xls'));
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

    const handleRemoveFile = useCallback(() => {
        setFile(null);
        setRows([]);
        setResult(null);
        if (inputRef.current) inputRef.current.value = '';
    }, []);

    const handleUpload = useCallback(async () => {
        if (!rows.length) return;

        setUploading(true);
        setResult(null);

        try {
            const res = await uploadCapacidade(rows, file?.name || 'upload.xlsx', {
                role: user.role,
                email: user.email,
            });
            setResult(res);

            if (res.resumo.linhasComErro === 0) {
                toast.success(t('planejamento.upload.success', `Upload concluído! ${res.resumo.linhasValidas} linhas processadas.`));
            } else {
                toast.success(t('planejamento.upload.partial', `Upload parcial: ${res.resumo.linhasValidas} linhas OK, ${res.resumo.linhasComErro} com erro.`));
            }

            // Limpar arquivo
            setFile(null);
            setRows([]);
            if (inputRef.current) inputRef.current.value = '';

            // Atualizar histórico
            fetchUploads();
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao fazer upload';
            toast.error(errorMessage);
        } finally {
            setUploading(false);
        }
    }, [rows, file, user, fetchUploads, t]);

    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const previewRows = rows.slice(0, 5);
    const columns = previewRows.length > 0 ? Object.keys(previewRows[0]).slice(0, 8) : []; // Limitar colunas

    return (
        <>
            <PageHeader
                title={t('planejamento.upload.title', 'Upload de Capacidade')}
                subtitle={t('planejamento.upload.subtitle', 'Importe reservas de capacidade a partir de um arquivo Excel.')}
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
                            {t('planejamento.upload.dropzoneText', 'Arraste um arquivo Excel aqui ou clique para selecionar')}
                        </p>
                        <p className={styles.dropzoneHint}>
                            {t('planejamento.upload.dropzoneHint', 'Formatos aceitos: .xlsx, .xls')}
                        </p>
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            style={{ display: 'none' }}
                            onChange={handleFileSelect}
                        />
                    </div>
                )}

                {/* File info */}
                {file && (
                    <div className={styles.fileInfo}>
                        <FiFileText className={styles.fileIcon} />
                        <span className={styles.fileName}>{file.name}</span>
                        <span className={styles.fileSize}>{formatBytes(file.size)}</span>
                        <button className={styles.removeBtn} onClick={handleRemoveFile} title={t('common.delete', 'Remover')}>
                            <FiX />
                        </button>
                    </div>
                )}

                {/* Preview */}
                {rows.length > 0 && (
                    <div className={styles.previewSection}>
                        <h3 className={styles.previewTitle}>
                            {t('planejamento.upload.preview', 'Pré-visualização')} ({rows.length} {t('planejamento.upload.lines', 'linhas')})
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table className={styles.previewTable}>
                                <thead>
                                    <tr>
                                        {columns.map((col) => (
                                            <th key={col}>{col}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((row, i) => (
                                        <tr key={i}>
                                            {columns.map((col) => (
                                                <td key={col}>{String(row[col] ?? '')}</td>
                                            ))}
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
                                        {t('common.processing', 'Enviando...')}
                                    </>
                                ) : (
                                    <>
                                        <FiUploadCloud />
                                        {t('planejamento.upload.sendBtn', 'Enviar')} {rows.length} {t('planejamento.upload.lines', 'linhas')}
                                    </>
                                )}
                            </button>
                            <button className={styles.cancelBtn} onClick={handleRemoveFile}>
                                {t('common.cancel', 'Cancelar')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Result */}
                {result && (
                    <div className={`${styles.resultCard} ${result.resumo.linhasComErro === 0 ? styles.resultSuccess : styles.resultError}`}>
                        <div className={styles.resultHeader}>
                            <h3 className={styles.resultTitle}>
                                {result.resumo.linhasComErro === 0 ? (
                                    <><FiCheck style={{ verticalAlign: 'middle', marginRight: 8 }} />{t('planejamento.upload.successTitle', 'Upload concluído com sucesso!')}</>
                                ) : (
                                    <><FiAlertTriangle style={{ verticalAlign: 'middle', marginRight: 8 }} />{t('planejamento.upload.errorTitle', 'Upload concluído com erros')}</>
                                )}
                            </h3>
                            <button className={styles.closeBtn} onClick={() => setResult(null)} title={t('common.close', 'Fechar')}>
                                <FiX />
                            </button>
                        </div>
                        <ul className={styles.resultList}>
                            <li><strong>{t('planejamento.upload.totalLines', 'Total de linhas')}:</strong> {result.resumo.totalLinhas}</li>
                            <li><strong>{t('planejamento.upload.validLines', 'Linhas válidas')}:</strong> {result.resumo.linhasValidas}</li>
                            <li><strong>{t('planejamento.upload.errorLines', 'Linhas com erro')}:</strong> {result.resumo.linhasComErro}</li>
                        </ul>

                        {result.erros.length > 0 && (
                            <div className={styles.errorList}>
                                {result.erros.map((err, i) => (
                                    <div key={i} className={styles.errorRow}>
                                        <span className={styles.errorLinha}>{t('planejamento.upload.line', 'Linha')} {err.linha}</span>
                                        <span className={styles.errorMsg}>{err.erro}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Histórico de uploads */}
            <div className={styles.container} style={{ marginTop: 0 }}>
                <div className={styles.historyHeader}>
                    <div className={styles.historyTitle}>
                        <FiClock />
                        <span>{t('planejamento.upload.history', 'Histórico de Uploads')}</span>
                        <span className={styles.badge}>{uploads.length} {t('planejamento.upload.files', 'arquivo(s)')}</span>
                    </div>
                </div>

                {loadingUploads ? (
                    <p style={{ color: '#64748b' }}>{t('common.loading', 'Carregando...')}</p>
                ) : uploads.length === 0 ? (
                    <p style={{ color: '#64748b' }}>{t('planejamento.upload.noUploads', 'Nenhum upload encontrado.')}</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className={styles.previewTable}>
                            <thead>
                                <tr>
                                    <th>{t('planejamento.upload.fileName', 'Arquivo')}</th>
                                    <th>{t('planejamento.upload.linesCount', 'Linhas')}</th>
                                    <th>{t('planejamento.upload.uploadedAt', 'Enviado em')}</th>
                                    <th>{t('planejamento.upload.uploadedBy', 'Enviado por')}</th>
                                    <th>{t('planejamento.upload.status', 'Status')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {uploads.map((u, index) => (
                                    <tr key={u.id}>
                                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {u.nomeArquivo}
                                        </td>
                                        <td>{u.linhasSucesso}/{u.linhasTotal}</td>
                                        <td>{formatDateTime(u.criadoEm)}</td>
                                        <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {(u as any).uploadPorNome || '—'}
                                        </td>
                                        <td>
                                            {index === 0 ? (
                                                <span style={{ color: '#16a34a', fontWeight: 500 }}>{t('common.active', 'Ativo')}</span>
                                            ) : (
                                                <span style={{ color: '#94a3b8' }}>{t('planejamento.upload.historyOnly', 'Histórico')}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}
