import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Typography,
    Paper,

    CircularProgress,
    Card,
    CardContent,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    TableContainer,
    Chip
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
    listarResponsaveis
} from '../../../services/apiClient';
import toast from 'react-hot-toast';
import PageHeader from '../../../shared/components/PageHeader';
import { usePermissions } from '../../../hooks/usePermissions';
import { FiLock } from 'react-icons/fi';
import { Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export default function QualidadeAnaliticoPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    // Obter usuário do localStorage (padrao do app)
    const user = JSON.parse(localStorage.getItem('usuario') || 'null');
    const { canView } = usePermissions(user);

    const [loading, setLoading] = useState(false);

    // Filters
    const [responsavel, setResponsavel] = useState('');
    const [responsavelOpts, setResponsavelOpts] = useState<string[]>([]);

    // Data
    const [summary, setSummary] = useState<QualityAnalyticSummary | null>(null);
    const [trends, setTrends] = useState<QualityAnalyticTrend[]>([]);
    const [details, setDetails] = useState<QualityAnalyticDetail[]>([]);

    useEffect(() => {
        loadFilters();
    }, []);

    useEffect(() => {
        fetchData();
    }, [responsavel]);

    const loadFilters = async () => {
        try {
            const data = await listarResponsaveis();
            setResponsavelOpts(data);
        } catch (error) {
            console.error(error);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = { responsavel: responsavel || undefined };

            const [sumRes, trendRes, detRes] = await Promise.all([
                getQualityAnalyticsSummary(params),
                getQualityAnalyticsTrends(params),
                getQualityAnalyticsDetails(params)
            ]);

            setSummary(sumRes);
            setTrends(trendRes.trends);
            setDetails(detRes.items);
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
                    Acesso Negado
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 400 }}>
                    Você não tem permissão para visualizar a Análise Detalhada da Qualidade.
                    Entre em contato com o administrador para solicitar acesso.
                </Typography>
                <Button
                    variant="contained"
                    onClick={() => navigate('/')}
                    sx={{ borderRadius: 2, px: 4 }}
                >
                    Voltar para o Início
                </Button>
            </Box>
        );
    }

    return (
        <>
            <PageHeader
                title={t('qualityAnalytics.title', 'Análise Detalhada')}
                subtitle={t('qualityAnalytics.subtitle', 'Visão aprofundada de custos e refugos')}
                actions={
                    <Box sx={{ minWidth: 250 }}>
                        <FormControl fullWidth size="small" variant="outlined" sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
                            <InputLabel>{t('qualityAnalytics.filterResponsible', 'Filtrar por Responsável')}</InputLabel>
                            <Select
                                value={responsavel}
                                label={t('qualityAnalytics.filterResponsible', 'Filtrar por Responsável')}
                                onChange={(e) => setResponsavel(e.target.value)}
                            >
                                <MenuItem value=""><em>Todas</em></MenuItem>
                                {responsavelOpts.map(opt => (
                                    <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                }
            />

            <Box sx={{ p: 3 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(12, 1fr)' }, gap: 3 }}>
                        {/* Summary Cards */}
                        <Box sx={{ gridColumn: { xs: 'span 12', md: 'span 4' } }}>
                            <Card sx={{
                                height: '100%',
                                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                                color: '#fff',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                                borderRadius: 2
                            }}>
                                <CardContent sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
                                    <Typography variant="subtitle1" sx={{ opacity: 0.8, textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.75rem' }}>
                                        {t('qualityAnalytics.totalCost', 'Custo Total')}
                                    </Typography>
                                    <Typography variant="h3" fontWeight="bold" sx={{ mt: 1 }}>
                                        {formatCurrency(summary?.totalCost || 0)}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Box>

                        <Box sx={{ gridColumn: { xs: 'span 12', md: 'span 4' } }}>
                            <Card sx={{
                                height: '100%',
                                bgcolor: '#fff',
                                color: '#1e293b',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                                borderRadius: 2,
                                borderLeft: '4px solid #3b82f6'
                            }}>
                                <CardContent sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
                                    <Typography variant="subtitle1" sx={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.75rem', fontWeight: 600 }}>
                                        {t('qualityAnalytics.costLastMonth', 'Custo Mês Anterior')}
                                    </Typography>
                                    <Typography variant="h4" fontWeight="bold" sx={{ mt: 1, color: '#1e293b' }}>
                                        {formatCurrency(summary?.costLastMonth || 0)}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Box>

                        <Box sx={{ gridColumn: { xs: 'span 12', md: 'span 4' } }}>
                            <Card sx={{
                                height: '100%',
                                bgcolor: '#fff',
                                color: '#1e293b',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                                borderRadius: 2,
                                borderLeft: '4px solid #8b5cf6'
                            }}>
                                <CardContent sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
                                    <Typography variant="subtitle1" sx={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.75rem', fontWeight: 600 }}>
                                        {t('qualityAnalytics.costLastYear', 'Custo Ano Anterior')}
                                    </Typography>
                                    <Typography variant="h4" fontWeight="bold" sx={{ mt: 1, color: '#1e293b' }}>
                                        {formatCurrency(summary?.costLastYear || 0)}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Box>

                        <Box sx={{ gridColumn: { xs: 'span 12', md: 'span 12' } }}>
                            <Paper sx={{ p: 3, height: '100%', borderRadius: 2, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                                <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
                                    {t('qualityAnalytics.monthlyTrend', 'Evolução Mensal')}
                                </Typography>
                                <Box sx={{ height: 250 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={trends}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                            <XAxis dataKey="period" tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                                            <Tooltip
                                                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                formatter={(val: any) => [formatCurrency(Number(val)), t('qualityAnalytics.cost', 'Custo')]}
                                            />
                                            <Line type="monotone" dataKey="cost" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </Box>
                            </Paper>
                        </Box>

                        {/* Top 5 Responsible Chart */}
                        <Box sx={{ gridColumn: { xs: 'span 12', md: 'span 5' } }}>
                            <Paper sx={{ p: 3, borderRadius: 2, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                                <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
                                    {t('qualityAnalytics.topResponsible', 'Top 5 Responsáveis')}
                                </Typography>
                                <Box sx={{ height: 350 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart layout="vertical" data={summary?.topResponsible || []} margin={{ left: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                                            <XAxis type="number" hide />
                                            <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                                            <Tooltip
                                                cursor={{ fill: 'transparent' }}
                                                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                formatter={(val: any) => [formatCurrency(Number(val)), t('qualityAnalytics.cost', 'Custo')]}
                                            />
                                            <Bar dataKey="cost" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={20} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Box>
                            </Paper>
                        </Box>

                        {/* Detailed Table */}
                        <Box sx={{ gridColumn: { xs: 'span 12', md: 'span 7' } }}>
                            <Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 2, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                                <Box sx={{ p: 3, pb: 2 }}>
                                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                        {t('qualityAnalytics.details', 'Detalhamento por Responsável')}
                                    </Typography>
                                </Box>
                                <TableContainer sx={{ maxHeight: 350 }}>
                                    <Table stickyHeader>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc' }}>{t('qualityAnalytics.responsible', 'Responsável')}</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 600, bgcolor: '#f8fafc' }}>{t('qualityAnalytics.occurrences', 'Ocorrências')}</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 600, bgcolor: '#f8fafc' }}>{t('qualityAnalytics.cost', 'Custo')}</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 600, bgcolor: '#f8fafc' }}>{t('qualityAnalytics.lastOccurrence', 'Última')}</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {details.map((row) => (
                                                <TableRow key={row.name} hover>
                                                    <TableCell component="th" scope="row">
                                                        {row.name}
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Chip label={row.count} size="small" sx={{ borderRadius: 1, bgcolor: '#eff6ff', color: '#1d4ed8', fontWeight: 600 }} />
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                                                        {formatCurrency(row.totalCost)}
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                                                        {row.lastOccurrence ? new Date(row.lastOccurrence).toLocaleDateString() : '-'}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Paper>
                        </Box>
                    </Box>
                )}
            </Box>
        </>

    );
}
