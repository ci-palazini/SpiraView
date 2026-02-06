import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Box,
    Chip,
    TablePagination,
    CircularProgress,
    IconButton
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { listarRefugos } from '../../../services/apiClient';
import toast from 'react-hot-toast';
import { X, Search, FileText } from 'lucide-react';
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

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    useEffect(() => {
        if (open) {
            fetchData();
        }
    }, [open, page, rowsPerPage]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = {
                page: page + 1,
                limit: rowsPerPage,
                ...filters
            };
            const res = await listarRefugos(params);
            setItems(res.items);
            setTotal(res.meta.total);
        } catch (error) {
            console.error(error);
            toast.error(t('common.error'));
        } finally {
            setLoading(false);
        }
    };

    const handleChangePage = (event: unknown, newPage: number) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="xl"
            fullWidth
            PaperProps={{
                sx: { borderRadius: '12px', overflow: 'hidden' }
            }}
        >
            <div className={styles.dialogTitle}>
                <div className={styles.titleContent}>
                    <div className={styles.title}>
                        <Search size={20} className="text-blue-500" />
                        {title}
                    </div>
                    <div className={styles.subtitle}>
                        {t('qualityAnalytics.drillDownSubtitle', 'Visualizando registros individuais')}
                    </div>
                </div>
                <IconButton onClick={onClose} size="small">
                    <X size={20} />
                </IconButton>
            </div>

            <div className={styles.statsContainer}>
                <div className={styles.statItem}>
                    <span className={styles.statLabel}>{t('common.totalRecords', 'Total de Registros')}</span>
                    <span className={styles.statValue}>{total}</span>
                </div>
                {/* We could add logic here to sum the displayed rows cost, but true total cost needs backend support */}
            </div>

            <DialogContent sx={{ p: 0 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <>
                        <TableContainer className={styles.tableContainer}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell className={styles.tableHeaderCell}>{t('common.date', 'Data')}</TableCell>
                                        <TableCell className={styles.tableHeaderCell}>{t('qualityAnalytics.filterOrigin', 'Origem')}</TableCell>
                                        <TableCell className={styles.tableHeaderCell}>{t('qualityAnalytics.responsive', 'Resp.')}</TableCell>
                                        <TableCell className={styles.tableHeaderCell}>{t('common.itemCode', 'Item')}</TableCell>
                                        <TableCell className={styles.tableHeaderCell}>{t('common.defectReason', 'Motivo')}</TableCell>
                                        <TableCell align="right" className={styles.tableHeaderCell}>{t('common.quantity', 'Qtd')}</TableCell>
                                        <TableCell align="right" className={styles.tableHeaderCell}>{t('common.cost', 'Custo')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {items.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} align="center" sx={{ py: 8, color: 'text.secondary', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                <FileText size={48} color="#cbd5e1" style={{ marginBottom: 16 }} />
                                                <div style={{ fontSize: '1.125rem', fontWeight: 500, color: '#64748b' }}>
                                                    {t('common.noEntries', 'Nenhum registro encontrado')}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        items.map((row) => (
                                            <TableRow key={row.id} className={styles.tableRow}>
                                                <TableCell className={styles.tableCell}>
                                                    {new Date(row.data_ocorrencia).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className={styles.tableCell}>
                                                    <Chip
                                                        label={row.origem}
                                                        size="small"
                                                        sx={{
                                                            height: 24,
                                                            bgcolor: '#fff7ed',
                                                            color: '#c2410c',
                                                            fontWeight: 600,
                                                            borderRadius: '6px'
                                                        }}
                                                    />
                                                </TableCell>
                                                <TableCell className={styles.tableCell}>{row.responsavel_nome || '-'}</TableCell>
                                                <TableCell className={styles.tableCell}>
                                                    <Box>
                                                        <div style={{ fontWeight: 500, color: '#334155' }}>{row.codigo_item}</div>
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {row.descricao_item}
                                                        </div>
                                                    </Box>
                                                </TableCell>
                                                <TableCell className={styles.tableCell}>{row.motivo_defeito}</TableCell>
                                                <TableCell align="right" className={styles.tableCell}>
                                                    <span style={{ fontWeight: 600 }}>{row.quantidade}</span>
                                                </TableCell>
                                                <TableCell align="right" className={`${styles.tableCell} ${styles.costCell}`}>
                                                    {formatCurrency(Number(row.custo))}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <TablePagination
                            rowsPerPageOptions={[10, 25, 50]}
                            component="div"
                            count={total}
                            rowsPerPage={rowsPerPage}
                            page={page}
                            onPageChange={handleChangePage}
                            onRowsPerPageChange={handleChangeRowsPerPage}
                            labelRowsPerPage={t('common.rowsPerPage', 'Linhas por página')}
                            sx={{ borderTop: '1px solid #e2e8f0' }}
                        />
                    </>
                )}
            </DialogContent>
            <div className={styles.footer}>
                <Button onClick={onClose} variant="contained" sx={{ borderRadius: 2, px: 4, textTransform: 'none', fontWeight: 600 }}>
                    {t('common.close', 'Fechar')}
                </Button>
            </div>
        </Dialog>
    );
}
