import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    FiPackage, FiDollarSign, FiAlertTriangle, FiClock, FiFileText, FiDownload, FiX, FiSearch,
    FiChevronUp, FiChevronDown, FiUser, FiCalendar, FiUploadCloud, FiUsers
} from 'react-icons/fi';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import PageHeader from '../../../shared/components/PageHeader';
import Skeleton from '../../../shared/components/Skeleton';
import {
    getLogisticaProposto,
    type LogisticaPropostoItem,
    type LogisticaPropostoResponse,
} from '../../../services/apiClient';
import { exportToExcel } from '../../../utils/exportExcel';
import { formatDateTimeShort } from '../../../shared/utils/dateUtils';
import styles from './PainelLogisticoPage.module.css';

type AgeBand = 'all' | 'ok' | 'warning' | 'alert' | 'critical' | 'emergency';
type SortField =
    | 'dias_desde_proposta'
    | 'canal_vendas'
    | 'roteiro_separacao'
    | 'data_hora'
    | 'ordem_venda'
    | 'conta_cliente'
    | 'nome_cliente'
    | 'numero_item'
    | 'filial'
    | 'tipo_destino'
    | 'localizacao'
    | 'valor_net'
    | 'cidade'
    | 'estado';
type SortDir = 'asc' | 'desc';

const AGE_BANDS: {
    key: Exclude<AgeBand, 'all'>;
    label: string;
    min: number;
    max: number;
    dot: string;
    badge: string;
    row: string;
}[] = [
        { key: 'ok', label: '0-2 dias', min: 0, max: 2, dot: 'delayDotGreen', badge: 'delayBadgeGreen', row: 'rowOk' },
        { key: 'warning', label: '3-7 dias', min: 3, max: 7, dot: 'delayDotYellow', badge: 'delayBadgeYellow', row: 'rowWarning' },
        { key: 'alert', label: '8-14 dias', min: 8, max: 14, dot: 'delayDotOrange', badge: 'delayBadgeOrange', row: 'rowAlert' },
        { key: 'critical', label: '15-30 dias', min: 15, max: 30, dot: 'delayDotRed', badge: 'delayBadgeRed', row: 'rowCritical' },
        { key: 'emergency', label: '30+ dias', min: 31, max: Infinity, dot: 'delayDotPurple', badge: 'delayBadgePurple', row: 'rowEmergency' },
    ];

function getAgeBand(days: number): typeof AGE_BANDS[number] {
    return AGE_BANDS.find((band) => days >= band.min && days <= band.max) || AGE_BANDS[0];
}

function formatBRL(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function wrapLabelLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
    const cleaned = text.trim();
    if (!cleaned) return ['—'];

    const words = cleaned.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (candidate.length <= maxCharsPerLine) {
            currentLine = candidate;
            continue;
        }

        if (currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            lines.push(word.slice(0, maxCharsPerLine));
            currentLine = word.slice(maxCharsPerLine);
        }

        if (lines.length === maxLines - 1) break;
    }

    if (currentLine) lines.push(currentLine);

    if (lines.length > maxLines) return lines.slice(0, maxLines);

    if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
        lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, maxCharsPerLine - 1))}…`;
    }

    return lines;
}

function WrappedClientTick(props: { x?: number; y?: number; payload?: { value?: string }; maxChars?: number }) {
    const x = props.x ?? 0;
    const y = props.y ?? 0;
    const maxChars = props.maxChars ?? 20;
    const rawValue = String(props.payload?.value ?? '');
    const lines = wrapLabelLines(rawValue, maxChars, 3);

    return (
        <text x={x} y={y} textAnchor="end" fill="#334155" fontSize={11}>
            {lines.map((line, index) => (
                <tspan key={`${line}-${index}`} x={x} dy={index === 0 ? 4 : 12}>
                    {line}
                </tspan>
            ))}
        </text>
    );
}

function getSortValue(item: LogisticaPropostoItem, field: SortField): string | number {
    switch (field) {
        case 'dias_desde_proposta':
            return Number(item.dias_desde_proposta || 0);
        case 'canal_vendas':
            return Number(item.canal_vendas || 0);
        case 'data_hora':
            return item.data_hora ? new Date(item.data_hora).getTime() : 0;
        case 'valor_net':
            return Number(item.valor_net || 0);
        case 'roteiro_separacao':
            return item.roteiro_separacao || '';
        case 'ordem_venda':
            return item.ordem_venda || '';
        case 'conta_cliente':
            return item.conta_cliente || '';
        case 'nome_cliente':
            return item.nome_cliente || '';
        case 'numero_item':
            return item.numero_item || '';
        case 'filial':
            return item.filial || '';
        case 'tipo_destino':
            return item.tipo_destino || '';
        case 'localizacao':
            return item.localizacao || '';
        case 'cidade':
            return item.cidade || '';
        case 'estado':
            return item.estado || '';
    }
}

export default function LogisticaPropostoDashboardPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [items, setItems] = useState<LogisticaPropostoItem[]>([]);
    const [uploadInfo, setUploadInfo] = useState<LogisticaPropostoResponse['uploadInfo']>(null);
    const [loading, setLoading] = useState(true);

    const [activeBand, setActiveBand] = useState<AgeBand>('all');
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState<SortField>('dias_desde_proposta');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getLogisticaProposto();
            setItems(data.items || []);
            setUploadInfo(data.uploadInfo || null);
        } catch (error) {
            console.error(error);
            toast.error(t('logisticaProposto.errorLoading', 'Erro ao carregar dados do faturamento proposto.'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const kpis = useMemo(() => {
        const total = items.length;
        const valorTotal = items.reduce((sum, item) => sum + Number(item.valor_net || 0), 0);
        const ovsUnicas = new Set(items.map((item) => item.ordem_venda).filter(Boolean)).size;
        const clientesUnicos = new Set(items.map((item) => item.conta_cliente || item.nome_cliente).filter(Boolean)).size;
        const estadosUnicos = new Set(items.map((item) => item.estado).filter(Boolean)).size;
        const idadeMedia = total > 0
            ? items.reduce((sum, item) => sum + Number(item.dias_desde_proposta || 0), 0) / total
            : 0;
        const criticos = items.filter((item) => Number(item.dias_desde_proposta || 0) >= 31).length;

        return {
            total,
            valorTotal,
            ovsUnicas,
            clientesUnicos,
            estadosUnicos,
            idadeMedia,
            criticos,
        };
    }, [items]);

    const bandCounts = useMemo(() => {
        const counts: Record<Exclude<AgeBand, 'all'>, { count: number; valorAbs: number }> = {
            ok: { count: 0, valorAbs: 0 },
            warning: { count: 0, valorAbs: 0 },
            alert: { count: 0, valorAbs: 0 },
            critical: { count: 0, valorAbs: 0 },
            emergency: { count: 0, valorAbs: 0 },
        };

        for (const item of items) {
            const days = Number(item.dias_desde_proposta || 0);
            const band = getAgeBand(days);
            counts[band.key].count++;
            counts[band.key].valorAbs += Math.abs(Number(item.valor_net || 0));
        }

        return counts;
    }, [items]);

    const topEstadosChartData = useMemo(() => {
        const grouped = new Map<string, { estado: string; valorAbs: number; count: number }>();

        for (const item of items) {
            const estado = item.estado || '—';
            const current = grouped.get(estado) ?? { estado, valorAbs: 0, count: 0 };
            current.valorAbs += Math.abs(Number(item.valor_net || 0));
            current.count += 1;
            grouped.set(estado, current);
        }

        return Array.from(grouped.values())
            .sort((a, b) => b.valorAbs - a.valorAbs)
            .slice(0, 10);
    }, [items]);

    const topClientesChartData = useMemo(() => {
        const grouped = new Map<string, { cliente: string; valorAbs: number; count: number }>();

        for (const item of items) {
            const cliente = item.nome_cliente || item.conta_cliente || '—';
            const current = grouped.get(cliente) ?? { cliente, valorAbs: 0, count: 0 };
            current.valorAbs += Math.abs(Number(item.valor_net || 0));
            current.count += 1;
            grouped.set(cliente, current);
        }

        return Array.from(grouped.values())
            .sort((a, b) => b.valorAbs - a.valorAbs)
            .slice(0, 5);
    }, [items]);

    const filteredItems = useMemo(() => {
        let result = [...items];

        if (activeBand !== 'all') {
            const band = AGE_BANDS.find((item) => item.key === activeBand);
            if (band) {
                result = result.filter((item) => {
                    const days = Number(item.dias_desde_proposta || 0);
                    return days >= band.min && days <= band.max;
                });
            }
        }

        if (search.trim()) {
            const query = search.toLowerCase();
            result = result.filter((item) =>
                (item.ordem_venda || '').toLowerCase().includes(query) ||
                (item.nome_cliente || '').toLowerCase().includes(query) ||
                (item.conta_cliente || '').toLowerCase().includes(query) ||
                (item.numero_item || '').toLowerCase().includes(query) ||
                (item.cidade || '').toLowerCase().includes(query) ||
                (item.estado || '').toLowerCase().includes(query)
            );
        }

        result.sort((a, b) => {
            const valueA = getSortValue(a, sortField);
            const valueB = getSortValue(b, sortField);

            if (typeof valueA === 'number' && typeof valueB === 'number') {
                if (valueA < valueB) return sortDir === 'asc' ? -1 : 1;
                if (valueA > valueB) return sortDir === 'asc' ? 1 : -1;
                return 0;
            }

            const compareResult = String(valueA).localeCompare(String(valueB), 'pt-BR', { sensitivity: 'base' });
            return sortDir === 'asc' ? compareResult : -compareResult;
        });

        return result;
    }, [items, activeBand, search, sortField, sortDir]);

    const handleSort = useCallback((field: SortField) => {
        if (sortField === field) {
            setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDir(field === 'dias_desde_proposta' ? 'desc' : 'asc');
        }
        setCurrentPage(1);
    }, [sortField]);

    useEffect(() => {
        setCurrentPage(1);
    }, [search, activeBand]);

    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredItems.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredItems, currentPage]);

    const handleExport = useCallback(() => {
        const data = filteredItems.map((item) => ({
            'Canal': item.canal_vendas ?? '',
            'Canal Descrição': item.canal_descricao,
            'Roteiro de Separação': item.roteiro_separacao,
            'Data/Hora': formatDateTimeShort(item.data_hora),
            'Ordem de Venda': item.ordem_venda,
            'Conta do Cliente': item.conta_cliente,
            'Nome do Cliente': item.nome_cliente,
            'Número do Item': item.numero_item,
            'Configuração': item.configuracao,
            'Filial': item.filial,
            'Tipo Destino': item.tipo_destino,
            'Localização': item.localizacao,
            'Valor NET': Number(item.valor_net || 0),
            'Cidade': item.cidade,
            'Estado': item.estado,
            'Dias desde Proposta': Number(item.dias_desde_proposta || 0),
        }));
        exportToExcel(data, 'Logistica_Proposto', 'painel-logistica-proposto');
    }, [filteredItems]);

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <FiChevronDown className={styles.sortIcon} />;
        return sortDir === 'asc'
            ? <FiChevronUp className={`${styles.sortIcon} ${styles.sortIconActive}`} />
            : <FiChevronDown className={`${styles.sortIcon} ${styles.sortIconActive}`} />;
    };

    const compactHeaderCellStyle = {
        whiteSpace: 'normal',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
        lineHeight: 1.15,
        padding: '0.5rem 0.35rem',
        fontSize: '0.72rem',
        textAlign: 'left',
    } as const;

    const compactBodyCellStyle = {
        whiteSpace: 'normal',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
        lineHeight: 1.15,
        padding: '0.45rem 0.35rem',
        fontSize: '0.72rem',
        textAlign: 'left',
        verticalAlign: 'top',
    } as const;

    const tableColumnWidths = ['5%', '4%', '6%', '8%', '7%', '7%', '14%', '8%', '12%', '6%', '6%', '8%', '5%', '4%'];

    return (
        <>
            <PageHeader
                title={t('logisticaProposto.title', 'Painel Faturamento Proposto')}
                subtitle={t('logisticaProposto.subtitle', 'Análise logística baseada no relatório HTML de faturamento proposto')}
            />

            <div className={styles.container}>
                <div className={styles.uploadInfoBar}>
                    {uploadInfo ? (
                        <div className={styles.uploadInfoMeta}>
                            <span className={styles.uploadInfoItem}>
                                <FiCalendar />
                                {formatDateTimeShort(uploadInfo.criadoEm)}
                            </span>
                            {(uploadInfo.uploadPorNome || uploadInfo.uploadPorEmail) && (
                                <span className={styles.uploadInfoItem}>
                                    <FiUser />
                                    {uploadInfo.uploadPorNome || uploadInfo.uploadPorEmail}
                                </span>
                            )}
                            <span className={styles.uploadInfoItem}>
                                <FiFileText />
                                {uploadInfo.totalRows} {t('logisticaProposto.rows', 'registros')}
                            </span>
                        </div>
                    ) : (
                        <span className={styles.uploadInfoEmpty}>
                            {t('logisticaProposto.noData', 'Nenhum dado carregado')}
                        </span>
                    )}
                    <button
                        className={styles.uploadLinkBtn}
                        onClick={() => navigate('/logistica/proposto/upload')}
                    >
                        <FiUploadCloud />
                        {t('logisticaProposto.uploadNew', 'Upload')}
                    </button>
                </div>

                {loading && (
                    <div className={styles.kpiGrid}>
                        {[1, 2, 3, 4, 5, 6].map((item) => (
                            <div key={item} className={styles.kpiCard}>
                                <Skeleton variant="text" width="60%" height={14} />
                                <Skeleton variant="text" width="80%" height={32} style={{ marginTop: 8 }} />
                            </div>
                        ))}
                    </div>
                )}

                {!loading && items.length === 0 && (
                    <div className={styles.emptyState}>
                        <FiPackage className={styles.emptyIcon} />
                        <p>{t('logisticaProposto.empty', 'Nenhum dado encontrado. Faça upload de um relatório HTML para começar.')}</p>
                    </div>
                )}

                {!loading && items.length > 0 && (
                    <>
                        <div className={styles.kpiGrid}>
                            <div className={styles.kpiCard}>
                                <div className={styles.kpiLabel}>
                                    <FiPackage />
                                    {t('logisticaProposto.kpi.totalRegistros', 'Total de Registros')}
                                </div>
                                <div className={styles.kpiValue}>{kpis.total}</div>
                            </div>

                            <div className={styles.kpiCard}>
                                <div className={styles.kpiLabel}>
                                    <FiDollarSign />
                                    {t('logisticaProposto.kpi.valorTotal', 'Valor Líquido Total')}
                                </div>
                                <div className={styles.kpiValue}>{formatBRL(kpis.valorTotal)}</div>
                            </div>

                            <div className={styles.kpiCard}>
                                <div className={styles.kpiLabel}>
                                    <FiFileText />
                                    {t('logisticaProposto.kpi.ovs', 'OVs Únicas')}
                                </div>
                                <div className={styles.kpiValue}>{kpis.ovsUnicas}</div>
                            </div>

                            <div className={styles.kpiCard}>
                                <div className={styles.kpiLabel}>
                                    <FiUsers />
                                    {t('logisticaProposto.kpi.clientes', 'Clientes Únicos')}
                                </div>
                                <div className={styles.kpiValue}>{kpis.clientesUnicos}</div>
                                <div className={styles.kpiSubtext}>{kpis.estadosUnicos} {t('logisticaProposto.states', 'estados')}</div>
                            </div>

                            <div className={`${styles.kpiCard} ${kpis.idadeMedia >= 16 ? styles.kpiCardWarning : styles.kpiCardSuccess}`}>
                                <div className={styles.kpiLabel}>
                                    <FiClock />
                                    {t('logisticaProposto.kpi.idadeMedia', 'Idade Média')}
                                </div>
                                <div className={`${styles.kpiValue} ${kpis.idadeMedia >= 16 ? styles.kpiValueWarning : styles.kpiValueSuccess}`}>
                                    {kpis.idadeMedia.toFixed(1)} {t('logisticaProposto.days', 'dias')}
                                </div>
                            </div>

                            <div className={`${styles.kpiCard} ${kpis.criticos > 0 ? styles.kpiCardAlert : styles.kpiCardSuccess}`}>
                                <div className={styles.kpiLabel}>
                                    <FiAlertTriangle />
                                    {t('logisticaProposto.kpi.criticos', 'Registros Críticos (31d+)')}
                                </div>
                                <div className={`${styles.kpiValue} ${kpis.criticos > 0 ? styles.kpiValueAlert : styles.kpiValueSuccess}`}>
                                    {kpis.criticos}
                                </div>
                            </div>
                        </div>

                        <div className={styles.sectionTitle}>
                            <FiClock />
                            {t('logisticaProposto.ageDistribution', 'Distribuição por Antiguidade')}
                        </div>
                        <div className={styles.delayGrid}>
                            {AGE_BANDS.map((band) => {
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
                                            <span className={styles.delayLabel}>{t(`logisticaProposto.band.${band.key}`, band.label)}</span>
                                        </div>
                                        <div className={styles.delayCount}>{data.count}</div>
                                        <div className={styles.delayMeta}>
                                            <span>{formatBRL(data.valorAbs)}</span>
                                            <span>{items.length > 0 ? `${((data.count / items.length) * 100).toFixed(0)}%` : '0%'}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                            <div className={styles.tableSection} style={{ marginTop: 0 }}>
                                <div className={styles.sectionTitle} style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', marginBottom: 0 }}>
                                    {t('logisticaProposto.chart.topStates', 'Top 10 Estados por Valor Absoluto')}
                                </div>
                                <div style={{ height: 350, padding: '1.5rem' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={topEstadosChartData} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                            <XAxis type="number" tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                                            <YAxis dataKey="estado" type="category" width={60} tick={{ fontSize: 12 }} />
                                            <Tooltip />
                                            <Bar dataKey="valorAbs" fill="#2563eb" radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className={styles.tableSection} style={{ marginTop: 0 }}>
                                <div className={styles.sectionTitle} style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', marginBottom: 0 }}>
                                    {t('logisticaProposto.chart.topClients', 'Top 5 Clientes por Valor Absoluto')}
                                </div>
                                <div style={{ height: 350, padding: '1.5rem' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={topClientesChartData} layout="vertical" margin={{ top: 0, right: 24, left: 12, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                            <XAxis type="number" tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                                            <YAxis dataKey="cliente" type="category" width={220} tick={<WrappedClientTick maxChars={20} />} />
                                            <Tooltip />
                                            <Bar dataKey="valorAbs" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        <div className={styles.tableSection}>
                            <div className={styles.tableHeader}>
                                <div className={styles.tableTitle}>
                                    <FiFileText />
                                    {t('logisticaProposto.detailTable', 'Detalhamento do Faturamento Proposto')}
                                    <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#64748b' }}>
                                        ({filteredItems.length} {t('logisticaProposto.results', 'resultados')})
                                    </span>
                                </div>

                                <div className={styles.tableActions}>
                                    {activeBand !== 'all' && (
                                        <span className={styles.filterBadge} onClick={() => setActiveBand('all')}>
                                            {t(`logisticaProposto.band.${activeBand}`, AGE_BANDS.find((band) => band.key === activeBand)?.label || '')}
                                            <FiX />
                                        </span>
                                    )}

                                    <div style={{ position: 'relative' }}>
                                        <FiSearch style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                        <input
                                            className={styles.searchInput}
                                            style={{ paddingLeft: 32 }}
                                            placeholder={t('logisticaProposto.search', 'Buscar OV, cliente, item, cidade ou UF...')}
                                            value={search}
                                            onChange={(event) => setSearch(event.target.value)}
                                        />
                                    </div>

                                    <button className={`${styles.exportBtn} ${styles.exportBtnExcel}`} onClick={handleExport}>
                                        <FiDownload />
                                        Excel
                                    </button>
                                </div>
                            </div>

                            <div className={styles.tableWrapper} style={{ overflowX: 'hidden' }}>
                                <table className={styles.table} style={{ tableLayout: 'fixed', width: '100%' }}>
                                    <colgroup>
                                        {tableColumnWidths.map((width, index) => (
                                            <col key={`${width}-${index}`} style={{ width }} />
                                        ))}
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th onClick={() => handleSort('dias_desde_proposta')} style={compactHeaderCellStyle}>
                                                {t('logisticaProposto.col.age', 'Idade')} <SortIcon field="dias_desde_proposta" />
                                            </th>
                                            <th onClick={() => handleSort('canal_vendas')} style={compactHeaderCellStyle}>
                                                {t('logisticaProposto.col.channel', 'Canal')} <SortIcon field="canal_vendas" />
                                            </th>
                                            <th onClick={() => handleSort('roteiro_separacao')} style={compactHeaderCellStyle}>
                                                {t('logisticaProposto.col.roteiro', 'Roteiro')} <SortIcon field="roteiro_separacao" />
                                            </th>
                                            <th onClick={() => handleSort('data_hora')} style={compactHeaderCellStyle}>
                                                {t('logisticaProposto.col.dateTime', 'Data/Hora')} <SortIcon field="data_hora" />
                                            </th>
                                            <th onClick={() => handleSort('ordem_venda')} style={compactHeaderCellStyle}>
                                                {t('logisticaProposto.col.ov', 'OV')} <SortIcon field="ordem_venda" />
                                            </th>
                                            <th onClick={() => handleSort('conta_cliente')} style={compactHeaderCellStyle}>
                                                {t('logisticaProposto.col.account', 'Conta')} <SortIcon field="conta_cliente" />
                                            </th>
                                            <th onClick={() => handleSort('nome_cliente')} style={compactHeaderCellStyle}>
                                                {t('logisticaProposto.col.client', 'Cliente')} <SortIcon field="nome_cliente" />
                                            </th>
                                            <th onClick={() => handleSort('numero_item')} style={compactHeaderCellStyle}>
                                                {t('logisticaProposto.col.item', 'Item')} <SortIcon field="numero_item" />
                                            </th>
                                            <th onClick={() => handleSort('filial')} style={compactHeaderCellStyle}>
                                                {t('logisticaProposto.col.branch', 'Filial')} <SortIcon field="filial" />
                                            </th>
                                            <th onClick={() => handleSort('tipo_destino')} style={compactHeaderCellStyle}>
                                                {t('logisticaProposto.col.destinationType', 'Tipo')} <SortIcon field="tipo_destino" />
                                            </th>
                                            <th onClick={() => handleSort('localizacao')} style={compactHeaderCellStyle}>
                                                {t('logisticaProposto.col.location', 'Localização')} <SortIcon field="localizacao" />
                                            </th>
                                            <th onClick={() => handleSort('valor_net')} style={compactHeaderCellStyle}>
                                                {t('logisticaProposto.col.value', 'Valor NET')} <SortIcon field="valor_net" />
                                            </th>
                                            <th onClick={() => handleSort('cidade')} style={compactHeaderCellStyle}>
                                                {t('logisticaProposto.col.city', 'Cidade')} <SortIcon field="cidade" />
                                            </th>
                                            <th onClick={() => handleSort('estado')} style={compactHeaderCellStyle}>
                                                {t('logisticaProposto.col.state', 'UF')} <SortIcon field="estado" />
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedItems.map((item) => {
                                            const band = getAgeBand(Number(item.dias_desde_proposta || 0));
                                            return (
                                                <tr key={item.id} className={styles[band.row]}>
                                                    <td style={compactBodyCellStyle}>
                                                        <span className={`${styles.delayBadge} ${styles[band.badge]}`}>
                                                            {item.dias_desde_proposta}d
                                                        </span>
                                                    </td>
                                                    <td style={compactBodyCellStyle}>{item.canal_vendas ?? '—'}</td>
                                                    <td style={compactBodyCellStyle}>{item.roteiro_separacao}</td>
                                                    <td style={compactBodyCellStyle}>{formatDateTimeShort(item.data_hora)}</td>
                                                    <td style={compactBodyCellStyle}><strong>{item.ordem_venda}</strong></td>
                                                    <td style={compactBodyCellStyle}>{item.conta_cliente}</td>
                                                    <td style={compactBodyCellStyle} title={item.nome_cliente}>{item.nome_cliente}</td>
                                                    <td style={compactBodyCellStyle}>{item.numero_item}</td>
                                                    <td style={compactBodyCellStyle} title={item.filial}>{item.filial}</td>
                                                    <td style={compactBodyCellStyle}>{item.tipo_destino}</td>
                                                    <td style={compactBodyCellStyle}>{item.localizacao}</td>
                                                    <td style={compactBodyCellStyle}>{formatBRL(Number(item.valor_net || 0))}</td>
                                                    <td style={compactBodyCellStyle}>{item.cidade}</td>
                                                    <td style={compactBodyCellStyle}>{item.estado}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {totalPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: '0 0 8px 8px' }}>
                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                        {t('logisticaProposto.pagination.showing', 'Mostrando {{from}} a {{to}} de {{total}} registros', {
                                            from: (currentPage - 1) * ITEMS_PER_PAGE + 1,
                                            to: Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length),
                                            total: filteredItems.length,
                                        })}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <button
                                            className={styles.cancelBtn}
                                            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                                            disabled={currentPage === 1}
                                        >
                                            {t('common.previous', 'Anterior')}
                                        </button>
                                        <span style={{ fontSize: '0.85rem', color: '#334155' }}>
                                            {t('logisticaProposto.pagination.pageOf', 'Página {{page}} de {{total}}', {
                                                page: currentPage,
                                                total: totalPages,
                                            })}
                                        </span>
                                        <button
                                            className={styles.cancelBtn}
                                            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                                            disabled={currentPage === totalPages}
                                        >
                                            {t('common.next', 'Próxima')}
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
