// src/features/logistica/pages/TransferenciasAnalyticsPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend,
} from 'recharts';
import { FiUsers, FiRepeat, FiPackage, FiAlertTriangle, FiArrowDown } from 'react-icons/fi';
import PageHeader from '../../../shared/components/PageHeader';
import { getTransferenciasAnalytics } from '../../../services/apiClient';
import type { TransferenciasAnalytics, ColaboradorDesempenho } from '@spiraview/shared';
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

export default function TransferenciasAnalyticsPage() {
    const { t } = useTranslation();
    const now = new Date();
    const [mes, setMes] = useState(now.getMonth() + 1);
    const [ano, setAno] = useState(now.getFullYear());
    const [data, setData] = useState<TransferenciasAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [sortKey, setSortKey] = useState<SortKey>('total');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getTransferenciasAnalytics(mes, ano);
            setData(res);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [mes, ano]);

    useEffect(() => { load(); }, [load]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    const sortedColaboradores: ColaboradorDesempenho[] = data
        ? [...data.porColaborador].sort((a, b) => {
            const mult = sortDir === 'desc' ? -1 : 1;
            return mult * (a[sortKey] - b[sortKey]);
        })
        : [];

    // Flatten porTipo nested object for Recharts compatibility
    const volumeDiarioFlat = data?.volumeDiario.map(d => ({
        data: d.data,
        total: d.total,
        transferencia_princ: d.porTipo['transferencia_princ'] || 0,
        consumo: d.porTipo['consumo'] || 0,
        manual: d.porTipo['manual'] || 0,
        estorno: d.porTipo['estorno'] || 0,
        nf: d.porTipo['nf'] || 0,
        outro: d.porTipo['outro'] || 0,
    })) ?? [];

    const maxTotal = sortedColaboradores.length > 0
        ? Math.max(...sortedColaboradores.map(c => c.total))
        : 1;

    const pieData = data
        ? Object.entries(data.resumo.porTipo)
            .filter(([, v]) => v > 0)
            .map(([key, value]) => ({
                name: TIPO_LABELS[key] || key,
                value,
                color: TIPO_COLORS[key] || '#94a3b8',
            }))
        : [];

    const tipos: (keyof typeof TIPO_COLORS)[] = ['transferencia_princ', 'consumo', 'manual', 'estorno', 'nf', 'outro'];

    const SortIcon = ({ col }: { col: SortKey }) => (
        <span className={styles.sortIcon} style={{ opacity: sortKey === col ? 1 : 0.3 }}>
            {sortKey === col && sortDir === 'asc' ? '▲' : '▼'}
        </span>
    );

    const meses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ];

    const anos = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

    return (
        <>
            <PageHeader
                title={t('logisticaTransferencias.analytics.title', 'Análise de Transferências')}
                subtitle={t('logisticaTransferencias.analytics.subtitle', 'Movimentações de estoque por período e colaborador')}
            />

            {/* Filter */}
            <div className={styles.filterBar}>
                <label className={styles.filterLabel}>
                    {t('logisticaTransferencias.mes', 'Mês')}
                    <select
                        className={styles.filterSelect}
                        value={mes}
                        onChange={e => setMes(Number(e.target.value))}
                    >
                        {meses.map((m, i) => (
                            <option key={i} value={i + 1}>{m}</option>
                        ))}
                    </select>
                </label>
                <label className={styles.filterLabel}>
                    {t('logisticaTransferencias.ano', 'Ano')}
                    <select
                        className={styles.filterSelect}
                        value={ano}
                        onChange={e => setAno(Number(e.target.value))}
                    >
                        {anos.map(a => (
                            <option key={a} value={a}>{a}</option>
                        ))}
                    </select>
                </label>
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
                                            Total <SortIcon col="total" />
                                        </th>
                                        <th className={styles.thSortable} onClick={() => handleSort('transferenciasPrinc')}>
                                            Transf. PRINC <SortIcon col="transferenciasPrinc" />
                                        </th>
                                        <th className={styles.thSortable} onClick={() => handleSort('consumos')}>
                                            Consumos <SortIcon col="consumos" />
                                        </th>
                                        <th className={styles.thSortable} onClick={() => handleSort('manuais')}>
                                            Manuais <SortIcon col="manuais" />
                                        </th>
                                        <th className={styles.thSortable} onClick={() => handleSort('estornos')}>
                                            Estornos <SortIcon col="estornos" />
                                        </th>
                                        <th className={styles.thSortable} onClick={() => handleSort('percentualEstornos')}>
                                            % Estorno <SortIcon col="percentualEstornos" />
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedColaboradores.map(col => (
                                        <tr key={col.colaborador}>
                                            <td className={styles.tdColaborador}>{col.colaborador}</td>
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
        </>
    );
}
