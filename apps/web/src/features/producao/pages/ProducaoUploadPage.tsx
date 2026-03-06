// src/features/producao/pages/ProducaoUploadPage.tsx
import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { FiUploadCloud, FiFileText, FiX, FiCheck, FiAlertTriangle, FiClock, FiArchive, FiChevronDown, FiChevronUp } from 'react-icons/fi';

import PageHeader from '../../../shared/components/PageHeader';
import { uploadLancamentosProducao, listarUploadsProducao, listarHistoricoUploadsProducao, type ProducaoUpload, type ProducaoUploadHistorico } from '../../../services/apiClient';
import { formatDateTime } from '../../../shared/utils/dateUtils';
import styles from './ProducaoUploadPage.module.css';

// Helpers
function toISO(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function formatDateBR(iso: string): string {
    try {
        // Remove parte do tempo se existir (T00:00:00.000Z)
        const dateOnly = iso.includes('T') ? iso.split('T')[0] : iso;
        const [y, m, d] = dateOnly.split('-');
        return `${d}/${m}/${y}`;
    } catch {
        return iso;
    }
}

interface User {
    role?: string;
    email?: string;
}

interface ProducaoUploadPageProps {
    user: User;
}

interface UploadResult {
    ok: boolean;
    resultados: Array<{ dataRef: string; uploadId: string; linhasProcessadas: number; horasTotal: number }>;
    erros: Array<{ linha: number; erro: string }>;
    resumo: { totalLinhas: number; linhasValidas: number; linhasComErro: number; datasProcessadas: number };
}

export default function ProducaoUploadPage({ user }: ProducaoUploadPageProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [file, setFile] = useState<File | null>(null);
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<UploadResult | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Histórico de uploads
    const [uploads, setUploads] = useState<ProducaoUpload[]>([]);
    const [loadingUploads, setLoadingUploads] = useState(true);
    const [dataFiltro, setDataFiltro] = useState<string>(() => toISO(new Date()));

    // Auditoria - histórico arquivado
    const [historicoAuditoria, setHistoricoAuditoria] = useState<ProducaoUploadHistorico[]>([]);
    const [loadingAuditoria, setLoadingAuditoria] = useState(false);
    const [showAuditoria, setShowAuditoria] = useState(false);

    const fetchUploads = useCallback(async (dataRef?: string) => {
        try {
            setLoadingUploads(true);
            const data = await listarUploadsProducao({ dataRef });
            setUploads(data);
        } catch (err) {
            console.error('Erro ao buscar uploads:', err);
        } finally {
            setLoadingUploads(false);
        }
    }, []);

    const fetchAuditoria = useCallback(async (dataRef?: string) => {
        try {
            setLoadingAuditoria(true);
            const data = await listarHistoricoUploadsProducao({ limite: 100, dataRef });
            setHistoricoAuditoria(data.items || []);
        } catch (err) {
            console.error('Erro ao buscar auditoria:', err);
        } finally {
            setLoadingAuditoria(false);
        }
    }, []);

    useEffect(() => {
        fetchUploads(dataFiltro);
    }, [fetchUploads, dataFiltro]);

    useEffect(() => {
        if (showAuditoria) {
            fetchAuditoria(dataFiltro);
        }
    }, [showAuditoria, dataFiltro, fetchAuditoria]);

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
                toast.success(t('producao.upload.fileLoaded', { count: json.length, defaultValue: `Arquivo carregado: ${json.length} linhas` }));
            } catch (err) {
                console.error(err);
                toast.error(t('producao.upload.readError', 'Erro ao ler arquivo Excel'));
                setFile(null);
                setRows([]);
            }
        };
        reader.readAsArrayBuffer(f);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files[0];
        if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) {
            processFile(f);
        } else {
            toast.error(t('producao.upload.invalidFormat', 'Envie um arquivo .xlsx ou .xls'));
        }
    }, [processFile]);

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
            const res = await uploadLancamentosProducao(rows, file?.name || 'upload.xlsx', {
                role: user.role,
                email: user.email,
            });
            setResult(res);

            if (res.resumo.linhasComErro === 0) {
                toast.success(t('producao.upload.successFull', { count: res.resumo.linhasValidas, defaultValue: `Upload concluído! ${res.resumo.linhasValidas} linhas processadas.` }));
            } else {
                toast.success(t('producao.upload.successPartial', { valid: res.resumo.linhasValidas, errors: res.resumo.linhasComErro, defaultValue: `Upload parcial: ${res.resumo.linhasValidas} linhas OK, ${res.resumo.linhasComErro} com erro.` }));
            }

            // Limpar arquivo e voltar ao estado inicial (sempre, mesmo com erros parciais)
            setFile(null);
            setRows([]);
            if (inputRef.current) inputRef.current.value = '';

            // Atualizar histórico
            fetchUploads(dataFiltro);
        } catch (err: unknown) {
            // Tentar extrair erros detalhados da resposta
            let errorMessage = t('producao.upload.uploadError', 'Erro ao fazer upload');
            let errorDetails: Array<{ linha: number; erro: string }> = [];

            if (err instanceof Error) {
                errorMessage = err.message;
                // Se a mensagem contém JSON, tentar parsear
                try {
                    const parsed = JSON.parse(err.message);
                    if (parsed.erros) {
                        errorDetails = parsed.erros;
                    }
                } catch {
                    // Não é JSON, usar mensagem original
                }
            }

            // Se temos erros detalhados, mostrar como resultado
            if (errorDetails.length > 0) {
                setResult({
                    ok: false,
                    resultados: [],
                    erros: errorDetails,
                    resumo: {
                        totalLinhas: rows.length,
                        linhasValidas: 0,
                        linhasComErro: errorDetails.length,
                        datasProcessadas: 0,
                    },
                });
            }

            toast.error(errorMessage);
        } finally {
            setUploading(false);
        }
    }, [rows, file, user]);

    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const previewRows = rows.slice(0, 3);
    const columns = previewRows.length > 0 ? Object.keys(previewRows[0]) : [];

    return (
        <>
            <PageHeader
                title={t('producao.upload.title', 'Upload de Produção')}
                subtitle={t('producao.upload.subtitle', 'Importe lançamentos de horas de produção a partir de um arquivo Excel.')}
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
                            {t('producao.upload.dropzone', 'Arraste um arquivo Excel aqui ou clique para selecionar')}
                        </p>
                        <p className={styles.dropzoneHint}>
                            {t('producao.upload.dropzoneHint', 'Formatos aceitos: .xlsx, .xls')}
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
                        <button className={styles.removeBtn} onClick={handleRemoveFile} title={t('producao.upload.removeFile', 'Remover arquivo')}>
                            <FiX />
                        </button>
                    </div>
                )}

                {/* Preview */}
                {rows.length > 0 && (
                    <div className={styles.previewSection}>
                        <h3 className={styles.previewTitle}>
                            {t('producao.upload.preview', { total: rows.length, showing: previewRows.length, defaultValue: `Pré-visualização (${rows.length} linhas total, mostrando ${previewRows.length})` })}
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
                                        {t('producao.upload.sending', 'Enviando...')}
                                    </>
                                ) : (
                                    <>
                                        <FiUploadCloud />
                                        {t('producao.upload.send', { count: rows.length, defaultValue: `Enviar ${rows.length} linhas` })}
                                    </>
                                )}
                            </button>
                            <button className={styles.cancelBtn} onClick={handleRemoveFile}>
                                {t('producao.upload.cancel', 'Cancelar')}
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
                                    <><FiCheck style={{ verticalAlign: 'middle', marginRight: 8 }} /> {t('producao.upload.result.successTitle', 'Upload concluído com sucesso!')}</>
                                ) : (
                                    <><FiAlertTriangle style={{ verticalAlign: 'middle', marginRight: 8 }} /> {t('producao.upload.result.errorTitle', 'Upload concluído com erros')}</>
                                )}
                            </h3>
                            <button
                                className={styles.closeBtn}
                                onClick={() => setResult(null)}
                                title="Fechar"
                            >
                                <FiX />
                            </button>
                        </div>
                        <ul className={styles.resultList}>
                            <li><strong>{t('producao.upload.result.totalLines', 'Total de linhas')}:</strong> {result.resumo.totalLinhas}</li>
                            <li><strong>{t('producao.upload.result.validLines', 'Linhas válidas')}:</strong> {result.resumo.linhasValidas}</li>
                            <li><strong>{t('producao.upload.result.errorLines', 'Linhas com erro')}:</strong> {result.resumo.linhasComErro}</li>
                            <li><strong>{t('producao.upload.result.datesProcessed', 'Datas processadas')}:</strong> {result.resumo.datasProcessadas}</li>
                        </ul>

                        {result.resultados.length > 0 && (
                            <ul className={styles.resultList} style={{ marginTop: 12 }}>
                                {result.resultados.map((r, i) => (
                                    <li key={i}>
                                        <strong>{formatDateBR(r.dataRef)}:</strong> {r.linhasProcessadas} linhas, {r.horasTotal.toFixed(1)}h
                                    </li>
                                ))}
                            </ul>
                        )}

                        {result.erros.length > 0 && (
                            <div className={styles.errorList}>
                                {result.erros.map((err, i) => (
                                    <div key={i} className={styles.errorRow}>
                                        <span className={styles.errorLinha}>{t('producao.upload.result.line', 'Linha')} {err.linha}</span>
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
                        <span>{t('producao.upload.history.title', 'Uploads do Dia')}</span>
                        <span className={styles.badge}>{uploads.length} {t('producao.upload.history.files', 'arquivo(s)')}</span>
                        {!loadingUploads && uploads.length > 0 && (
                            <span className={styles.badgeOutline}>
                                {t('producao.upload.history.total', 'Total')}: {uploads.reduce((sum, u) => sum + Number(u.horasTotal || 0), 0).toFixed(2)} h
                            </span>
                        )}
                    </div>
                    <input
                        type="date"
                        className={styles.dateInput}
                        value={dataFiltro}
                        onChange={(e) => setDataFiltro(e.target.value)}
                    />
                </div>

                {loadingUploads ? (
                    <p style={{ color: '#64748b' }}>{t('producao.upload.history.loading', 'Carregando...')}</p>
                ) : uploads.length === 0 ? (
                    <p style={{ color: '#64748b' }}>{t('producao.upload.history.empty', { date: formatDateBR(dataFiltro), defaultValue: `Nenhum upload encontrado para ${formatDateBR(dataFiltro)}.` })}</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className={styles.previewTable}>
                            <thead>
                                <tr>
                                    <th>{t('producao.upload.history.columns.file', 'Arquivo')}</th>
                                    <th>{t('producao.upload.history.columns.dateRef', 'Data Ref.')}</th>
                                    <th>{t('producao.upload.history.columns.lines', 'Linhas')}</th>
                                    <th>{t('producao.upload.history.columns.hours', 'Horas')}</th>
                                    <th>{t('producao.upload.history.columns.sentBy', 'Enviado por')}</th>
                                    <th>{t('producao.upload.history.columns.sentAt', 'Enviado em')}</th>
                                    <th>{t('producao.upload.history.columns.status', 'Status')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {uploads.map((u) => (
                                    <tr
                                        key={u.id}
                                        onClick={() => navigate(`/producao/upload/${u.id}`)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {u.nomeArquivo}
                                        </td>
                                        <td>{formatDateBR(u.dataRef)}</td>
                                        <td>{u.linhasSucesso}/{u.linhasTotal}</td>
                                        <td>{Number(u.horasTotal).toFixed(1)}h</td>
                                        <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {u.uploadPorNome || '—'}
                                        </td>
                                        <td>{formatDateTime(u.criadoEm)}</td>
                                        <td>
                                            {u.ativo ? (
                                                <span style={{ color: '#16a34a', fontWeight: 500 }}>{t('producao.upload.history.active', 'Ativo')}</span>
                                            ) : (
                                                <span style={{ color: '#94a3b8' }}>{t('producao.upload.history.inactive', 'Inativo')}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Auditoria - Histórico de Uploads Arquivados */}
            <div className={styles.container} style={{ marginTop: 0 }}>
                <div
                    className={styles.historyHeader}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setShowAuditoria(!showAuditoria)}
                >
                    <div className={styles.historyTitle}>
                        <FiArchive />
                        <span>{t('producao.upload.audit.title', 'Auditoria de Envios')}</span>
                        <span className={styles.badgeOutline}>
                            {t('producao.upload.audit.subtitle', 'Histórico arquivado (após 48h inativo)')}
                        </span>
                    </div>
                    {showAuditoria ? <FiChevronUp size={20} /> : <FiChevronDown size={20} />}
                </div>

                {showAuditoria && (
                    <>
                        {loadingAuditoria ? (
                            <p style={{ color: '#64748b', padding: '1rem 0' }}>{t('producao.upload.audit.loading', 'Carregando histórico...')}</p>
                        ) : historicoAuditoria.length === 0 ? (
                            <p style={{ color: '#64748b', padding: '1rem 0' }}>
                                {t('producao.upload.audit.empty', 'Nenhum registro de auditoria encontrado. Uploads são arquivados após 48h de inatividade.')}
                            </p>
                        ) : (
                            <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
                                <table className={styles.previewTable}>
                                    <thead>
                                        <tr>
                                            <th>{t('producao.upload.audit.columns.file', 'Arquivo')}</th>
                                            <th>{t('producao.upload.audit.columns.dateRef', 'Data Ref.')}</th>
                                            <th>{t('producao.upload.audit.columns.lines', 'Linhas')}</th>
                                            <th>{t('producao.upload.audit.columns.hours', 'Horas')}</th>
                                            <th>{t('producao.upload.audit.columns.sentBy', 'Enviado por')}</th>
                                            <th>{t('producao.upload.audit.columns.sentAt', 'Enviado em')}</th>
                                            <th>{t('producao.upload.audit.columns.archivedAt', 'Arquivado em')}</th>
                                            <th>{t('producao.upload.audit.columns.reason', 'Motivo')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historicoAuditoria.map((h) => (
                                            <tr key={h.id}>
                                                <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {h.nomeArquivo}
                                                </td>
                                                <td>{formatDateBR(h.dataRef)}</td>
                                                <td>{h.linhasTotal}</td>
                                                <td>{Number(h.horasTotal).toFixed(1)}h</td>
                                                <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {h.uploadPorNome || '—'}
                                                </td>
                                                <td>{formatDateTime(h.criadoEm)}</td>
                                                <td>{formatDateTime(h.arquivadoEm)}</td>
                                                <td>
                                                    <td>
                                                        <span style={{ color: '#f59e0b', fontSize: '0.85rem' }}>
                                                            {h.motivo === 'cleanup_48h' ? t('producao.upload.audit.reasons.cleanup_48h', 'Inativo 48h+') : h.motivo}
                                                        </span>
                                                    </td>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
}
