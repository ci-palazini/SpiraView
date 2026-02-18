// src/features/producao/pages/ProducaoUploadDetalhePage.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiCheck, FiX } from 'react-icons/fi';

import PageHeader from '../../../shared/components/PageHeader';
import { buscarDetalheUploadProducao, type ProducaoUploadDetalhe } from '../../../services/apiClient';
import styles from './ProducaoUploadPage.module.css';

export default function ProducaoUploadDetalhePage() {
    const { t } = useTranslation();
    const { uploadId } = useParams<{ uploadId: string }>();
    const navigate = useNavigate();

    const [data, setData] = useState<ProducaoUploadDetalhe | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!uploadId) return;

        try {
            setLoading(true);
            setError(null);
            const result = await buscarDetalheUploadProducao(uploadId);
            setData(result);
        } catch (err) {
            console.error(err);
            const msg = err instanceof Error ? err.message : t('producao.upload.details.error', 'Erro ao carregar detalhes');
            setError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    }, [uploadId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const formatDate = (iso: string) => {
        try {
            return new Date(iso).toLocaleDateString('pt-BR');
        } catch {
            return iso;
        }
    };

    const formatDateTime = (iso: string) => {
        try {
            return new Date(iso).toLocaleString('pt-BR');
        } catch {
            return iso;
        }
    };

    if (loading) {
        return (
            <>
                <PageHeader title={t('producao.upload.details.title', 'Detalhes do Upload')} subtitle={t('producao.upload.details.loading', 'Carregando...')} />
                <div className={styles.container}>
                    <p style={{ color: '#64748b' }}>{t('producao.upload.details.loading', 'Carregando...')}</p>
                </div>
            </>
        );
    }

    if (error || !data) {
        return (
            <>
                <PageHeader title={t('producao.upload.details.title', 'Detalhes do Upload')} subtitle={t('producao.upload.details.error', 'Erro')} />
                <div className={styles.container}>
                    <p style={{ color: '#ef4444' }}>{error || t('producao.upload.details.notFound', 'Upload não encontrado')}</p>
                    <button className={styles.cancelBtn} onClick={() => navigate('/producao/upload')}>
                        <FiArrowLeft style={{ marginRight: 6 }} />
                        {t('producao.upload.details.back', 'Voltar')}
                    </button>
                </div>
            </>
        );
    }

    const { upload, porMaquina, resumo } = data;

    return (
        <>
            <PageHeader
                title={t('producao.upload.details.title', 'Detalhes do Upload')}
                subtitle={upload.nomeArquivo}
            />

            <div className={styles.container}>
                {/* Botão Voltar */}
                <button
                    className={styles.cancelBtn}
                    onClick={() => navigate('/producao/upload')}
                    style={{ marginBottom: 16 }}
                >
                    <FiArrowLeft style={{ marginRight: 6 }} />
                    {t('producao.upload.details.back', 'Voltar')}
                </button>

                {/* Header do upload */}
                <div style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 20
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                        <div>
                            <h3 style={{ margin: 0, color: '#1e293b' }}>{upload.nomeArquivo}</h3>
                            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                                {t('producao.upload.details.dateRef', 'Data de referência')}: <strong>{formatDate(upload.dataRef)}</strong>
                            </p>
                            <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                                {t('producao.upload.details.sentAt', 'Enviado em')}: {formatDateTime(upload.criadoEm)}
                                {upload.uploadPorNome && ` ${t('producao.upload.details.by', 'por')} ${upload.uploadPorNome}`}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{
                                background: '#e0f2fe',
                                color: '#0369a1',
                                padding: '4px 10px',
                                borderRadius: 4,
                                fontSize: '0.85rem',
                                fontWeight: 500
                            }}>
                                {resumo.totalMaquinas} {t('producao.upload.details.machines', 'máquinas')}
                            </span>
                            <span style={{
                                background: '#f0fdf4',
                                color: '#166534',
                                padding: '4px 10px',
                                borderRadius: 4,
                                fontSize: '0.85rem',
                                fontWeight: 500
                            }}>
                                {Number(resumo.totalHoras).toFixed(1)}h {t('producao.upload.details.total', 'total')}
                            </span>
                            <span style={{
                                background: upload.ativo ? '#dcfce7' : '#f1f5f9',
                                color: upload.ativo ? '#166534' : '#64748b',
                                padding: '4px 10px',
                                borderRadius: 4,
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4
                            }}>
                                {upload.ativo ? <><FiCheck /> {t('producao.upload.history.active', 'Ativo')}</> : <><FiX /> {t('producao.upload.history.inactive', 'Inativo')}</>}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Tabela de máquinas */}
                <h3 className={styles.previewTitle}>{t('producao.upload.details.tableTitle', 'Lançamentos por Máquina')}</h3>

                {porMaquina.length === 0 ? (
                    <p style={{ color: '#64748b' }}>{t('producao.upload.details.emptyTable', 'Nenhum lançamento encontrado.')}</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className={styles.previewTable}>
                            <thead>
                                <tr>
                                    <th>{t('producao.upload.details.columns.machine', 'Máquina')}</th>
                                    <th style={{ textAlign: 'right' }}>{t('producao.upload.details.columns.hours', 'Horas')}</th>
                                    <th style={{ textAlign: 'center' }}>{t('producao.upload.details.columns.shift', 'Turno(s)')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {porMaquina.map((m) => (
                                    <tr key={m.maquinaId}>
                                        <td style={{ fontWeight: 500 }}>
                                            {m.maquinaNomeProducao || m.maquinaNome}
                                        </td>

                                        <td style={{ textAlign: 'right', fontWeight: 500 }}>
                                            {Number(m.total).toFixed(2)}h
                                        </td>
                                        <td style={{ textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                                            {Array.from(new Set(m.lancamentos.map(l => l.turno || 'único'))).join(', ')}
                                        </td>
                                    </tr>
                                ))}
                                {/* Linha de total */}
                                <tr style={{ background: '#f1f5f9', fontWeight: 600 }}>
                                    <td style={{ textAlign: 'right' }}>
                                        {Number(resumo.totalHoras).toFixed(2)}h
                                    </td>
                                    <td></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}
