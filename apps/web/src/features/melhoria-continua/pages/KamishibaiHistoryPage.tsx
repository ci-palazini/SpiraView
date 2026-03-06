import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiClock, FiCheckCircle, FiXCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';

import PageHeader from '../../../shared/components/PageHeader';
import { getKamishibaiHistorico } from '../../../services/apiClient';
import { formatDateTime } from '../../../shared/utils/dateUtils';
import styles from './KamishibaiHistoryPage.module.css';

export default function KamishibaiHistoryPage() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const kaizenId = searchParams.get('kaizenId');

    const [historico, setHistorico] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    const toggleRow = (id: string) => {
        setExpandedRow(prev => prev === id ? null : id);
    };

    useEffect(() => {
        setLoading(true);
        // Pass undefined or null if kaizenId is not present
        getKamishibaiHistorico(kaizenId || undefined)
            .then(historicoData => setHistorico(historicoData))
            .catch(err => {
                console.error(err);
                toast.error(t('melhoriaContinua.history.loadError', 'Erro ao carregar dados do histórico'));
            })
            .finally(() => setLoading(false));
    }, [kaizenId, t]);

    const titleStr = kaizenId
        ? t('melhoriaContinua.history.filteredTitle', 'Histórico Filtrado (Kaizen Específico)')
        : t('melhoriaContinua.history.globalTitle', 'Histórico Global de Kamishibai');

    return (
        <>
            <PageHeader
                title={titleStr}
                subtitle={t('melhoriaContinua.history.subtitle', 'Visualização de todas as auditorias realizadas')}
            />

            <div className={styles.container}>
                {loading ? (
                    <div className={styles.loading}>{t('common.loading', 'Carregando histórico...')}</div>
                ) : historico.length === 0 ? (
                    <div className={styles.emptyState}>
                        <FiClock size={40} className={styles.emptyIcon} />
                        <p>{t('melhoriaContinua.history.empty', 'Nenhuma auditoria realizada para este Kaizen ainda.')}</p>
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className={styles.dataTable}>
                            <thead>
                                <tr>
                                    <th>{t('melhoriaContinua.history.date', 'Data')}</th>
                                    <th>{t('melhoriaContinua.history.kaizen', 'Kaizen')}</th>
                                    <th>{t('melhoriaContinua.history.auditor', 'Auditor')}</th>
                                    <th>{t('melhoriaContinua.history.status', 'Status')}</th>
                                    <th>{t('melhoriaContinua.history.observations', 'Observações')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {historico.map((audit_log) => {
                                    const isConforme = audit_log.status === 'conforme';
                                    const dataFormatada = formatDateTime(audit_log.data_auditoria);
                                    const isExpanded = expandedRow === audit_log.id;

                                    return (
                                        <React.Fragment key={audit_log.id}>
                                            <tr
                                                className={`${isExpanded ? styles.rowExpanded : styles.rowNormal} ${styles.rowClickable}`}
                                                onClick={() => toggleRow(audit_log.id)}
                                            >
                                                <td className={styles.colDate}>{dataFormatada}</td>
                                                <td className={styles.colKaizen}>{audit_log.kaizen_titulo || `ID: ${audit_log.kaizen_id}`}</td>
                                                <td className={styles.colAuditor}>{audit_log.auditor_nome || audit_log.auditor_email || t('common.unknown', 'Desconhecido')}</td>
                                                <td className={styles.colStatus}>
                                                    <span className={`${styles.statusBadge} ${isConforme ? styles.statusBadgeOk : styles.statusBadgeNok}`}>
                                                        {isConforme
                                                            ? <><FiCheckCircle size={14} /> {t('melhoriaContinua.history.conforme', 'Conforme')}</>
                                                            : <><FiXCircle size={14} /> {t('melhoriaContinua.history.naoConforme', 'Não Conforme')}</>}
                                                    </span>
                                                </td>
                                                <td className={styles.colObs}>{audit_log.observacoes || '-'}</td>
                                            </tr>
                                            {isExpanded && (
                                                <tr className={styles.expandedContainer}>
                                                    <td colSpan={5}>
                                                        <div className={styles.expandedContent}>
                                                            <h4 style={{ marginTop: 0, marginBottom: "16px", color: "#334155", fontSize: "1rem" }}>
                                                                {t('melhoriaContinua.history.answersTitle', 'Respostas da Auditoria')}
                                                            </h4>
                                                            {audit_log.respostas && audit_log.respostas.length > 0 ? (
                                                                <div className={styles.answersGrid}>
                                                                    {audit_log.respostas.map((resp: any, idx: number) => (
                                                                        <div key={idx} className={styles.answerRow}>
                                                                            <div className={styles.answerIcon}>
                                                                                {resp.is_conforme
                                                                                    ? <FiCheckCircle size={18} color="#16a34a" />
                                                                                    : <FiXCircle size={18} color="#dc2626" />}
                                                                            </div>
                                                                            <div className={styles.answerText}>
                                                                                {resp.texto_pergunta}
                                                                            </div>
                                                                            <div className={styles.answerObs}>
                                                                                {resp.observacao || '-'}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <p style={{ color: "#64748b", margin: 0, fontStyle: "italic" }}>
                                                                    {t('melhoriaContinua.history.noAnswers', 'Nenhuma resposta detalhada encontrada.')}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}
