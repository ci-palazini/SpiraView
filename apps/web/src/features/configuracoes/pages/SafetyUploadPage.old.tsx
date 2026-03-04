// src/features/configuracoes/pages/SafetyUploadPage.tsx
import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiUploadCloud, FiFile, FiCheck, FiAlertCircle, FiTrash2 } from 'react-icons/fi';
import * as XLSX from 'xlsx';
import { http } from '../../../services/apiClient';
import type { User } from '../../../App';

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
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<UploadHistory[]>([]);

    const fetchHistory = useCallback(async () => {
        try {
            const data = await http.get<UploadHistory[]>('/safety/uploads');
            setHistory(data);
        } catch {
            // ignore
        }
    }, []);

    // Fetch history on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        fetchHistory();
    }, []);

    const processFile = (f: File) => {
        setFile(f);
        setResult(null);
        setError(null);

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
                setError(t('safety_upload.parse_error'));
                setRows([]);
            }
        };
        reader.readAsArrayBuffer(f);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files[0];
        if (f && /\.(csv|xlsx|xls)$/i.test(f.name)) {
            processFile(f);
        } else {
            setError(t('safety_upload.invalid_file'));
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) processFile(f);
    };

    const handleUpload = async () => {
        if (!rows.length) return;
        setUploading(true);
        setError(null);
        try {
            const res = await http.post<{ ok: boolean; resumo: UploadResumo }>('/safety/upload', {
                data: { nomeArquivo: file?.name || 'upload.csv', inputRows: rows },
            });
            setResult(res);
            fetchHistory();
        } catch (err: any) {
            setError(err?.message || t('safety_upload.upload_error'));
        } finally {
            setUploading(false);
        }
    };

    const handleClear = () => {
        setFile(null);
        setRows([]);
        setResult(null);
        setError(null);
        if (inputRef.current) inputRef.current.value = '';
    };

    const previewCols = rows.length > 0 ? Object.keys(rows[0]).slice(0, 6) : [];

    return (
        <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                🛡️ {t('safety_upload.title')}
            </h1>
            <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: 14 }}>
                {t('safety_upload.subtitle')}
            </p>

            {/* Dropzone */}
            {!file && (
                <div
                    onDrop={handleDrop}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onClick={() => inputRef.current?.click()}
                    style={{
                        border: `2px dashed ${isDragging ? '#3b82f6' : '#cbd5e1'}`,
                        borderRadius: 12,
                        padding: '3rem 2rem',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: isDragging ? '#eff6ff' : '#f8fafc',
                        transition: 'all 0.2s',
                    }}
                >
                    <FiUploadCloud size={48} color="#94a3b8" />
                    <p style={{ marginTop: 12, fontWeight: 600, color: '#334155' }}>
                        {t('safety_upload.dropzone')}
                    </p>
                    <p style={{ fontSize: 13, color: '#94a3b8' }}>{t('safety_upload.dropzone_or')}</p>
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                    />
                </div>
            )}

            {/* File loaded info */}
            {file && !result && (
                <div
                    style={{
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: 10,
                        padding: '1rem 1.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '1rem',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FiFile size={20} color="#16a34a" />
                        <strong>{file.name}</strong>
                        <span style={{ color: '#64748b', fontSize: 13 }}>— {rows.length} {t('safety_upload.rows')}</span>
                    </div>
                    <button
                        onClick={handleClear}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#94a3b8',
                        }}
                    >
                        <FiTrash2 size={18} />
                    </button>
                </div>
            )}

            {/* Preview table */}
            {rows.length > 0 && !result && (
                <>
                    <div
                        style={{
                            overflowX: 'auto',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            marginBottom: '1rem',
                            maxHeight: 300,
                        }}
                    >
                        <table
                            style={{
                                width: '100%',
                                fontSize: 12,
                                borderCollapse: 'collapse',
                            }}
                        >
                            <thead>
                                <tr>
                                    {previewCols.map((col) => (
                                        <th
                                            key={col}
                                            style={{
                                                padding: '6px 10px',
                                                background: '#f1f5f9',
                                                borderBottom: '1px solid #e2e8f0',
                                                textAlign: 'left',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {col}
                                        </th>
                                    ))}
                                    {Object.keys(rows[0]).length > 6 && (
                                        <th style={{ padding: '6px 10px', background: '#f1f5f9' }}>...</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.slice(0, 8).map((row, i) => (
                                    <tr key={i}>
                                        {previewCols.map((col) => (
                                            <td
                                                key={col}
                                                style={{
                                                    padding: '4px 10px',
                                                    borderBottom: '1px solid #f1f5f9',
                                                    maxWidth: 200,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {String(row[col] ?? '')}
                                            </td>
                                        ))}
                                        {Object.keys(rows[0]).length > 6 && (
                                            <td style={{ padding: '4px 10px', color: '#94a3b8' }}>...</td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: '1.5rem' }}>
                        <button
                            onClick={handleUpload}
                            disabled={uploading}
                            style={{
                                padding: '10px 24px',
                                background: uploading ? '#94a3b8' : '#ef4444',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 8,
                                fontWeight: 600,
                                cursor: uploading ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            <FiUploadCloud size={18} />
                            {uploading
                                ? t('safety_upload.sending')
                                : t('safety_upload.send')}
                        </button>
                        <button
                            onClick={handleClear}
                            disabled={uploading}
                            style={{
                                padding: '10px 24px',
                                background: '#f1f5f9',
                                color: '#64748b',
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </>
            )}

            {/* Error */}
            {error && (
                <div
                    style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: 10,
                        padding: '1rem 1.5rem',
                        color: '#dc2626',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: '1rem',
                    }}
                >
                    <FiAlertCircle size={20} /> {error}
                </div>
            )}

            {/* Success result */}
            {result?.ok && (
                <div
                    style={{
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: 10,
                        padding: '1.5rem',
                        marginBottom: '1.5rem',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <FiCheck size={24} color="#16a34a" />
                        <strong style={{ color: '#16a34a', fontSize: 16 }}>
                            {t('safety_upload.success')}
                        </strong>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                        <div>
                            <p style={{ fontSize: 24, fontWeight: 700, color: '#334155' }}>
                                {result.resumo.registrosUnicos}
                            </p>
                            <p style={{ fontSize: 12, color: '#64748b' }}>{t('safety_upload.result_unique')}</p>
                        </div>
                        <div>
                            <p style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>
                                {result.resumo.novos}
                            </p>
                            <p style={{ fontSize: 12, color: '#64748b' }}>{t('safety_upload.result_created')}</p>
                        </div>
                        <div>
                            <p style={{ fontSize: 24, fontWeight: 700, color: '#d97706' }}>
                                {result.resumo.atualizados}
                            </p>
                            <p style={{ fontSize: 12, color: '#64748b' }}>{t('safety_upload.result_updated')}</p>
                        </div>
                        <div>
                            <p style={{ fontSize: 24, fontWeight: 700, color: '#64748b' }}>
                                {result.resumo.totalLinhasCsv}
                            </p>
                            <p style={{ fontSize: 12, color: '#64748b' }}>{t('safety_upload.result_csv_lines')}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClear}
                        style={{
                            marginTop: 16,
                            padding: '8px 20px',
                            background: '#f1f5f9',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontWeight: 500,
                        }}
                    >
                        {t('safety_upload.new_upload')}
                    </button>
                </div>
            )}

            {/* Upload history */}
            {history.length > 0 && (
                <div>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
                        {t('safety_upload.history_title')}
                    </h3>
                    <table
                        style={{
                            width: '100%',
                            fontSize: 13,
                            borderCollapse: 'collapse',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                        }}
                    >
                        <thead>
                            <tr>
                                <th style={{ padding: '8px 12px', background: '#f1f5f9', textAlign: 'left' }}>
                                    {t('safety_upload.history_file')}
                                </th>
                                <th style={{ padding: '8px 12px', background: '#f1f5f9', textAlign: 'center' }}>
                                    {t('safety_upload.history_created')}
                                </th>
                                <th style={{ padding: '8px 12px', background: '#f1f5f9', textAlign: 'center' }}>
                                    {t('safety_upload.history_updated')}
                                </th>
                                <th style={{ padding: '8px 12px', background: '#f1f5f9', textAlign: 'left' }}>
                                    {t('safety_upload.history_uploaded_by')}
                                </th>
                                <th style={{ padding: '8px 12px', background: '#f1f5f9', textAlign: 'left' }}>
                                    {t('safety_upload.history_date')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((h) => (
                                <tr key={h.id}>
                                    <td style={{ padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
                                        {h.nome_arquivo}
                                    </td>
                                    <td
                                        style={{
                                            padding: '6px 12px',
                                            borderBottom: '1px solid #f1f5f9',
                                            textAlign: 'center',
                                            color: '#16a34a',
                                            fontWeight: 600,
                                        }}
                                    >
                                        {h.registros_novos}
                                    </td>
                                    <td
                                        style={{
                                            padding: '6px 12px',
                                            borderBottom: '1px solid #f1f5f9',
                                            textAlign: 'center',
                                            color: '#d97706',
                                            fontWeight: 600,
                                        }}
                                    >
                                        {h.registros_atualizados}
                                    </td>
                                    <td style={{ padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
                                        {h.enviado_por || '—'}
                                    </td>
                                    <td style={{ padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
                                        {new Date(h.criado_em).toLocaleString('pt-BR')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
