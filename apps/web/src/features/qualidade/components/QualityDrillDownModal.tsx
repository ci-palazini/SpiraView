import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { listarRefugos } from '../../../services/apiClient';
import { formatDate } from '../../../shared/utils/dateUtils';
import toast from 'react-hot-toast';
import { X, Search, FileText } from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import Spinner from '../../../shared/components/Spinner';
import styles from './QualityDrillDownModal.module.css';

interface QualityDrillDownModalProps {
    open: boolean;
    onClose: () => void;
    filters: {
        tipo?: string;
        origem?: string | string[];
        responsavel?: string | string[];
        tipoLancamento?: string;
        dataInicio?: string;
        dataFim?: string;
    };
    title: string;
}

export default function QualityDrillDownModal({ open, onClose, filters, title }: QualityDrillDownModalProps) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<any[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [total, setTotal] = useState(0);

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    useEffect(() => {
        if (open) {
            setPage(0);
        }
    }, [open]);

    useEffect(() => {
        if (open) {
            fetchData();
        }
    }, [open, page, rowsPerPage]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await listarRefugos({ page: page + 1, limit: rowsPerPage, ...filters });
            setItems(res.items);
            setTotal(res.meta.total);
        } catch (error) {
            console.error(error);
            toast.error(t('common.error'));
        } finally {
            setLoading(false);
        }
    };

    const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));
    const startRow = total === 0 ? 0 : page * rowsPerPage + 1;
    const endRow = Math.min((page + 1) * rowsPerPage, total);

    if (!open) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modalWrapper} onClick={(e) => e.stopPropagation()}>
                <div className={styles.dialogTitle}>
                    <div className={styles.titleContent}>
                        <div className={styles.title}>
                            <Search size={20} style={{ color: '#3b82f6' }} />
                            {title}
                        </div>
                        <div className={styles.subtitle}>
                            {t('qualityAnalytics.drillDownSubtitle', 'Visualizando registros individuais')}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4 }}
                        aria-label={t('common.close', 'Fechar')}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.statsContainer}>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>{t('common.totalRecords', 'Total de Registros')}</span>
                        <span className={styles.statValue}>{total}</span>
                    </div>
                </div>

                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {loading ? (
                        <div className={styles.loadingCenter}>
                            <Spinner size={40} />
                        </div>
                    ) : (
                        <>
                            <div className={styles.tableScrollContainer}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>{t('common.date', 'Data')}</th>
                                            <th>{t('qualityAnalytics.filterOrigin', 'Origem')}</th>
                                            <th>{t('qualityAnalytics.responsive', 'Resp.')}</th>
                                            <th>{t('common.itemCode', 'Item')}</th>
                                            <th>{t('common.defectReason', 'Motivo')}</th>
                                            <th className={styles.alignRight}>{t('common.quantity', 'Qtd')}</th>
                                            <th className={styles.alignRight}>{t('common.cost', 'Custo')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className={styles.emptyCell}>
                                                    <div className={styles.emptyState}>
                                                        <FileText size={48} color="#cbd5e1" />
                                                        <div style={{ fontSize: '1.125rem', fontWeight: 500, color: '#64748b' }}>
                                                            {t('common.noEntries', 'Nenhum registro encontrado')}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            items.map((row) => (
                                                <tr key={row.id} className={styles.tableRowHover}>
                                                    <td className={styles.tableCell}>{formatDate(row.data_ocorrencia)}</td>
                                                    <td className={styles.tableCell}>
                                                        <span className={styles.chip}>{row.origem}</span>
                                                    </td>
                                                    <td className={styles.tableCell}>{row.responsavel_nome || '-'}</td>
                                                    <td className={styles.tableCell}>
                                                        <div style={{ fontWeight: 500, color: '#334155' }}>{row.codigo_item}</div>
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {row.descricao_item}
                                                        </div>
                                                    </td>
                                                    <td className={styles.tableCell}>{row.motivo_defeito}</td>
                                                    <td className={`${styles.tableCell} ${styles.alignRight}`}>
                                                        <span style={{ fontWeight: 600 }}>{row.quantidade}</span>
                                                    </td>
                                                    <td className={`${styles.tableCell} ${styles.costCell} ${styles.alignRight}`}>
                                                        {formatCurrency(Number(row.custo))}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className={styles.pagination}>
                                <span className={styles.paginationLabel}>
                                    {t('common.rowsPerPage', 'Linhas por página')}
                                </span>
                                <select
                                    className={styles.paginationSelect}
                                    value={rowsPerPage}
                                    onChange={(e) => {
                                        setRowsPerPage(parseInt(e.target.value, 10));
                                        setPage(0);
                                    }}
                                >
                                    {[10, 25, 50].map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                                <span className={styles.paginationLabel}>
                                    {total === 0 ? '0' : `${startRow}–${endRow}`} {t('common.of', 'de')} {total}
                                </span>
                                <button
                                    className={styles.paginationBtn}
                                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                                    disabled={page === 0}
                                    aria-label="Página anterior"
                                >
                                    ‹
                                </button>
                                <button
                                    className={styles.paginationBtn}
                                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                                    disabled={page >= totalPages - 1}
                                    aria-label="Próxima página"
                                >
                                    ›
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <div className={styles.footer}>
                    <Button variant="primary" onClick={onClose}>
                        {t('common.close', 'Fechar')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
