// src/features/logistica/pages/PainelLogisticoPage.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    FiPackage, FiDollarSign, FiAlertTriangle,
    FiTruck, FiClock, FiFileText, FiDownload, FiX, FiSearch,
    FiChevronUp, FiChevronDown, FiUser, FiCalendar, FiUploadCloud
} from 'react-icons/fi';
import PageHeader from '../../../shared/components/PageHeader';
import Skeleton from '../../../shared/components/Skeleton';
import {
    getNotasEmbarque,
    type NotaEmbarque,
    type NotasEmbarqueResponse,
} from '../../../services/apiClient';
import { exportToExcel } from '../../../utils/exportExcel';
import { formatDateTimeShort } from '../../../shared/utils/dateUtils';
import styles from './PainelLogisticoPage.module.css';

// ── Types ──
type DelayBand = 'all' | 'ok' | 'warning' | 'alert' | 'critical' | 'emergency';
type SortField = 'ordem_venda' | 'nota_fiscal' | 'nome_cliente' | 'transportadora' | 'valor_net' | 'peso_bruto' | 'qtd_volume' | 'data_emissao' | 'tipo_operacao' | 'tipo_frete' | 'dias_atraso';
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

// Parse CSV function removed in favor of XLSX.read()


// Format BRL currency
function formatBRL(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

export default function PainelLogisticoPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    // Data
    const [items, setItems] = useState<NotaEmbarque[]>([]);
    const [uploadInfo, setUploadInfo] = useState<NotasEmbarqueResponse['uploadInfo']>(null);
    const [loading, setLoading] = useState(true);

    // Filters & Sort
    const [activeBand, setActiveBand] = useState<DelayBand>('all');
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState<SortField>('dias_atraso');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    // ── Fetch Data ──
    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getNotasEmbarque();
            setItems(data.items || []);
            setUploadInfo(data.uploadInfo || null);
        } catch (err) {
            console.error(err);
            toast.error(t('logisticaPainel.errorLoading', 'Erro ao carregar notas.'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ── KPI Calculations ──
    const kpis = useMemo(() => {
        const total = items.length;
        const valorTotal = items.reduce((s, i) => s + Number(i.valor_net || 0), 0);
        const pesoTotal = items.reduce((s, i) => s + Number(i.peso_bruto || 0), 0);
        const atrasadas = items.filter(i => Number(i.dias_atraso) >= 3);
        const qtdAtrasadas = atrasadas.length;
        const valorRisco = atrasadas.reduce((s, i) => s + Number(i.valor_net || 0), 0);
        const atrasoMedio = total > 0 ? items.reduce((s, i) => s + Number(i.dias_atraso || 0), 0) / total : 0;

        return { total, valorTotal, pesoTotal, qtdAtrasadas, valorRisco, atrasoMedio };
    }, [items]);

    // ── Delay Distribution ──
    const bandCounts = useMemo(() => {
        const counts: Record<string, { count: number; valor: number }> = {};
        for (const b of DELAY_BANDS) {
            counts[b.key] = { count: 0, valor: 0 };
        }
        for (const item of items) {
            const dias = Number(item.dias_atraso) || 0;
            const band = getDelayBand(dias);
            counts[band.key].count++;
            counts[band.key].valor += Number(item.valor_net || 0);
        }
        return counts;
    }, [items]);

    // ── Filtered & Sorted Items ──
    const filteredItems = useMemo(() => {
        let result = [...items];

        // Filter by band
        if (activeBand !== 'all') {
            const band = DELAY_BANDS.find(b => b.key === activeBand);
            if (band) {
                result = result.filter(i => {
                    const d = Number(i.dias_atraso) || 0;
                    return d >= band.min && d <= band.max;
                });
            }
        }

        // Search filter
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(i =>
                (i.ordem_venda || '').toLowerCase().includes(q) ||
                (i.nome_cliente || '').toLowerCase().includes(q) ||
                (i.nota_fiscal || '').toLowerCase().includes(q) ||
                (i.transportadora || '').toLowerCase().includes(q)
            );
        }

        // Sort
        result.sort((a, b) => {
            let va: string | number = (a as any)[sortField] ?? '';
            let vb: string | number = (b as any)[sortField] ?? '';

            // Numeric fields
            if (['valor_net', 'peso_bruto', 'qtd_volume', 'dias_atraso'].includes(sortField)) {
                va = Number(va) || 0;
                vb = Number(vb) || 0;
            }

            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [items, activeBand, search, sortField, sortDir]);

    // ── Sort handler ──
    const handleSort = useCallback((field: SortField) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir(field === 'dias_atraso' ? 'desc' : 'asc');
        }
    }, [sortField]);

    // ── Export ──
    const handleExport = useCallback(() => {
        const data = filteredItems.map(i => ({
            'Ordem de Venda': i.ordem_venda,
            'Nota Fiscal': i.nota_fiscal,
            'Cliente': i.nome_cliente,
            'Transportadora': i.transportadora,
            'Valor NET': Number(i.valor_net || 0),
            'Peso Bruto': Number(i.peso_bruto || 0),
            'Volumes': Number(i.qtd_volume || 0),
            'Data Emissão': formatDateFromISO(i.data_emissao),
            'Tipo Operação': i.tipo_operacao,
            'Tipo Frete': i.tipo_frete,
            'Condições Entrega': i.condicoes_entrega,
            'Dias em Atraso': Number(i.dias_atraso || 0),
        }));
        exportToExcel(data, 'Notas Embarque', 'painel-logistico');
    }, [filteredItems]);

    // ── Render Sort Icon ──
    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <FiChevronDown className={styles.sortIcon} />;
        return sortDir === 'asc'
            ? <FiChevronUp className={`${styles.sortIcon} ${styles.sortIconActive}`} />
            : <FiChevronDown className={`${styles.sortIcon} ${styles.sortIconActive}`} />;
    };

    return (
        <>
            <PageHeader
                title={t('logisticaPainel.title', 'Painel Logístico')}
                subtitle={t('logisticaPainel.subtitle', 'Gestão de notas de embarque e análise de atrasos')}
            />

            <div className={styles.container}>
                {/* ── Upload Info Bar ── */}
                <div className={styles.uploadInfoBar}>
                    {uploadInfo ? (
                        <div className={styles.uploadInfoMeta}>
                            <span className={styles.uploadInfoItem}>
                                <FiCalendar />
                                {formatDateTimeShort(uploadInfo.uploadedAt)}
                            </span>
                            {uploadInfo.uploaderName && (
                                <span className={styles.uploadInfoItem}>
                                    <FiUser />
                                    {uploadInfo.uploaderName}
                                </span>
                            )}
                            <span className={styles.uploadInfoItem}>
                                <FiFileText />
                                {uploadInfo.totalRows} {t('logisticaPainel.rows', 'notas')}
                            </span>
                        </div>
                    ) : (
                        <span className={styles.uploadInfoEmpty}>
                            {t('logisticaPainel.noData', 'Nenhum dado carregado')}
                        </span>
                    )}
                    <button
                        className={styles.uploadLinkBtn}
                        onClick={() => navigate('/logistica/notas-upload')}
                    >
                        <FiUploadCloud />
                        {t('logisticaPainel.uploadNew', 'Upload')}
                    </button>
                </div>

                {/* Loading State */}
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

                {/* Empty State */}
                {!loading && items.length === 0 && (
                    <div className={styles.emptyState}>
                        <FiPackage className={styles.emptyIcon} />
                        <p>{t('logisticaPainel.empty', 'Nenhuma nota de embarque carregada. Faça upload de um arquivo Excel/CSV para começar.')}</p>
                    </div>
                )}

                {/* ── Dashboard Content ── */}
                {!loading && items.length > 0 && (
                    <>
                        {/* KPI Cards */}
                        <div className={styles.kpiGrid}>
                            <div className={styles.kpiCard}>
                                <div className={styles.kpiLabel}>
                                    <FiPackage />
                                    {t('logisticaPainel.kpi.totalNotas', 'Total de Notas')}
                                </div>
                                <div className={styles.kpiValue}>{kpis.total}</div>
                            </div>

                            <div className={styles.kpiCard}>
                                <div className={styles.kpiLabel}>
                                    <FiDollarSign />
                                    {t('logisticaPainel.kpi.valorTotal', 'Valor Total (NET)')}
                                </div>
                                <div className={styles.kpiValue}>{formatBRL(kpis.valorTotal)}</div>
                            </div>

                            <div className={styles.kpiCard}>
                                <div className={styles.kpiLabel}>
                                    <FiTruck />
                                    {t('logisticaPainel.kpi.pesoTotal', 'Peso Total')}
                                </div>
                                <div className={styles.kpiValue}>{formatNumber(kpis.pesoTotal)} kg</div>
                            </div>

                            <div className={`${styles.kpiCard} ${kpis.qtdAtrasadas > 0 ? styles.kpiCardAlert : styles.kpiCardSuccess}`}>
                                <div className={styles.kpiLabel}>
                                    <FiAlertTriangle />
                                    {t('logisticaPainel.kpi.atrasadas', 'Notas em Atraso (3d+)')}
                                </div>
                                <div className={`${styles.kpiValue} ${kpis.qtdAtrasadas > 0 ? styles.kpiValueAlert : styles.kpiValueSuccess}`}>
                                    {kpis.qtdAtrasadas}
                                </div>
                                <div className={styles.kpiSubtext}>
                                    {kpis.total > 0 ? `${((kpis.qtdAtrasadas / kpis.total) * 100).toFixed(1)}% do total` : ''}
                                </div>
                            </div>

                            <div className={`${styles.kpiCard} ${kpis.valorRisco > 0 ? styles.kpiCardAlert : styles.kpiCardSuccess}`}>
                                <div className={styles.kpiLabel}>
                                    <FiDollarSign />
                                    {t('logisticaPainel.kpi.valorRisco', 'Valor em Risco')}
                                </div>
                                <div className={`${styles.kpiValue} ${kpis.valorRisco > 0 ? styles.kpiValueAlert : styles.kpiValueSuccess}`}>
                                    {formatBRL(kpis.valorRisco)}
                                </div>
                            </div>

                            <div className={`${styles.kpiCard} ${kpis.atrasoMedio >= 3 ? styles.kpiCardWarning : styles.kpiCardSuccess}`}>
                                <div className={styles.kpiLabel}>
                                    <FiClock />
                                    {t('logisticaPainel.kpi.atrasoMedio', 'Atraso Médio')}
                                </div>
                                <div className={`${styles.kpiValue} ${kpis.atrasoMedio >= 3 ? styles.kpiValueWarning : styles.kpiValueSuccess}`}>
                                    {kpis.atrasoMedio.toFixed(1)} {t('logisticaPainel.days', 'dias')}
                                </div>
                            </div>
                        </div>

                        {/* Delay Distribution */}
                        <div className={styles.sectionTitle}>
                            <FiClock />
                            {t('logisticaPainel.delayDistribution', 'Distribuição por Atraso')}
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
                                            <span>{formatBRL(data.valor)}</span>
                                            <span>{items.length > 0 ? `${((data.count / items.length) * 100).toFixed(0)}%` : '0%'}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Detail Table */}
                        <div className={styles.tableSection}>
                            <div className={styles.tableHeader}>
                                <div className={styles.tableTitle}>
                                    <FiFileText />
                                    {t('logisticaPainel.detailTable', 'Detalhamento das Notas')}
                                    <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#64748b' }}>
                                        ({filteredItems.length} {t('logisticaPainel.results', 'resultados')})
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
                                            placeholder={t('logisticaPainel.search', 'Buscar...')}
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
                                            <th onClick={() => handleSort('dias_atraso')}>
                                                {t('logisticaPainel.col.delay', 'Atraso')} <SortIcon field="dias_atraso" />
                                            </th>
                                            <th onClick={() => handleSort('ordem_venda')}>
                                                {t('logisticaPainel.col.ov', 'OV')} <SortIcon field="ordem_venda" />
                                            </th>
                                            <th onClick={() => handleSort('nota_fiscal')}>
                                                {t('logisticaPainel.col.nf', 'NF')} <SortIcon field="nota_fiscal" />
                                            </th>
                                            <th onClick={() => handleSort('nome_cliente')}>
                                                {t('logisticaPainel.col.client', 'Cliente')} <SortIcon field="nome_cliente" />
                                            </th>
                                            <th onClick={() => handleSort('transportadora')}>
                                                {t('logisticaPainel.col.carrier', 'Transportadora')} <SortIcon field="transportadora" />
                                            </th>
                                            <th onClick={() => handleSort('valor_net')}>
                                                {t('logisticaPainel.col.value', 'Valor NET')} <SortIcon field="valor_net" />
                                            </th>
                                            <th onClick={() => handleSort('peso_bruto')}>
                                                {t('logisticaPainel.col.weight', 'Peso')} <SortIcon field="peso_bruto" />
                                            </th>
                                            <th onClick={() => handleSort('qtd_volume')}>
                                                {t('logisticaPainel.col.volumes', 'Vol.')} <SortIcon field="qtd_volume" />
                                            </th>
                                            <th onClick={() => handleSort('data_emissao')}>
                                                {t('logisticaPainel.col.date', 'Data')} <SortIcon field="data_emissao" />
                                            </th>
                                            <th onClick={() => handleSort('tipo_operacao')}>
                                                {t('logisticaPainel.col.operation', 'Operação')} <SortIcon field="tipo_operacao" />
                                            </th>
                                            <th onClick={() => handleSort('tipo_frete')}>
                                                {t('logisticaPainel.col.freight', 'Frete')} <SortIcon field="tipo_frete" />
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredItems.map(item => {
                                            const band = getDelayBand(Number(item.dias_atraso) || 0);
                                            return (
                                                <tr key={item.id} className={styles[band.row]}>
                                                    <td>
                                                        <span className={`${styles.delayBadge} ${styles[band.badge]}`}>
                                                            {item.dias_atraso}d
                                                        </span>
                                                    </td>
                                                    <td>{item.ordem_venda}</td>
                                                    <td><strong>{item.nota_fiscal}</strong></td>
                                                    <td>{item.nome_cliente}</td>
                                                    <td>{item.transportadora}</td>
                                                    <td style={{ textAlign: 'right' }}>{formatBRL(Number(item.valor_net || 0))}</td>
                                                    <td style={{ textAlign: 'right' }}>{formatNumber(Number(item.peso_bruto || 0))} kg</td>
                                                    <td style={{ textAlign: 'center' }}>{item.qtd_volume}</td>
                                                    <td>{formatDateFromISO(item.data_emissao)}</td>
                                                    <td>{item.tipo_operacao}</td>
                                                    <td>{item.tipo_frete}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
