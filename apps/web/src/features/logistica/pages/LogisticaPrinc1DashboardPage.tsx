import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    FiPackage, FiDollarSign, FiAlertTriangle,
    FiClock, FiFileText, FiDownload, FiX, FiSearch,
    FiChevronUp, FiChevronDown, FiUser, FiCalendar, FiUploadCloud,
    FiBox, FiMapPin
} from 'react-icons/fi';
import PageHeader from '../../../shared/components/PageHeader';
import Skeleton from '../../../shared/components/Skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
    getPrinc1,
    type Princ1Item,
    type Princ1Response,
} from '../../../services/apiClient';
import { exportToExcel } from '../../../utils/exportExcel';
import { formatDateTimeShort } from '../../../shared/utils/dateUtils';
import styles from './PainelLogisticoPage.module.css'; // Reusing standard logistics CSS

type DelayBand = 'all' | 'ok' | 'warning' | 'alert' | 'critical' | 'emergency';
type SortField = 'numero_item' | 'nome_item' | 'configuracao' | 'estoque_fisico' | 'deposito' | 'localizacao' | 'numero_lote' | 'numero_serie' | 'data_entrada' | 'dias_atraso';
type SortDir = 'asc' | 'desc';

const DELAY_BANDS: { key: DelayBand; label: string; min: number; max: number; dot: string; badge: string; row: string }[] = [
    { key: 'ok', label: '0–2 dias', min: 0, max: 2, dot: 'delayDotGreen', badge: 'delayBadgeGreen', row: 'rowOk' },
    { key: 'warning', label: '3–7 dias', min: 3, max: 7, dot: 'delayDotYellow', badge: 'delayBadgeYellow', row: 'rowWarning' },
    { key: 'alert', label: '8–14 dias', min: 8, max: 14, dot: 'delayDotOrange', badge: 'delayBadgeOrange', row: 'rowAlert' },
    { key: 'critical', label: '15–30 dias', min: 15, max: 30, dot: 'delayDotRed', badge: 'delayBadgeRed', row: 'rowCritical' },
    { key: 'emergency', label: '30+ dias', min: 31, max: Infinity, dot: 'delayDotPurple', badge: 'delayBadgePurple', row: 'rowEmergency' },
];

function getDelayBand(dias: number): typeof DELAY_BANDS[number] {
    return DELAY_BANDS.find(b => dias >= b.min && dias <= b.max) || DELAY_BANDS[0];
}

function formatNumber(v: number): string {
    return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function formatDateFromISO(iso: string | null): string {
    if (!iso) return '—';
    try {
        const d = iso.split('T')[0];
        const [y, m, dd] = d.split('-');
        return `${dd}/${m}/${y}`;
    } catch { return '—'; }
}

export default function LogisticaPrinc1DashboardPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [items, setItems] = useState<Princ1Item[]>([]);
    const [uploadInfo, setUploadInfo] = useState<Princ1Response['uploadInfo']>(null);
    const [loading, setLoading] = useState(true);

    const [activeBand, setActiveBand] = useState<DelayBand>('all');
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState<SortField>('dias_atraso');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getPrinc1();
            setItems(data.items || []);
            setUploadInfo(data.uploadInfo || null);
        } catch (err) {
            console.error(err);
            toast.error(t('logisticaPrinc1.errorLoading', 'Erro ao carregar dados do Princ. 1.'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const kpis = useMemo(() => {
        const total = items.length;
        const estoqueTotal = items.reduce((s, i) => s + Number(i.estoque_fisico || 0), 0);
        const atrasadas = items.filter(i => Number(i.dias_atraso) >= 3);
        const qtdAtrasadas = atrasadas.length;
        const criticas = items.filter(i => Number(i.dias_atraso) >= 15);
        const qtdCriticas = criticas.length;
        const atrasoMedio = total > 0 ? items.reduce((s, i) => s + Number(i.dias_atraso || 0), 0) / total : 0;
        const maxAtraso = items.length > 0 ? Math.max(...items.map(i => Number(i.dias_atraso || 0))) : 0;

        return { total, estoqueTotal, qtdAtrasadas, qtdCriticas, atrasoMedio, maxAtraso };
    }, [items]);

    const bandCounts = useMemo(() => {
        const counts: Record<string, { count: number; items: number }> = {};
        for (const b of DELAY_BANDS) {
            counts[b.key] = { count: 0, items: 0 };
        }
        for (const item of items) {
            const dias = Number(item.dias_atraso) || 0;
            const band = getDelayBand(dias);
            counts[band.key].count++;
        }
        return counts;
    }, [items]);

    const topDelaysChartData = useMemo(() => {
        return [...items]
            .filter(i => Number(i.dias_atraso) >= 3)
            .sort((a, b) => Number(b.dias_atraso) - Number(a.dias_atraso))
            .slice(0, 10)
            .map(i => ({
                name: String(i.numero_item),
                dias: Number(i.dias_atraso),
                desc: i.nome_item
            }));
    }, [items]);

    const stockChartData = useMemo(() => {
        return [...items]
            .filter(i => Number(i.dias_atraso) >= 3)
            .sort((a, b) => Number(b.estoque_fisico) - Number(a.estoque_fisico))
            .slice(0, 10)
            .map(i => ({
                name: String(i.numero_item),
                estoque: Number(i.estoque_fisico),
                desc: i.nome_item
            }));
    }, [items]);

    const filteredItems = useMemo(() => {
        let result = [...items];

        if (activeBand !== 'all') {
            const band = DELAY_BANDS.find(b => b.key === activeBand);
            if (band) {
                result = result.filter(i => {
                    const d = Number(i.dias_atraso) || 0;
                    return d >= band.min && d <= band.max;
                });
            }
        }

        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(i =>
                (i.numero_item || '').toLowerCase().includes(q) ||
                (i.nome_item || '').toLowerCase().includes(q) ||
                (i.numero_serie || '').toLowerCase().includes(q) ||
                (i.localizacao || '').toLowerCase().includes(q)
            );
        }

        result.sort((a, b) => {
            let va: string | number = (a as any)[sortField] ?? '';
            let vb: string | number = (b as any)[sortField] ?? '';

            if (['estoque_fisico', 'dias_atraso'].includes(sortField)) {
                va = Number(va) || 0;
                vb = Number(vb) || 0;
            }

            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [items, activeBand, search, sortField, sortDir]);

    const handleSort = useCallback((field: SortField) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir(field === 'dias_atraso' ? 'desc' : 'asc');
        }
        setCurrentPage(1);
    }, [sortField]);

    // Reseta paginação quando busca ou filtra muda
    useEffect(() => {
        setCurrentPage(1);
    }, [search, activeBand]);

    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredItems.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredItems, currentPage]);

    const handleExport = useCallback(() => {
        const data = filteredItems.map(i => ({
            'Nº do item': i.numero_item,
            'Nome do item': i.nome_item,
            'Configuração': i.configuracao,
            'Estoque físico': Number(i.estoque_fisico || 0),
            'Depósito': i.deposito,
            'Localização': i.localizacao,
            'Nº do lote': i.numero_lote,
            'Nº de série': i.numero_serie,
            'Data de entrada': formatDateFromISO(i.data_entrada),
            'Dias em Atraso': Number(i.dias_atraso || 0),
        }));
        exportToExcel(data, 'Princ1_Logistica', 'painel-princ1');
    }, [filteredItems]);

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <FiChevronDown className={styles.sortIcon} />;
        return sortDir === 'asc'
            ? <FiChevronUp className={`${styles.sortIcon} ${styles.sortIconActive}`} />
            : <FiChevronDown className={`${styles.sortIcon} ${styles.sortIconActive}`} />;
    };

    return (
        <>
            <PageHeader
                title={t('logisticaPrinc1.title', 'Painel Princ. 1')}
                subtitle={t('logisticaPrinc1.subtitle', 'Gestão e análise de atrasos na entrada de itens do Princ. 1')}
            />

            <div className={styles.container}>
                <div className={styles.uploadInfoBar}>
                    {uploadInfo ? (
                        <div className={styles.uploadInfoMeta}>
                            <span className={styles.uploadInfoItem}>
                                <FiCalendar />
                                {formatDateTimeShort(uploadInfo.criadoEm)}
                            </span>
                            {uploadInfo.uploadPorEmail && (
                                <span className={styles.uploadInfoItem}>
                                    <FiUser />
                                    {uploadInfo.uploadPorNome || uploadInfo.uploadPorEmail}
                                </span>
                            )}
                            <span className={styles.uploadInfoItem}>
                                <FiFileText />
                                {uploadInfo.totalRows} {t('logisticaPrinc1.rows', 'registros')}
                            </span>
                        </div>
                    ) : (
                        <span className={styles.uploadInfoEmpty}>
                            {t('logisticaPrinc1.noData', 'Nenhum dado carregado')}
                        </span>
                    )}
                    <button
                        className={styles.uploadLinkBtn}
                        onClick={() => navigate('/logistica/princ1/upload')}
                    >
                        <FiUploadCloud />
                        {t('logisticaPrinc1.uploadNew', 'Upload')}
                    </button>
                </div>

                {loading && (
                    <div className={styles.kpiGrid}>
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className={styles.kpiCard}>
                                <Skeleton variant="text" width="60%" height={14} />
                                <Skeleton variant="text" width="80%" height={32} style={{ marginTop: 8 }} />
                            </div>
                        ))}
                    </div>
                )}

                {!loading && items.length === 0 && (
                    <div className={styles.emptyState}>
                        <FiPackage className={styles.emptyIcon} />
                        <p>{t('logisticaPrinc1.empty', 'Nenhum dado do Princ. 1 encontrado. Faça upload para começar.')}</p>
                    </div>
                )}

                {!loading && items.length > 0 && (
                    <>
                        <div className={styles.kpiGrid}>
                            <div className={styles.kpiCard}>
                                <div className={styles.kpiLabel}>
                                    <FiPackage />
                                    {t('logisticaPrinc1.kpi.totalRegistros', 'Total de Itens')}
                                </div>
                                <div className={styles.kpiValue}>{kpis.total}</div>
                            </div>

                            <div className={styles.kpiCard}>
                                <div className={styles.kpiLabel}>
                                    <FiBox />
                                    {t('logisticaPrinc1.kpi.estoqueTotal', 'Estoque Físico Total')}
                                </div>
                                <div className={styles.kpiValue}>{formatNumber(kpis.estoqueTotal)}</div>
                            </div>

                            <div className={`${styles.kpiCard} ${kpis.qtdAtrasadas > 0 ? styles.kpiCardWarning : styles.kpiCardSuccess}`}>
                                <div className={styles.kpiLabel}>
                                    <FiAlertTriangle />
                                    {t('logisticaPrinc1.kpi.atrasadas', 'Itens em Atraso (3d+)')}
                                </div>
                                <div className={`${styles.kpiValue} ${kpis.qtdAtrasadas > 0 ? styles.kpiValueWarning : styles.kpiValueSuccess}`}>
                                    {kpis.qtdAtrasadas}
                                </div>
                                <div className={styles.kpiSubtext}>
                                    {kpis.total > 0 ? `${((kpis.qtdAtrasadas / kpis.total) * 100).toFixed(1)}% do total` : ''}
                                </div>
                            </div>

                            <div className={`${styles.kpiCard} ${kpis.qtdCriticas > 0 ? styles.kpiCardAlert : styles.kpiCardSuccess}`}>
                                <div className={styles.kpiLabel}>
                                    <FiAlertTriangle />
                                    {t('logisticaPrinc1.kpi.criticas', 'Atraso Crítico (15d+)')}
                                </div>
                                <div className={`${styles.kpiValue} ${kpis.qtdCriticas > 0 ? styles.kpiValueAlert : styles.kpiValueSuccess}`}>
                                    {kpis.qtdCriticas}
                                </div>
                                <div className={styles.kpiSubtext}>
                                    {kpis.total > 0 ? `${((kpis.qtdCriticas / kpis.total) * 100).toFixed(1)}% do total` : ''}
                                </div>
                            </div>

                            <div className={`${styles.kpiCard} ${kpis.atrasoMedio >= 3 ? styles.kpiCardWarning : styles.kpiCardSuccess}`}>
                                <div className={styles.kpiLabel}>
                                    <FiClock />
                                    {t('logisticaPrinc1.kpi.atrasoMedio', 'Atraso Médio')}
                                </div>
                                <div className={`${styles.kpiValue} ${kpis.atrasoMedio >= 3 ? styles.kpiValueWarning : styles.kpiValueSuccess}`}>
                                    {kpis.atrasoMedio.toFixed(1)} {t('logisticaPrinc1.days', 'dias')}
                                </div>
                            </div>

                            <div className={`${styles.kpiCard} ${kpis.maxAtraso >= 15 ? styles.kpiCardAlert : styles.kpiCardSuccess}`}>
                                <div className={styles.kpiLabel}>
                                    <FiAlertTriangle />
                                    {t('logisticaPrinc1.kpi.maxAtraso', 'Maior Atraso')}
                                </div>
                                <div className={`${styles.kpiValue} ${kpis.maxAtraso >= 15 ? styles.kpiValueAlert : styles.kpiValueSuccess}`}>
                                    {kpis.maxAtraso} {t('logisticaPrinc1.days', 'dias')}
                                </div>
                            </div>
                        </div>

                        <div className={styles.sectionTitle}>
                            <FiClock />
                            {t('logisticaPrinc1.delayDistribution', 'Distribuição de Itens por Atraso')}
                        </div>
                        <div className={styles.delayGrid}>
                            {DELAY_BANDS.map(band => {
                                const data = bandCounts[band.key];
                                const isActive = activeBand === band.key;
                                return (
                                    <div
                                        key={band.key}
                                        className={`${styles.delayCard} ${isActive ? styles.delayCardActive : ''}`}
                                        onClick={() => setActiveBand(isActive ? 'all' : band.key)}
                                    >
                                        <div className={styles.delayBand}>
                                            <span className={`${styles.delayDot} ${styles[band.dot]}`} />
                                            <span className={styles.delayLabel}>{band.label}</span>
                                        </div>
                                        <div className={styles.delayCount}>{data.count}</div>
                                        <div className={styles.delayMeta}>
                                            <span>{items.length > 0 ? `${((data.count / items.length) * 100).toFixed(0)}%` : '0%'}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Novos Gráficos (Dashboard Customizado para Princ 1) */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                            <div className={styles.tableSection} style={{ marginTop: 0 }}>
                                <div className={styles.sectionTitle} style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', marginBottom: 0 }}>
                                    Top 10 Itens com Maior Atraso (Dias)
                                </div>
                                <div style={{ height: 350, padding: '1.5rem' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={topDelaysChartData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                            <XAxis type="number" />
                                            <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                                            <Tooltip
                                                formatter={(val: any, _name: any, props: any) => [`${val}`, `Dias de Atraso (${props.payload.desc})`]}
                                            />
                                            <Bar dataKey="dias" fill="#dc2626" radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className={styles.tableSection} style={{ marginTop: 0 }}>
                                <div className={styles.sectionTitle} style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', marginBottom: 0 }}>
                                    Top 10 Itens por Volume de Estoque (Atrasados 3d+)
                                </div>
                                <div style={{ height: 350, padding: '1.5rem' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={stockChartData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                            <XAxis type="number" />
                                            <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                                            <Tooltip
                                                formatter={(val: any, _name: any, props: any) => [`${val}`, `Estoque Físico (${props.payload.desc})`]}
                                            />
                                            <Bar dataKey="estoque" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        <div className={styles.tableSection}>
                            <div className={styles.tableHeader}>
                                <div className={styles.tableTitle}>
                                    <FiFileText />
                                    {t('logisticaPrinc1.detailTable', 'Detalhamento do Estoque Princ. 1')}
                                    <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#64748b' }}>
                                        ({filteredItems.length} {t('logisticaPrinc1.results', 'resultados')})
                                    </span>
                                </div>

                                <div className={styles.tableActions}>
                                    {activeBand !== 'all' && (
                                        <span className={styles.filterBadge} onClick={() => setActiveBand('all')}>
                                            {DELAY_BANDS.find(b => b.key === activeBand)?.label}
                                            <FiX />
                                        </span>
                                    )}

                                    <div style={{ position: 'relative' }}>
                                        <FiSearch style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                        <input
                                            className={styles.searchInput}
                                            style={{ paddingLeft: 32 }}
                                            placeholder={t('logisticaPrinc1.search', 'Buscar item, lote ou série...')}
                                            value={search}
                                            onChange={e => setSearch(e.target.value)}
                                        />
                                    </div>

                                    <button className={`${styles.exportBtn} ${styles.exportBtnExcel}`} onClick={handleExport}>
                                        <FiDownload />
                                        Excel
                                    </button>
                                </div>
                            </div>

                            <div className={styles.tableWrapper}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th onClick={() => handleSort('dias_atraso')} style={{ width: '90px' }}>
                                                {t('col.delay', 'Atraso')} <SortIcon field="dias_atraso" />
                                            </th>
                                            <th onClick={() => handleSort('numero_item')}>
                                                {t('col.item', 'Nº Item')} <SortIcon field="numero_item" />
                                            </th>
                                            <th onClick={() => handleSort('nome_item')}>
                                                {t('col.nome', 'Nome')} <SortIcon field="nome_item" />
                                            </th>
                                            <th onClick={() => handleSort('configuracao')}>
                                                {t('col.config', 'Config.')} <SortIcon field="configuracao" />
                                            </th>
                                            <th onClick={() => handleSort('estoque_fisico')} style={{ textAlign: 'right' }}>
                                                {t('col.stock', 'Estoque')} <SortIcon field="estoque_fisico" />
                                            </th>
                                            <th onClick={() => handleSort('deposito')}>
                                                {t('col.deposit', 'Depósito')} <SortIcon field="deposito" />
                                            </th>
                                            <th onClick={() => handleSort('localizacao')}>
                                                {t('col.local', 'Localização')} <SortIcon field="localizacao" />
                                            </th>
                                            <th onClick={() => handleSort('numero_lote')}>
                                                {t('col.batch', 'Lote')} <SortIcon field="numero_lote" />
                                            </th>
                                            <th onClick={() => handleSort('numero_serie')}>
                                                {t('col.serial', 'Série')} <SortIcon field="numero_serie" />
                                            </th>
                                            <th onClick={() => handleSort('data_entrada')}>
                                                {t('col.entryDate', 'Data Entr.')} <SortIcon field="data_entrada" />
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedItems.map(item => {
                                            const band = getDelayBand(Number(item.dias_atraso) || 0);
                                            return (
                                                <tr key={item.id} className={styles[band.row]}>
                                                    <td>
                                                        <span className={`${styles.delayBadge} ${styles[band.badge]}`}>
                                                            {item.dias_atraso}d
                                                        </span>
                                                    </td>
                                                    <td><strong>{item.numero_item}</strong></td>
                                                    <td>
                                                        <div style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.nome_item}>
                                                            {item.nome_item}
                                                        </div>
                                                    </td>
                                                    <td>{item.configuracao}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatNumber(Number(item.estoque_fisico || 0))}</td>
                                                    <td>{item.deposito}</td>
                                                    <td>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <FiMapPin style={{ opacity: 0.5 }} /> {item.localizacao}
                                                        </span>
                                                    </td>
                                                    <td>{item.numero_lote}</td>
                                                    <td>{item.numero_serie}</td>
                                                    <td>{formatDateFromISO(item.data_entrada)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: '0 0 8px 8px' }}>
                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                        Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)} de {filteredItems.length} registros
                                    </span>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            style={{ padding: '0.25rem 0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: currentPage === 1 ? '#f1f5f9' : '#fff', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', color: currentPage === 1 ? '#94a3b8' : '#334155' }}
                                        >
                                            Anterior
                                        </button>
                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages}
                                            style={{ padding: '0.25rem 0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: currentPage === totalPages ? '#f1f5f9' : '#fff', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', color: currentPage === totalPages ? '#94a3b8' : '#334155' }}
                                        >
                                            Próxima
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
