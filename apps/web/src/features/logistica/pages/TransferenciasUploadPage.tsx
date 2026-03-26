// src/features/logistica/pages/TransferenciasUploadPage.tsx
import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    FiUploadCloud, FiFileText, FiCheck, FiAlertCircle,
    FiX, FiTrash2, FiClock,
} from 'react-icons/fi';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import PageHeader from '../../../shared/components/PageHeader';
import { formatDateTime } from '../../../shared/utils/dateUtils';
import {
    uploadTransferencias,
    getTransferenciasUploads,
    deleteTransferenciasUpload,
} from '../../../services/apiClient';
import type { LogisticaTransferenciaUpload, TransferenciasUploadResult } from '@spiraview/shared';
import styles from './TransferenciasUploadPage.module.css';

function toISO(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function formatDateBR(iso: string): string {
    try {
        const dateOnly = iso.includes('T') ? iso.split('T')[0] : iso;
        const [y, m, d] = dateOnly.split('-');
        return `${d}/${m}/${y}`;
    } catch {
        return iso;
    }
}

export default function TransferenciasUploadPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);

    const [file, setFile] = useState<File | null>(null);
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<TransferenciasUploadResult | null>(null);

    const [uploads, setUploads] = useState<LogisticaTransferenciaUpload[]>([]);
    const [loadingUploads, setLoadingUploads] = useState(true);
    const [dataFiltro, setDataFiltro] = useState<string>(() => toISO(new Date()));
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fetchUploads = useCallback(async (dataRef?: string) => {
        setLoadingUploads(true);
        try {
            const data = await getTransferenciasUploads(dataRef);
            setUploads(data.items || []);
        } catch {
            // ignore
        } finally {
            setLoadingUploads(false);
        }
    }, []);

    useEffect(() => {
        fetchUploads(dataFiltro);
    }, [fetchUploads, dataFiltro]);

    const processFile = useCallback((f: File) => {
        if (!f.name.match(/\.(csv|xlsx|xls)$/i)) {
            toast.error(t('logisticaTransferencias.errorNotFile', 'Por favor, selecione um arquivo Excel ou CSV.'));
            return;
        }
        setFile(f);
        setResult(null);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                // FS: ';' handles ERP exports that use semicolon as delimiter (ignored for xlsx/xls)
                const workbook = XLSX.read(data, { type: 'array', FS: ';' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
                const normalized = json.map(row => {
                    const newRow: Record<string, unknown> = {};
                    for (const key in row) newRow[key.trim()] = row[key];
                    return newRow;
                });
                setRows(normalized);
                toast.success(`Arquivo carregado: ${normalized.length} linhas`);
            } catch {
                toast.error(t('logisticaTransferencias.errorRead', 'Erro ao ler arquivo.'));
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
            const res = await uploadTransferencias(rows, file.name);
            setResult(res);
            if (res.inserted > 0) {
                toast.success(res.message);
                setFile(null);
                setRows([]);
                if (inputRef.current) inputRef.current.value = '';
                // Refresh using last date processed
                const lastDate = res.datasProcessadas.at(-1) || dataFiltro;
                setDataFiltro(lastDate);
                fetchUploads(lastDate);
            } else {
                toast.error(res.message || t('logisticaTransferencias.errorUpload', 'Nenhuma movimentação importada.'));
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(msg || t('logisticaTransferencias.errorUpload', 'Erro ao processar upload.'));
        } finally {
            setUploading(false);
        }
    }, [rows, file, t, dataFiltro, fetchUploads]);

    const handleDelete = useCallback(async (upload: LogisticaTransferenciaUpload) => {
        if (!confirm(t('logisticaTransferencias.confirmDelete', 'Tem certeza que deseja remover este upload?'))) return;
        setDeletingId(upload.id);
        try {
            await deleteTransferenciasUpload(upload.id);
            toast.success(t('logisticaTransferencias.deleteSuccess', 'Upload removido com sucesso.'));
            fetchUploads(dataFiltro);
        } catch {
            toast.error(t('logisticaTransferencias.deleteError', 'Erro ao remover upload.'));
        } finally {
            setDeletingId(null);
        }
    }, [t, dataFiltro, fetchUploads]);

    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const previewCols = rows.length > 0 ? Object.keys(rows[0]).slice(0, 6) : [];
    const previewRows = rows.slice(0, 3);

    return (
        <>
            <PageHeader
                title={t('logisticaTransferencias.upload.title', 'Upload de Transferências')}
                subtitle={t('logisticaTransferencias.upload.subtitle', 'Importe o relatório de movimentações exportado do ERP')}
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
                            {t('logisticaTransferencias.upload.dropzone', 'Arraste o arquivo aqui, ou clique para selecionar')}
                        </p>
                        <p className={styles.dropzoneHint}>
                            {t('logisticaTransferencias.upload.hint', 'Formatos suportados: .xlsx, .xls, .csv (separador ";")')}
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
                        <button className={styles.removeBtn} onClick={handleClear} title={t('common.cancel', 'Cancelar')}>
                            <FiX />
                        </button>
                    </div>
                )}

                {/* Preview */}
                {rows.length > 0 && !result && (
                    <div className={styles.previewSection}>
                        <h3 className={styles.previewTitle}>
                            Pré-visualização ({rows.length} linhas, mostrando {previewRows.length})
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
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
                            <button className={styles.uploadBtn} onClick={handleUpload} disabled={uploading}>
                                {uploading ? (
                                    <><span className={styles.spinner} />Enviando...</>
                                ) : (
                                    <><FiUploadCloud />Enviar {rows.length} linhas</>
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
                    <div className={`${styles.resultCard} ${result.inserted > 0 ? styles.resultSuccess : styles.resultError}`}>
                        <div className={styles.resultHeader}>
                            <h3 className={styles.resultTitle}>
                                {result.inserted > 0
                                    ? <><FiCheck style={{ verticalAlign: 'middle', marginRight: 8 }} />Upload concluído com sucesso!</>
                                    : <><FiAlertCircle style={{ verticalAlign: 'middle', marginRight: 8 }} />Nenhuma movimentação importada</>
                                }
                            </h3>
                            <button className={styles.closeBtn} onClick={() => setResult(null)}><FiX /></button>
                        </div>

                        <ul className={styles.resultList}>
                            <li><strong>Movimentações importadas:</strong> {result.inserted}</li>
                            <li><strong>Erros:</strong> {result.errors.length}</li>
                            {result.datasProcessadas.length > 0 && (
                                <li>
                                    <strong>Dias processados:</strong>{' '}
                                    {result.datasProcessadas.map(d => formatDateBR(d)).join(', ')}
                                </li>
                            )}
                        </ul>

                        {result.errors.length > 0 && (
                            <div className={styles.errorList}>
                                {result.errors.slice(0, 10).map((e, i) => (
                                    <div key={i} className={styles.errorRow}>
                                        <span className={styles.errorLinha}>Linha {e.linha}</span>
                                        <span className={styles.errorMsg}>{e.erro}</span>
                                    </div>
                                ))}
                                {result.errors.length > 10 && (
                                    <div className={styles.errorRow}>
                                        <span className={styles.errorMsg}>...{result.errors.length - 10} mais erros</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {result.inserted > 0 && (
                            <div className={styles.actions} style={{ marginTop: 12 }}>
                                <button className={styles.uploadBtn} onClick={() => navigate('/logistica/transferencias')}>
                                    Ver análise
                                </button>
                                <button className={styles.cancelBtn} onClick={handleClear}>
                                    Novo upload
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
                        <span>Uploads do Dia</span>
                        <span className={styles.badge}>
                            {uploads.length} arquivo{uploads.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <input
                        type="date"
                        className={styles.dateInput}
                        value={dataFiltro}
                        onChange={e => setDataFiltro(e.target.value)}
                    />
                </div>

                {loadingUploads ? (
                    <p style={{ color: '#64748b' }}>Carregando...</p>
                ) : uploads.length === 0 ? (
                    <p style={{ color: '#64748b' }}>
                        Nenhum upload encontrado para {formatDateBR(dataFiltro)}.
                    </p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className={styles.previewTable}>
                            <thead>
                                <tr>
                                    <th>Arquivo</th>
                                    <th>Datas cobertas</th>
                                    <th>Movimentações</th>
                                    <th>Enviado por</th>
                                    <th>Enviado em</th>
                                    <th>Status</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {uploads.map(u => (
                                    <tr key={u.id}>
                                        <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {u.nomeArquivo}
                                        </td>
                                        <td>
                                            <div className={styles.datePills}>
                                                {(u.datasProcessadas || []).map(d => (
                                                    <span key={d} className={`${styles.datePill} ${d === dataFiltro ? styles.datePillActive : ''}`}>
                                                        {formatDateBR(d)}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td>{u.linhasSucesso}</td>
                                        <td>{u.uploadPorNome || '—'}</td>
                                        <td>{formatDateTime(u.criadoEm)}</td>
                                        <td>
                                            <span style={{ color: '#16a34a', fontWeight: 500 }}>Ativo</span>
                                        </td>
                                        <td>
                                            <button
                                                className={styles.deleteRowBtn}
                                                onClick={() => handleDelete(u)}
                                                disabled={deletingId === u.id}
                                                title="Remover upload"
                                            >
                                                <FiTrash2 />
                                                {deletingId === u.id ? 'Removendo...' : 'Remover'}
                                            </button>
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
