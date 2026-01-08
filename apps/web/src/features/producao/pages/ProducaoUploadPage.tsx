// src/features/producao/pages/ProducaoUploadPage.tsx
import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { FiUploadCloud, FiFileText, FiX, FiCheck, FiAlertTriangle, FiClock } from 'react-icons/fi';

import PageHeader from '../../../shared/components/PageHeader';
import { uploadLancamentosProducao, listarUploadsProducao, type ProducaoUpload } from '../../../services/apiClient';
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
        const [y, m, d] = iso.split('-');
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

    useEffect(() => {
        fetchUploads(dataFiltro);
    }, [fetchUploads, dataFiltro]);

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
                toast.success(`Arquivo carregado: ${json.length} linhas`);
            } catch (err) {
                console.error(err);
                toast.error('Erro ao ler arquivo Excel');
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
            toast.error('Envie um arquivo .xlsx ou .xls');
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
                toast.success(`Upload concluído! ${res.resumo.linhasValidas} linhas processadas.`);
            } else {
                toast.success(`Upload parcial: ${res.resumo.linhasValidas} linhas OK, ${res.resumo.linhasComErro} com erro.`);
            }

            // Limpar arquivo e voltar ao estado inicial (sempre, mesmo com erros parciais)
            setFile(null);
            setRows([]);
            if (inputRef.current) inputRef.current.value = '';

            // Atualizar histórico
            fetchUploads(dataFiltro);
        } catch (err: unknown) {
            // Tentar extrair erros detalhados da resposta
            let errorMessage = 'Erro ao fazer upload';
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
                title="Upload de Produção"
                subtitle="Importe lançamentos de horas de produção a partir de um arquivo Excel."
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
                            Arraste um arquivo Excel aqui ou clique para selecionar
                        </p>
                        <p className={styles.dropzoneHint}>
                            Formatos aceitos: .xlsx, .xls
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
                        <button className={styles.removeBtn} onClick={handleRemoveFile} title="Remover arquivo">
                            <FiX />
                        </button>
                    </div>
                )}

                {/* Preview */}
                {rows.length > 0 && (
                    <div className={styles.previewSection}>
                        <h3 className={styles.previewTitle}>
                            Pré-visualização ({rows.length} linhas total, mostrando {previewRows.length})
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
                                        Enviando...
                                    </>
                                ) : (
                                    <>
                                        <FiUploadCloud />
                                        Enviar {rows.length} linhas
                                    </>
                                )}
                            </button>
                            <button className={styles.cancelBtn} onClick={handleRemoveFile}>
                                Cancelar
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
                                    <><FiCheck style={{ verticalAlign: 'middle', marginRight: 8 }} /> Upload concluído com sucesso!</>
                                ) : (
                                    <><FiAlertTriangle style={{ verticalAlign: 'middle', marginRight: 8 }} /> Upload concluído com erros</>
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
                            <li><strong>Total de linhas:</strong> {result.resumo.totalLinhas}</li>
                            <li><strong>Linhas válidas:</strong> {result.resumo.linhasValidas}</li>
                            <li><strong>Linhas com erro:</strong> {result.resumo.linhasComErro}</li>
                            <li><strong>Datas processadas:</strong> {result.resumo.datasProcessadas}</li>
                        </ul>

                        {result.resultados.length > 0 && (
                            <ul className={styles.resultList} style={{ marginTop: 12 }}>
                                {result.resultados.map((r, i) => (
                                    <li key={i}>
                                        <strong>{r.dataRef}:</strong> {r.linhasProcessadas} linhas, {r.horasTotal.toFixed(1)}h
                                    </li>
                                ))}
                            </ul>
                        )}

                        {result.erros.length > 0 && (
                            <div className={styles.errorList}>
                                {result.erros.map((err, i) => (
                                    <div key={i} className={styles.errorRow}>
                                        <span className={styles.errorLinha}>Linha {err.linha}</span>
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
                        <span>Uploads do Dia</span>
                        <span className={styles.badge}>{uploads.length} arquivo(s)</span>
                        {!loadingUploads && uploads.length > 0 && (
                            <span className={styles.badgeOutline}>
                                Total: {uploads.reduce((sum, u) => sum + Number(u.horasTotal || 0), 0).toFixed(2)} h
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
                    <p style={{ color: '#64748b' }}>Carregando...</p>
                ) : uploads.length === 0 ? (
                    <p style={{ color: '#64748b' }}>Nenhum upload encontrado para {formatDateBR(dataFiltro)}.</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className={styles.previewTable}>
                            <thead>
                                <tr>
                                    <th>Arquivo</th>
                                    <th>Data Ref.</th>
                                    <th>Linhas</th>
                                    <th>Horas</th>
                                    <th>Enviado em</th>
                                    <th>Status</th>
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
                                        <td>{u.dataRef}</td>
                                        <td>{u.linhasSucesso}/{u.linhasTotal}</td>
                                        <td>{Number(u.horasTotal).toFixed(1)}h</td>
                                        <td>{new Date(u.criadoEm).toLocaleString('pt-BR')}</td>
                                        <td>
                                            {u.ativo ? (
                                                <span style={{ color: '#16a34a', fontWeight: 500 }}>Ativo</span>
                                            ) : (
                                                <span style={{ color: '#94a3b8' }}>Inativo</span>
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
