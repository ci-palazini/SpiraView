import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
    FiCalendar, 
    FiClock, 
    FiTarget,
    FiList, 
    FiTrendingUp, 
    FiRefreshCw, 
} from 'react-icons/fi';
import { 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer, 
    Cell,
    ReferenceLine,
} from 'recharts';
import toast from 'react-hot-toast';

import { PageHeader, Button } from '../../../shared/components';
import { fetchFuncionarioDetalheMes } from '../../../services/apiClient';
import type { FuncionarioDetalheMes } from '../../../services/apiClient';
import { formatDate } from '../../../shared/utils/dateUtils';
import usePermissions from '../../../hooks/usePermissions';
import type { User } from '../../../App';
import styles from './ProducaoColaboradorDetalhePage.module.css';

interface ProducaoColaboradorDetalhePageProps {
    user: User;
}

const currentYearMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const toDateKey = (value: string) => String(value).slice(0, 10);

const ProducaoColaboradorDetalhePage = ({ user }: ProducaoColaboradorDetalhePageProps) => {
    const { t } = useTranslation();
    const { matricula } = useParams<{ matricula: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { canView } = usePermissions(user);
    const canViewColaboradores = canView('producao_colaboradores');

    // Estado inicial do mês baseado na query string ou mês atual
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const fromUrl = searchParams.get('mes');
        if (fromUrl && /^\d{4}-\d{2}$/.test(fromUrl)) return fromUrl;
        return currentYearMonth();
    });

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<FuncionarioDetalheMes | null>(null);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);

    useEffect(() => {
        if (!matricula || !canViewColaboradores) return;

        const loadData = async () => {
            try {
                setLoading(true);
                const res = await fetchFuncionarioDetalheMes(matricula, selectedMonth);
                setData(res);
            } catch (error) {
                console.error('Erro ao carregar detalhes do colaborador:', error);
                toast.error(t('producao.colaboradorDetalhe.messages.loadError'));
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [matricula, selectedMonth, t, canViewColaboradores]);

    const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newMonth = e.target.value;
        setSelectedMonth(newMonth);
        setSelectedDay(null);
        setSearchParams({ mes: newMonth });
    };

    // Preparar dados para o gráfico
    const chartData = useMemo(() => {
        if (!data) return [];
        
        const dailySum: Record<string, number> = {};
        data.lancamentos.forEach(l => {
            const day = toDateKey(l.dataRef);
            dailySum[day] = (dailySum[day] || 0) + Number(l.horasRealizadas);
        });

        const [yyyy, mm] = selectedMonth.split('-').map(Number);
        const lastDay = new Date(yyyy, mm, 0).getDate();
        const fullMonthData = [];

        for (let i = 1; i <= lastDay; i++) {
            const dateStr = `${yyyy}-${String(mm).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            fullMonthData.push({
                day: i,
                fullDate: dateStr,
                hours: dailySum[dateStr] || 0
            });
        }

        return fullMonthData;
    }, [data, selectedMonth]);

    // A tabela mostra apenas o dia selecionado no gráfico
    const filteredLancamentos = useMemo(() => {
        if (!data || !selectedDay) return [];
        return data.lancamentos.filter((l) => toDateKey(l.dataRef) === selectedDay);
    }, [data, selectedDay]);

    const metaDiariaHoras = Number(data?.resumo.metaDiariaHoras || 0);
    const metaMensalHoras = Number(data?.resumo.metaMensalHoras || 0);
    const getBarColor = (hours: number, fullDate: string) => {
        if (fullDate === selectedDay) return '#2563eb';
        if (hours <= 0) return '#e2e8f0';
        if (metaDiariaHoras <= 0) return '#60a5fa';

        const performance = hours / metaDiariaHoras;
        if (performance >= 1) return '#16a34a';
        if (performance >= 0.8) return '#f59e0b';
        return '#ef4444';
    };

    if (!canViewColaboradores) {
        return (
            <div className={styles.loadingWrapper}>
                <p>{t('producao.colaboradorDetalhe.messages.noPermissions')}</p>
            </div>
        );
    }

    if (loading && !data) {
        return (
            <div className={styles.loadingWrapper}>
                <FiRefreshCw className={styles.spin} />
                <p>{t('producao.colaboradorDetalhe.messages.loading')}</p>
            </div>
        );
    }

    return (
        <div className={styles.mainWrapper}>
            <PageHeader 
                title={data?.nome ? `${data.nome} (${matricula})` : `${t('producao.colaboradorDetalhe.title')}: ${matricula}`}
                subtitle={t('producao.colaboradorDetalhe.subtitle')}
                actions={
                    <Button 
                        variant="ghost" 
                        onClick={() => navigate(-1)}
                    >
                        {t('producao.colaboradorDetalhe.back')}
                    </Button>
                }
            />

            <div className={styles.mainContainer}>
                {data && (
                    <>
                        <div className={styles.topGrid}>
                            <div className={styles.filterCard}>
                                <div className={styles.filterField}>
                                    <label className={styles.filterLabel}>
                                        <FiCalendar /> {t('producao.colaboradorDetalhe.filters.period')}
                                    </label>
                                    <input 
                                        type="month" 
                                        className={styles.filterInput}
                                        value={selectedMonth}
                                        onChange={handleMonthChange}
                                    />
                                </div>
                            </div>

                            <div className={styles.statsGrid}>
                                <div className={`${styles.statCard} ${styles.blue}`}>
                                    <div className={styles.statIconWrapper}><FiClock /></div>
                                    <div className={styles.statContent}>
                                        <div className={styles.statValue}>{Number(data.resumo.totalHoras).toFixed(1)}h</div>
                                        <div className={styles.statLabel}>{t('producao.colaboradorDetalhe.stats.totalHours')}</div>
                                    </div>
                                </div>
                                <div className={`${styles.statCard} ${styles.purple}`}>
                                    <div className={styles.statIconWrapper}><FiTarget /></div>
                                    <div className={styles.statContent}>
                                        <div className={styles.statValue}>{metaDiariaHoras.toFixed(1)}h</div>
                                        <div className={styles.statLabel}>{t('producao.colaboradorDetalhe.stats.dailyGoal')}</div>
                                    </div>
                                </div>
                                <div className={`${styles.statCard} ${styles.green}`}>
                                    <div className={styles.statIconWrapper}><FiTrendingUp /></div>
                                    <div className={styles.statContent}>
                                        <div className={styles.statValue}>{metaMensalHoras.toFixed(1)}h</div>
                                        <div className={styles.statLabel}>{t('producao.colaboradorDetalhe.stats.monthlyGoal')}</div>
                                    </div>
                                </div>
                                <div className={`${styles.statCard} ${styles.orange}`}>
                                    <div className={styles.statIconWrapper}><FiList /></div>
                                    <div className={styles.statContent}>
                                        <div className={styles.statValue}>{data.resumo.totalOPs}</div>
                                        <div className={styles.statLabel}>{t('producao.colaboradorDetalhe.stats.totalOps')}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Gráfico de Produção Diária */}
                        <div className={styles.chartSection}>
                            <div className={styles.chartHeader}>
                                <h3>{t('producao.colaboradorDetalhe.chart.title')}</h3>
                            </div>
                            <div style={{ width: '100%', height: 300 }}>
                                <ResponsiveContainer>
                                    <BarChart 
                                        data={chartData} 
                                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis 
                                            dataKey="day" 
                                            tick={{ fontSize: 12, fill: '#94a3b8' }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis 
                                            tick={{ fontSize: 12, fill: '#94a3b8' }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <Tooltip 
                                            cursor={{ fill: '#f8fafc' }}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                            formatter={(value: any) => [`${Number(value || 0).toFixed(2)}h`, t('common.produced', 'Produzido')]}
                                            labelFormatter={(label) => `${t('common.day', 'Dia')} ${label}`}
                                        />
                                        {metaDiariaHoras > 0 && (
                                            <ReferenceLine
                                                y={metaDiariaHoras}
                                                stroke="#7c3aed"
                                                strokeDasharray="6 4"
                                                ifOverflow="extendDomain"
                                                label={{
                                                    value: t('producao.colaboradorDetalhe.chart.goalLine'),
                                                    position: 'right',
                                                    fill: '#7c3aed',
                                                    fontSize: 12,
                                                }}
                                            />
                                        )}
                                        <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                                            {chartData.map((entry, index) => (
                                                <Cell 
                                                    key={`cell-${index}`} 
                                                    fill={getBarColor(entry.hours, entry.fullDate)}
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={() => setSelectedDay((prev) => (prev === entry.fullDate ? null : entry.fullDate))}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Tabela Detalhada */}
                        <div className={styles.tableSection}>
                            <div className={styles.tableHeader}>
                                <div className={styles.tableHeaderFlex}>
                                    <h3>
                                        {t('producao.colaboradorDetalhe.table.title')}
                                        {selectedDay && (
                                            <span className={styles.selectedDayLabel}>
                                                : {formatDate(selectedDay)}
                                            </span>
                                        )}
                                    </h3>
                                    {selectedDay && (
                                        <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)}>
                                            {t('common.clear', 'Limpar')}
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className={styles.tableContainer}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>{t('producao.colaboradorDetalhe.table.date')}</th>
                                            <th>{t('producao.colaboradorDetalhe.table.machine')}</th>
                                            <th>{t('producao.colaboradorDetalhe.table.turn')}</th>
                                            <th>{t('producao.colaboradorDetalhe.table.statusOp', 'Status OP')}</th>
                                            <th>{t('producao.colaboradorDetalhe.table.op')}</th>
                                            <th>{t('producao.colaboradorDetalhe.table.description', 'Descrição')}</th>
                                            <th className={styles.alignRight}>{t('producao.colaboradorDetalhe.table.hours')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredLancamentos.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>
                                                    {selectedDay
                                                        ? t('producao.colaboradorDetalhe.messages.noDataDay')
                                                        : t('producao.colaboradorDetalhe.messages.selectDay')}
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredLancamentos.map((l) => (
                                                <tr key={l.id}>
                                                    <td>{formatDate(l.dataRef)}</td>
                                                    <td>{l.maquinaNome}</td>
                                                    <td>{l.turno || '—'}</td>
                                                    <td>
                                                        {l.statusOP ? (
                                                            <span className={styles.opBadge}>{l.statusOP}</span>
                                                        ) : '—'}
                                                    </td>
                                                    <td>
                                                        {l.numeroOP ? (
                                                            <span className={styles.opBadge}>{l.numeroOP}</span>
                                                        ) : '—'}
                                                    </td>
                                                    <td title={l.descricao || undefined}>
                                                        {l.descricao ? (
                                                            l.descricao.length > 50
                                                                ? `${l.descricao.substring(0, 50)}...`
                                                                : l.descricao
                                                        ) : '—'}
                                                    </td>
                                                    <td className={styles.alignRight}>
                                                        <strong>{Number(l.horasRealizadas).toFixed(2)}h</strong>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ProducaoColaboradorDetalhePage;
