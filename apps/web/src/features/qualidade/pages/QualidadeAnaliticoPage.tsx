import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Typography,
    CircularProgress,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    TableContainer,
    Chip,
    Button
} from '@mui/material';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line
} from 'recharts';
import {
    getQualityAnalyticsSummary,
    getQualityAnalyticsTrends,
    getQualityAnalyticsDetails,
    QualityAnalyticSummary,
    QualityAnalyticTrend,
    QualityAnalyticDetail,
    listarResponsaveis,
    listarOrigens,
    QualidadeOpcao
} from '../../../services/apiClient';
import toast from 'react-hot-toast';
import PageHeader from '../../../shared/components/PageHeader';
import { usePermissions } from '../../../hooks/usePermissions';
import { FiLock } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import QualityDrillDownModal from '../components/QualityDrillDownModal';
import styles from './QualidadeAnaliticoPage.module.css';
import StatCard from '../components/StatCard';
import { Banknote, Calendar, History, TrendingUp, Filter, User, MapPin } from 'lucide-react';

export default function QualidadeAnaliticoPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    // Obter usuário do localStorage (padrao do app)
    const user = JSON.parse(localStorage.getItem('usuario') || 'null');
    const { canView } = usePermissions(user);

    const [loading, setLoading] = useState(false);

    // Filters
    const [responsavel, setResponsavel] = useState('');
    const [tipo, setTipo] = useState('');
    const [tipoLancamento, setTipoLancamento] = useState('');
    const [origem, setOrigem] = useState('');
    const [responsavelOpts, setResponsavelOpts] = useState<string[]>([]);
    const [origemOpts, setOrigemOpts] = useState<QualidadeOpcao[]>([]);

    // Data
    const [summary, setSummary] = useState<QualityAnalyticSummary | null>(null);
    const [trends, setTrends] = useState<QualityAnalyticTrend[]>([]);
    const [details, setDetails] = useState<QualityAnalyticDetail[]>([]);
    const [originDetails, setOriginDetails] = useState<QualityAnalyticDetail[]>([]);

    // Drilldown
    const [drillDownOpen, setDrillDownOpen] = useState(false);
    const [drillDownTitle, setDrillDownTitle] = useState('');
    const [drillDownFilters, setDrillDownFilters] = useState<{
        responsavel?: string;
        origem?: string;
        tipo?: string;
        tipoLancamento?: string;
    }>({});

    useEffect(() => {
        loadOrigins(tipo);
        loadResponsibles(tipo, origem);
    }, [tipo]);

    useEffect(() => {
        loadResponsibles(tipo, origem);
    }, [origem]);

    useEffect(() => {
        fetchData();
    }, [responsavel, tipo, origem, tipoLancamento]);

    const loadOrigins = async (tOrigem?: string) => {
        try {
            const data = await listarOrigens(false, tOrigem || undefined);
            setOrigemOpts(data);

            // If current selected origin is not in the new list, reset it
            if (origem && !data.find(o => o.nome === origem)) {
                setOrigem('');
            }
        } catch (error) {
            console.error(error);
        }
    };

    const loadResponsibles = async (tOrigem?: string, oNome?: string) => {
        try {
            const data = await listarResponsaveis({
                tipo: tOrigem || undefined,
                origem: oNome || undefined
            });
            setResponsavelOpts(data);

            // If current selected responsible is not in the new list, reset it
            if (responsavel && !data.includes(responsavel)) {
                setResponsavel('');
            }
        } catch (error) {
            console.error(error);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = {
                responsavel: responsavel || undefined,
                tipo: tipo || undefined,
                origem: origem || undefined,
                tipoLancamento: tipoLancamento || undefined
            };

            const [sumRes, trendRes, detRes] = await Promise.all([
                getQualityAnalyticsSummary(params),
                getQualityAnalyticsTrends(params),
                getQualityAnalyticsDetails(params)
            ]);

            setSummary(sumRes);
            setTrends(trendRes.trends);
            setDetails(detRes.items);
            setOriginDetails(detRes.originItems || []);
        } catch (error) {
            console.error(error);
            toast.error(t('common.error'));
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    const handleDrillDown = (item: QualityAnalyticDetail, type: 'responsavel' | 'origem') => {
        setDrillDownTitle(`${type === 'responsavel' ? t('qualityAnalytics.responsible', 'Responsável') : t('qualityAnalytics.filterOrigin', 'Origem')}: ${item.name}`);
        setDrillDownFilters({
            tipo: tipo || undefined,
            tipoLancamento: tipoLancamento || undefined,
            responsavel: type === 'responsavel' ? item.name : (responsavel || undefined),
            origem: type === 'origem' ? item.name : (origem || undefined)
        });
        setDrillDownOpen(true);
    };

    if (!canView('qualidade_analitico')) {
        return (
            <Box sx={{
                p: 5,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '70vh',
                textAlign: 'center'
            }}>
                <FiLock size={64} color="#64748b" style={{ marginBottom: 20 }} />
                <Typography variant="h4" fontWeight="bold" gutterBottom>
                    {t('qualityAnalytics.accessDenied', 'Acesso Negado')}
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 400 }}>
                    {t('qualityAnalytics.accessDeniedMsg', 'Você não tem permissão para visualizar a Análise Detalhada da Qualidade. Entre em contato com o administrador para solicitar acesso.')}
                </Typography>
                <Button
                    variant="contained"
                    onClick={() => navigate('/')}
                    sx={{ borderRadius: 2, px: 4 }}
                >
                    {t('qualityAnalytics.backToStart', 'Voltar para o Início')}
                </Button>
            </Box>
        );
    }

    return (
        <div className={styles.container}>
            <PageHeader
                title={t('qualityAnalytics.title', 'Análise Detalhada')}
                subtitle={t('qualityAnalytics.subtitle', 'Visão aprofundada de custos e refugos')}
            />

            <div className={styles.content}>
                {/* Filter Bar */}
                <div className={styles.filterContainer}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', marginRight: '0.5rem' }}>
                        <Filter size={20} />
                    </div>

                    <div className={styles.filterGroup}>
                        <label>{t('nav.tipoLancamento', 'Tipo de Dados')}:</label>
                        <select
                            value={tipoLancamento}
                            onChange={(e) => setTipoLancamento(e.target.value)}
                            className={styles.select}
                        >
                            <option value="">{t('nav.todos', 'Todos')}</option>
                            <option value="REFUGO">{t('nav.refugo', 'Refugo')}</option>
                            <option value="QUARENTENA">{t('nav.quarentena', 'Quarentena')}</option>
                        </select>
                    </div>

                    <div className={styles.filterGroup}>
                        <label>{t('qualityAnalytics.filterOriginType', 'Tipo de Origem')}:</label>
                        <select
                            value={tipo}
                            onChange={(e) => setTipo(e.target.value)}
                            className={styles.select}
                        >
                            <option value="">{t('qualityAnalytics.allTypes', 'Todos os Tipos')}</option>
                            <option value="INTERNO">{t('qualityAnalytics.internal', 'Interno')}</option>
                            <option value="EXTERNO">{t('qualityAnalytics.external', 'Externo')}</option>
                        </select>
                    </div>

                    <div className={styles.filterGroup}>
                        <label>{t('qualityAnalytics.filterOrigin', 'Origem')}:</label>
                        <select
                            value={origem}
                            onChange={(e) => setOrigem(e.target.value)}
                            className={styles.select}
                        >
                            <option value="">{t('qualityAnalytics.all', 'Todas')}</option>
                            {origemOpts.map(opt => (
                                <option key={opt.id} value={opt.nome}>{opt.nome}</option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.filterGroup}>
                        <label>{t('qualityAnalytics.filterResponsible', 'Responsável')}:</label>
                        <select
                            value={responsavel}
                            onChange={(e) => setResponsavel(e.target.value)}
                            className={styles.select}
                        >
                            <option value="">{t('qualityAnalytics.all', 'Todos')}</option>
                            {responsavelOpts.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <>
                        {/* KPIs */}
                        <div className={styles.kpiContainer}>
                            <StatCard
                                title={t('qualityAnalytics.totalCost', 'Custo Total')}
                                value={formatCurrency(summary?.totalCost || 0)}
                                icon={<Banknote size={24} />}
                                color="blue"
                                subtitle={t('qualityAnalytics.periodSelected', 'No período filtrado')}
                            />
                            <StatCard
                                title={t('qualityAnalytics.costLastMonth', 'Custo Mês Anterior')}
                                value={formatCurrency(summary?.costLastMonth || 0)}
                                icon={<Calendar size={24} />}
                                color="blue"
                                subtitle={t('qualityAnalytics.vsCurrent', 'Mês anterior completo')}
                            />
                            <StatCard
                                title={t('qualityAnalytics.costLastYear', 'Custo Ano Anterior')}
                                value={formatCurrency(summary?.costLastYear || 0)}
                                icon={<History size={24} />}
                                color="purple"
                                subtitle={t('qualityAnalytics.vsCurrentYear', 'Ano anterior completo')}
                            />
                        </div>

                        {/* Main Grid */}
                        <div className={styles.gridContainer}>
                            {/* Monthly Trend */}
                            <div className={`${styles.card} ${styles.fullWidth}`}>
                                <div className={styles.cardHeader}>
                                    <div className={styles.cardTitle}>
                                        <TrendingUp size={20} className="text-blue-500" />
                                        {t('qualityAnalytics.monthlyTrend', 'Evolução Mensal')}
                                    </div>
                                </div>
                                <div className={styles.chartContainer} style={{ height: 300 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={trends} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                            <XAxis dataKey="period" tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                                            <Tooltip
                                                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                formatter={(val: any) => [formatCurrency(Number(val)), t('qualityAnalytics.cost', 'Custo')]}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="cost"
                                                stroke="#3b82f6"
                                                strokeWidth={3}
                                                dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
                                                activeDot={{ r: 6 }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Top 5 Responsible */}
                            <div className={`${styles.card} ${styles.halfWidth}`}>
                                <div className={styles.cardHeader}>
                                    <div className={styles.cardTitle}>
                                        <User size={20} className="text-orange-500" />
                                        {t('qualityAnalytics.topResponsible', 'Top 5 Responsáveis')}
                                    </div>
                                </div>
                                <div className={styles.chartContainer}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart layout="vertical" data={summary?.topResponsible || []} margin={{ left: 20, right: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                                            <XAxis type="number" hide />
                                            <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                                            <Tooltip
                                                cursor={{ fill: 'transparent' }}
                                                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                formatter={(val: any) => [formatCurrency(Number(val)), t('qualityAnalytics.cost', 'Custo')]}
                                            />
                                            <Bar dataKey="cost" fill="#f97316" radius={[0, 4, 4, 0]} barSize={20} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Top 5 Origins */}
                            <div className={`${styles.card} ${styles.halfWidth}`}>
                                <div className={styles.cardHeader}>
                                    <div className={styles.cardTitle}>
                                        <MapPin size={20} className="text-yellow-500" />
                                        {t('qualityAnalytics.topOrigins', 'Top 5 Origens')}
                                    </div>
                                </div>
                                <div className={styles.chartContainer}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart layout="vertical" data={summary?.topOrigins || []} margin={{ left: 20, right: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                                            <XAxis type="number" hide />
                                            <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                                            <Tooltip
                                                cursor={{ fill: 'transparent' }}
                                                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                formatter={(val: any) => [formatCurrency(Number(val)), t('qualityAnalytics.cost', 'Custo')]}
                                            />
                                            <Bar dataKey="cost" fill="#eab308" radius={[0, 4, 4, 0]} barSize={20} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Detailed Table (Responsible) */}
                            <div className={`${styles.card} ${styles.halfWidth}`} style={{ height: 'auto', maxHeight: 500, overflow: 'hidden' }}>
                                <div className={styles.cardHeader}>
                                    <div className={styles.cardTitle}>
                                        {t('qualityAnalytics.details', 'Detalhamento por Responsável')}
                                    </div>
                                </div>
                                <div className={styles.tableContainer}>
                                    <TableContainer sx={{ maxHeight: 400 }}>
                                        <Table stickyHeader>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc' }}>{t('qualityAnalytics.responsible', 'Responsável')}</TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 600, bgcolor: '#f8fafc' }}>{t('qualityAnalytics.occurrences', 'Qtd')}</TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 600, bgcolor: '#f8fafc' }}>{t('qualityAnalytics.cost', 'Custo')}</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {details.map((row) => (
                                                    <TableRow
                                                        key={row.name}
                                                        hover
                                                        onClick={() => handleDrillDown(row, 'responsavel')}
                                                        sx={{ cursor: 'pointer' }}
                                                        className="group"
                                                    >
                                                        <TableCell component="th" scope="row">
                                                            {row.name}
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Chip label={row.count} size="small" sx={{ borderRadius: 1, bgcolor: '#eff6ff', color: '#1d4ed8', fontWeight: 600 }} />
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                                                            {formatCurrency(row.totalCost)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </div>
                            </div>

                            {/* Detailed Table (Origins) */}
                            <div className={`${styles.card} ${styles.halfWidth}`} style={{ height: 'auto', maxHeight: 500, overflow: 'hidden' }}>
                                <div className={styles.cardHeader}>
                                    <div className={styles.cardTitle}>
                                        {t('qualityAnalytics.detailsOrigin', 'Detalhamento por Origem')}
                                    </div>
                                </div>
                                <div className={styles.tableContainer}>
                                    <TableContainer sx={{ maxHeight: 400 }}>
                                        <Table stickyHeader>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc' }}>{t('qualityAnalytics.filterOrigin', 'Origem')}</TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 600, bgcolor: '#f8fafc' }}>{t('qualityAnalytics.occurrences', 'Qtd')}</TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 600, bgcolor: '#f8fafc' }}>{t('qualityAnalytics.cost', 'Custo')}</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {originDetails.map((row) => (
                                                    <TableRow
                                                        key={row.name}
                                                        hover
                                                        onClick={() => handleDrillDown(row, 'origem')}
                                                        sx={{ cursor: 'pointer' }}
                                                    >
                                                        <TableCell component="th" scope="row">
                                                            {row.name}
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Chip label={row.count} size="small" sx={{ borderRadius: 1, bgcolor: '#fff7ed', color: '#c2410c', fontWeight: 600 }} />
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                                                            {formatCurrency(row.totalCost)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </div>
                            </div>

                        </div>
                    </>
                )}

                <QualityDrillDownModal
                    open={drillDownOpen}
                    onClose={() => setDrillDownOpen(false)}
                    filters={drillDownFilters}
                    title={drillDownTitle}
                />
            </div>
        </div>
    );
}
