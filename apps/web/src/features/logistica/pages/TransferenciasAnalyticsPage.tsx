// src/features/logistica/pages/TransferenciasAnalyticsPage.tsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FixedSizeList } from 'react-window';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend,
} from 'recharts';
import { FiUsers, FiRepeat, FiPackage, FiAlertTriangle, FiArrowDown, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { PageHeader, Modal, Badge } from '../../../shared/components';
import { getTransferenciasAnalytics, getTransferenciasDetalhes, getTransferenciasColaboradorAnalytics } from '../../../services/apiClient';
import type { TransferenciaDetalhe } from '../../../services/apiClient';
import type { TransferenciasAnalytics, ColaboradorDesempenho, ColaboradorAnalytics } from '@spiraview/shared';
import { formatDate, formatDateTimeShort } from '../../../shared/utils/dateUtils';
import styles from './TransferenciasAnalyticsPage.module.css';

const TIPO_COLORS: Record<string, string> = {
    transferencia_princ: '#3b82f6',
    consumo: '#10b981',
    manual: '#f59e0b',
    estorno: '#ef4444',
    nf: '#8b5cf6',
    outro: '#94a3b8',
};

const TIPO_LABELS: Record<string, string> = {
    transferencia_princ: 'Transf. PRINC',
    consumo: 'Consumo',
    manual: 'Manual',
    estorno: 'Estorno',
    nf: 'Nota Fiscal',
    outro: 'Outro',
};

type SortKey = 'total' | 'transferenciasPrinc' | 'consumos' | 'manuais' | 'estornos' | 'percentualEstornos';

interface SortIconProps {
    col: SortKey;
    sortKey: SortKey;
    sortDir: 'asc' | 'desc';
}

function SortIcon({ col, sortKey, sortDir }: SortIconProps) {
    return (
        <span className={styles.sortIcon} style={{ opacity: sortKey === col ? 1 : 0.3 }}>
            {sortKey === col && sortDir === 'asc' ? '▲' : '▼'}
        </span>
    );
}

const PAGE_SIZE = 50;

export default function TransferenciasAnalyticsPage() {
    const { t } = useTranslation();
    const now = useMemo(() => new Date(), []);
    const [mes, setMes] = useState(now.getMonth() + 1);
    const [ano, setAno] = useState(now.getFullYear());
    const [dia, setDia] = useState(0); // 0 = Todos
    const [data, setData] = useState<TransferenciasAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [sortKey, setSortKey] = useState<SortKey>('total');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    // Detalhes
    const [selectedColaborador, setSelectedColaborador] = useState<string | null>(null);
    const [detalhes, setDetalhes] = useState<TransferenciaDetalhe[]>([]);
    const [totalDetalhes, setTotalDetalhes] = useState(0);
    const [loadingDetalhes, setLoadingDetalhes] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [detalhesPagina, setDetalhesPagina] = useState(1);
    const [detalhesTotalPages, setDetalhesTotalPages] = useState(1);

    // Análise de colaborador (gráficos)
    const [colaboradorAnalytics, setColaboradorAnalytics] = useState<ColaboradorAnalytics | null>(null);
    const [loadingAnalytics, setLoadingAnalytics] = useState(false);

    const abortRef = useRef<AbortController | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getTransferenciasAnalytics(mes, ano, dia);
            setData(res);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [mes, ano, dia]);

    useEffect(() => { load(); }, [load]);

    const loadDetalhes = useCallback(async (nome: string, page: number) => {
        setLoadingDetalhes(true);
        try {
            const res = await getTransferenciasDetalhes(mes, ano, nome, dia, page, PAGE_SIZE);
            setDetalhes(res.items);
            setTotalDetalhes(res.total || 0);
            setDetalhesTotalPages(res.totalPages || 1);
        } catch (error) {
            console.error('Erro ao carregar detalhes:', error);
        } finally {
            setLoadingDetalhes(false);
        }
    }, [mes, ano, dia]);

    const handleColaboradorClick = useCallback(async (nome: string) => {
        abortRef.current?.abort();
        abortRef.current = new AbortController();

        setSelectedColaborador(nome);
        setShowModal(true);
        setDetalhesPagina(1);
        setLoadingAnalytics(true);
        loadDetalhes(nome, 1);
        try {
            const res = await getTransferenciasColaboradorAnalytics(nome, mes, ano, dia > 0 ? dia : undefined);
            setColaboradorAnalytics(res);
        } catch (error) {
            console.error('Erro ao carregar análise de colaborador:', error);
        } finally {
            setLoadingAnalytics(false);
        }
    }, [loadDetalhes, mes, ano, dia]);

    const handleNextPage = useCallback(() => {
        if (detalhesPagina < detalhesTotalPages && selectedColaborador) {
            const nextPage = detalhesPagina + 1;
            setDetalhesPagina(nextPage);
            loadDetalhes(selectedColaborador, nextPage);
        }
    }, [detalhesPagina, detalhesTotalPages, selectedColaborador, loadDetalhes]);

    const handlePrevPage = useCallback(() => {
        if (detalhesPagina > 1 && selectedColaborador) {
            const prevPage = detalhesPagina - 1;
            setDetalhesPagina(prevPage);
            loadDetalhes(selectedColaborador, prevPage);
        }
    }, [detalhesPagina, selectedColaborador, loadDetalhes]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    const sortedColaboradores = useMemo(() => {
        if (!data) return [];
        return [...data.porColaborador].sort((a, b) => {
            const mult = sortDir === 'desc' ? -1 : 1;
            return mult * (a[sortKey] - b[sortKey]);
        });
    }, [data, sortKey, sortDir]);

    // Flatten porTipo nested object for Recharts compatibility
    const volumeDiarioFlat = useMemo(() => {
        return data?.volumeDiario.map(d => ({
            data: d.data,
            total: d.total,
            transferencia_princ: d.porTipo['transferencia_princ'] || 0,
            consumo: d.porTipo['consumo'] || 0,
            manual: d.porTipo['manual'] || 0,
            estorno: d.porTipo['estorno'] || 0,
            nf: d.porTipo['nf'] || 0,
            outro: d.porTipo['outro'] || 0,
        })) ?? [];
    }, [data]);

    const maxTotal = useMemo(() => {
        return sortedColaboradores.length > 0
            ? Math.max(...sortedColaboradores.map(c => c.total))
            : 1;
    }, [sortedColaboradores]);

    const pieData = useMemo(() => {
        if (!data) return [];
        return Object.entries(data.resumo.porTipo)
            .filter(([, v]) => v > 0)
            .map(([key, value]) => ({
                name: TIPO_LABELS[key] || key,
                value,
                color: TIPO_COLORS[key] || '#94a3b8',
            }));
    }, [data]);

    const tipos: (keyof typeof TIPO_COLORS)[] = ['transferencia_princ', 'consumo', 'manual', 'estorno', 'nf', 'outro'];

    const colaboradorVolumeDiarioFlat = useMemo(() => {
        if (!colaboradorAnalytics) return [];
        return colaboradorAnalytics.volumeDiario.map(d => ({
            data: d.data,
            total: d.total,
            transferencia_princ: d.porTipo['transferencia_princ'] || 0,
            consumo: d.porTipo['consumo'] || 0,
            manual: d.porTipo['manual'] || 0,
            estorno: d.porTipo['estorno'] || 0,
            nf: d.porTipo['nf'] || 0,
            outro: d.porTipo['outro'] || 0,
        }));
    }, [colaboradorAnalytics]);

    const meses = useMemo(() => [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ], []);

    const anos = useMemo(() => Array.from({ length: 4 }, (_, i) => now.getFullYear() - i), [now]);

    return (
        <>
            <PageHeader
                title={t('logisticaTransferencias.analytics.title', 'Análise de Transferências')}
                subtitle={t('logisticaTransferencias.analytics.subtitle', 'Movimentações de estoque por período e colaborador')}
            />

            {/* Filter */}
            <div className={styles.filterBar}>
                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>
                        <FiRepeat size={14} className={styles.filterIcon} />
                        {t('logisticaTransferencias.ano', 'Ano')}
                    </label>
                    <select
                        className={styles.filterSelect}
                        value={ano}
                        onChange={e => {
                            setAno(Number(e.target.value));
                            setDia(0); // Reset day when changing year
                        }}
                    >
                        {anos.map(a => (
                            <option key={a} value={a}>{a}</option>
                        ))}
                    </select>
                </div>

                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>
                        <FiPackage size={14} className={styles.filterIcon} />
                        {t('logisticaTransferencias.mes', 'Mês')}
                    </label>
                    <select
                        className={styles.filterSelect}
                        value={mes}
                        onChange={e => {
                            setMes(Number(e.target.value));
                            setDia(0); // Reset day when changing month
                        }}
                    >
                        {meses.map((m, i) => (
                            <option key={i} value={i + 1}>{m}</option>
                        ))}
                    </select>
                </div>

                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>
                        <FiArrowDown size={14} className={styles.filterIcon} />
                        {t('logisticaTransferencias.dia', 'Dia')}
                    </label>
                    <select
                        className={styles.filterSelect}
                        value={dia}
                        onChange={e => setDia(Number(e.target.value))}
                    >
                        <option value={0}>{t('common.all', 'Todos')}</option>
                        {Array.from({ length: new Date(ano, mes, 0).getDate() }, (_, i) => i + 1).map(d => (
                            <option key={d} value={d}>{String(d).padStart(2, '0')}</option>
                        ))}
                    </select>
                </div>

                {dia > 0 && (
                    <button 
                        className={styles.clearFilter}
                        onClick={() => setDia(0)}
                        title={t('common.all', 'Ver Mês Inteiro')}
                    >
                        {t('common.all', 'Ver Mês Inteiro')}
                    </button>
                )}
            </div>

            {loading && (
                <div className={styles.loading}>
                    {t('common.loading', 'Carregando...')}
                </div>
            )}

            {!loading && !data && (
                <div className={styles.empty}>
                    {t('logisticaTransferencias.analytics.noData', 'Nenhum dado encontrado para o período.')}
                </div>
            )}

            {!loading && data && (
                <div className={styles.content}>
                    {/* Summary cards */}
                    <div className={styles.cards}>
                        <div className={styles.card}>
                            <div className={`${styles.cardIcon} ${styles.iconTotal}`}>
                                <FiRepeat size={24} />
                            </div>
                            <div className={styles.cardBody}>
                                <span className={styles.cardLabel}>{t('logisticaTransferencias.total', 'Total')}</span>
                                <span className={styles.cardValue}>{data.resumo.totalMovimentacoes.toLocaleString('pt-BR')}</span>
                            </div>
                        </div>

                        <div className={styles.card}>
                            <div className={`${styles.cardIcon} ${styles.iconTransf}`}>
                                <FiPackage size={24} />
                            </div>
                            <div className={styles.cardBody}>
                                <span className={styles.cardLabel}>Transf. PRINC</span>
                                <span className={styles.cardValue}>{(data.resumo.porTipo['transferencia_princ'] || 0).toLocaleString('pt-BR')}</span>
                            </div>
                        </div>

                        <div className={styles.card}>
                            <div className={`${styles.cardIcon} ${styles.iconConsumo}`}>
                                <FiArrowDown size={24} />
                            </div>
                            <div className={styles.cardBody}>
                                <span className={styles.cardLabel}>Consumos</span>
                                <span className={styles.cardValue}>{(data.resumo.porTipo['consumo'] || 0).toLocaleString('pt-BR')}</span>
                            </div>
                        </div>

                        <div className={styles.card}>
                            <div className={`${styles.cardIcon} ${styles.iconEstorno}`}>
                                <FiAlertTriangle size={24} />
                            </div>
                            <div className={styles.cardBody}>
                                <span className={styles.cardLabel}>Estornos</span>
                                <span className={styles.cardValue}>{(data.resumo.porTipo['estorno'] || 0).toLocaleString('pt-BR')}</span>
                            </div>
                        </div>

                        <div className={styles.card}>
                            <div className={`${styles.cardIcon} ${styles.iconUsers}`}>
                                <FiUsers size={24} />
                            </div>
                            <div className={styles.cardBody}>
                                <span className={styles.cardLabel}>{t('logisticaTransferencias.colaboradores', 'Colaboradores')}</span>
                                <span className={styles.cardValue}>{data.resumo.totalColaboradores}</span>
                            </div>
                        </div>
                    </div>

                    {/* Collaborator performance table */}
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>
                            {t('logisticaTransferencias.analytics.desempenho', 'Desempenho por Colaborador')}
                        </h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>{t('logisticaTransferencias.colaborador', 'Colaborador')}</th>
                                        <th className={styles.thSortable} onClick={() => handleSort('total')}>
                                            Total <SortIcon col="total" sortKey={sortKey} sortDir={sortDir} />
                                        </th>
                                        <th className={styles.thSortable} onClick={() => handleSort('transferenciasPrinc')}>
                                            Transf. PRINC <SortIcon col="transferenciasPrinc" sortKey={sortKey} sortDir={sortDir} />
                                        </th>
                                        <th className={styles.thSortable} onClick={() => handleSort('consumos')}>
                                            Consumos <SortIcon col="consumos" sortKey={sortKey} sortDir={sortDir} />
                                        </th>
                                        <th className={styles.thSortable} onClick={() => handleSort('manuais')}>
                                            Manuais <SortIcon col="manuais" sortKey={sortKey} sortDir={sortDir} />
                                        </th>
                                        <th className={styles.thSortable} onClick={() => handleSort('estornos')}>
                                            Estornos <SortIcon col="estornos" sortKey={sortKey} sortDir={sortDir} />
                                        </th>
                                        <th className={styles.thSortable} onClick={() => handleSort('percentualEstornos')}>
                                            % Estorno <SortIcon col="percentualEstornos" sortKey={sortKey} sortDir={sortDir} />
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedColaboradores.map(col => (
                                        <tr key={col.colaborador}>
                                            <td className={styles.tdColaborador}>
                                                <span 
                                                    className={styles.clickable}
                                                    onClick={() => handleColaboradorClick(col.colaborador)}
                                                >
                                                    {col.colaborador}
                                                </span>
                                            </td>
                                            <td>
                                                <div className={styles.barCell}>
                                                    <span className={styles.barNum}>{col.total}</span>
                                                    <div className={styles.barTrack}>
                                                        <div
                                                            className={styles.barFill}
                                                            style={{ width: `${Math.round((col.total / maxTotal) * 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className={styles.tdNum}>{col.transferenciasPrinc || '—'}</td>
                                            <td className={styles.tdNum}>{col.consumos || '—'}</td>
                                            <td className={styles.tdNum}>{col.manuais || '—'}</td>
                                            <td className={styles.tdNum}>
                                                {col.estornos > 0
                                                    ? <span className={styles.badgeError}>{col.estornos}</span>
                                                    : '—'}
                                            </td>
                                            <td className={styles.tdNum}>
                                                {col.percentualEstornos > 0
                                                    ? <span className={col.percentualEstornos > 5 ? styles.badgeError : styles.badgeWarning}>
                                                        {col.percentualEstornos.toFixed(1)}%
                                                      </span>
                                                    : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Charts row */}
                    <div className={styles.chartsRow}>
                        {/* Pie chart */}
                        <div className={styles.chartCard}>
                            <h3 className={styles.chartTitle}>
                                {t('logisticaTransferencias.analytics.distribuicao', 'Distribuição por Tipo')}
                            </h3>
                            <ResponsiveContainer width="100%" height={260}>
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={90}
                                        innerRadius={50}
                                        paddingAngle={3}
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={index} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(v) => typeof v === 'number' ? v.toLocaleString('pt-BR') : v} />
                                    <Legend
                                        iconType="circle"
                                        iconSize={10}
                                        formatter={(value) => (
                                            <span style={{ fontSize: 12, color: '#475569' }}>{value}</span>
                                        )}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Hourly activity chart */}
                        <div className={styles.chartCard}>
                            <h3 className={styles.chartTitle}>
                                {t('logisticaTransferencias.analytics.porHora', 'Atividade por Hora')}
                            </h3>
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={data.porHora} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="hora"
                                        tickFormatter={h => `${String(h).padStart(2, '0')}h`}
                                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                                        interval={1}
                                    />
                                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <Tooltip
                                        labelFormatter={h => `${String(h).padStart(2, '0')}:00`}
                                        formatter={(v) => [typeof v === 'number' ? v.toLocaleString('pt-BR') : v, 'Movimentações']}
                                    />
                                    <Bar dataKey="total" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Daily volume */}
                    {data.volumeDiario.length > 0 && (
                        <div className={styles.section}>
                            <h2 className={styles.sectionTitle}>
                                {t('logisticaTransferencias.analytics.volumeDiario', 'Volume Diário')}
                            </h2>
                            <div className={styles.chartCardWide}>
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={volumeDiarioFlat} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis
                                            dataKey="data"
                                            tickFormatter={d => d.substring(5)} // MM-DD
                                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                                        />
                                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                        <Tooltip
                                            formatter={(v, name) => [v, TIPO_LABELS[String(name)] || String(name)]}
                                        />
                                        <Legend
                                            iconType="square"
                                            iconSize={10}
                                            formatter={value => <span style={{ fontSize: 11, color: '#475569' }}>{TIPO_LABELS[value] || value}</span>}
                                        />
                                        {tipos.map(tipo => (
                                            <Bar
                                                key={tipo}
                                                dataKey={tipo}
                                                name={tipo}
                                                stackId="a"
                                                fill={TIPO_COLORS[tipo]}
                                                maxBarSize={40}
                                            />
                                        ))}
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* Top OPs and Top Items */}
                    <div className={styles.bottomRow}>
                        {data.topOps.length > 0 && (
                            <div className={styles.rankCard}>
                                <h3 className={styles.chartTitle}>
                                    {t('logisticaTransferencias.analytics.topOps', 'Top OPs Atendidas')}
                                </h3>
                                <table className={styles.rankTable}>
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>OP</th>
                                            <th>Código</th>
                                            <th>Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.topOps.slice(0, 10).map((op, i) => (
                                            <tr key={op.opNumero}>
                                                <td className={styles.rankNum}>{i + 1}</td>
                                                <td>{op.opNumero}</td>
                                                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{op.opCodigo}</td>
                                                <td className={styles.tdNum}>{op.total}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {data.topItens.length > 0 && (
                            <div className={styles.rankCard}>
                                <h3 className={styles.chartTitle}>
                                    {t('logisticaTransferencias.analytics.topItens', 'Itens Mais Movimentados')}
                                </h3>
                                <table className={styles.rankTable}>
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Item</th>
                                            <th>Transferências</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.topItens.slice(0, 10).map((item, i) => (
                                            <tr key={item.itemCodigo}>
                                                <td className={styles.rankNum}>{i + 1}</td>
                                                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.itemCodigo}</td>
                                                <td className={styles.tdNum}>{item.total}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Modal de Detalhes */}
            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={`${t('logisticaTransferencias.detalhes', 'Detalhes de Movimentação')} — ${selectedColaborador}`}
                className={styles.modalLarge}
            >
                {loadingDetalhes ? (
                    <div className={styles.modalLoading}>
                        <div className={styles.spinner}></div>
                        <p>{t('common.carregando', 'Carregando detalhes...')}</p>
                    </div>
                ) : detalhes.length > 0 ? (
                    <div className={styles.modalBodyCustom}>
                        {/* Gráficos do Colaborador */}
                        {loadingAnalytics ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                                {t('common.carregando', 'Carregando gráficos...')}
                            </div>
                        ) : colaboradorAnalytics ? (
                            <div className={styles.chartsRow}>
                                {/* Atividade por Hora */}
                                <div className={styles.chartCard}>
                                    <h3 className={styles.chartTitle}>
                                        {t('logisticaTransferencias.analytics.porHora', 'Atividade por Hora')}
                                    </h3>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <BarChart data={colaboradorAnalytics.porHora} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                            <XAxis
                                                dataKey="hora"
                                                tickFormatter={h => `${String(h).padStart(2, '0')}h`}
                                                tick={{ fontSize: 10, fill: '#94a3b8' }}
                                                interval={2}
                                            />
                                            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                            <Tooltip
                                                labelFormatter={h => `${String(h).padStart(2, '0')}:00`}
                                                formatter={(v) => [typeof v === 'number' ? v.toLocaleString('pt-BR') : v, 'Movimentações']}
                                            />
                                            <Bar dataKey="total" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={15} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Volume Diário */}
                                {colaboradorAnalytics.volumeDiario.length > 0 && (
                                    <div className={styles.chartCard}>
                                        <h3 className={styles.chartTitle}>
                                            {t('logisticaTransferencias.analytics.volumeDiario', 'Volume Diário')}
                                        </h3>
                                        <ResponsiveContainer width="100%" height={200}>
                                            <BarChart data={colaboradorVolumeDiarioFlat} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                <XAxis
                                                    dataKey="data"
                                                    tickFormatter={d => d.substring(5)}
                                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                                />
                                                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                                <Tooltip
                                                    formatter={(v, name) => [v, TIPO_LABELS[String(name)] || String(name)]}
                                                />
                                                <Legend
                                                    iconType="square"
                                                    iconSize={10}
                                                    formatter={value => <span style={{ fontSize: 11, color: '#475569' }}>{TIPO_LABELS[value] || value}</span>}
                                                />
                                                {['transferencia_princ', 'consumo', 'manual', 'estorno', 'nf', 'outro'].map((tipo) => (
                                                    <Bar
                                                        key={tipo}
                                                        dataKey={tipo}
                                                        name={tipo}
                                                        stackId="a"
                                                        fill={TIPO_COLORS[tipo]}
                                                        maxBarSize={30}
                                                    />
                                                ))}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>
                        ) : null}

                        <div className={styles.paginationBar}>
                            <span className={styles.paginationInfo}>
                                {t('logisticaTransferencias.pagina', 'Página {{page}} de {{total}} • {{items}} registros',
                                    { page: detalhesPagina, total: detalhesTotalPages, items: totalDetalhes })}
                            </span>
                            <div className={styles.paginationButtons}>
                                <button
                                    className={styles.paginationBtn}
                                    onClick={handlePrevPage}
                                    disabled={detalhesPagina <= 1}
                                    title={t('common.anterior', 'Anterior')}
                                >
                                    <FiChevronLeft size={18} />
                                </button>
                                <button
                                    className={styles.paginationBtn}
                                    onClick={handleNextPage}
                                    disabled={detalhesPagina >= detalhesTotalPages}
                                    title={t('common.proximo', 'Próximo')}
                                >
                                    <FiChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                        <div className={styles.detalhesTableWrapper}>
                            <table className={styles.detalhesTable}>
                                <thead>
                                    <tr>
                                        <th>{t('logisticaTransferencias.data', 'Data/Referência')}</th>
                                        <th>{t('logisticaTransferencias.diario', 'Diário')}</th>
                                        <th>{t('logisticaTransferencias.tipo', 'Tipo')}</th>
                                        <th>{t('logisticaTransferencias.item', 'Item')}</th>
                                        <th>{t('logisticaTransferencias.op', 'OP')}</th>
                                        <th>{t('logisticaTransferencias.linhas', 'Linhas')}</th>
                                        <th>{t('logisticaTransferencias.status', 'Status')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detalhes.map(det => (
                                        <tr key={det.id}>
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 'bold' }}>{formatDate(det.data_ref)}</span>
                                                    <span style={{ fontSize: '10px', color: '#64748b' }}>
                                                        {det.lancado_em ? formatDateTimeShort(det.lancado_em) : '—'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                <div title={det.descricao}>
                                                    {det.diario}
                                                </div>
                                            </td>
                                            <td>
                                                <span
                                                    className={styles.typeBadge}
                                                    style={{ backgroundColor: TIPO_COLORS[det.tipo] || '#94a3b8' }}
                                                >
                                                    {TIPO_LABELS[det.tipo] || det.tipo}
                                                </span>
                                            </td>
                                            <td style={{ fontFamily: 'monospace' }}>{det.item_codigo}</td>
                                            <td>
                                                {det.op_numero ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span>{det.op_numero}</span>
                                                        <span style={{ fontSize: '10px', color: '#64748b' }}>{det.op_codigo}</span>
                                                    </div>
                                                ) : '—'}
                                            </td>
                                            <td style={{ fontWeight: 'bold' }}>{det.linhas}</td>
                                            <td>
                                                {det.lancado ? (
                                                    <Badge variant="success">{t('logisticaTransferencias.lancado', 'Lançado')}</Badge>
                                                ) : (
                                                    <Badge variant="warning">{t('logisticaTransferencias.pendente', 'Pendente')}</Badge>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className={styles.modalEmpty}>
                        {t('common.noData', 'Nenhum registro encontrado.')}
                    </div>
                )}
            </Modal>
        </>
    );
}
