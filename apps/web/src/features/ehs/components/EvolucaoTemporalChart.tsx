import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { EvolucaoMensal } from '@spiraview/shared';
import styles from './EvolucaoTemporalChart.module.css';

interface EvolucaoTemporalChartProps {
    data: EvolucaoMensal;
}

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function EvolucaoTemporalChart({ data }: EvolucaoTemporalChartProps) {
    const { t } = useTranslation();

    const chartData = data.meses.map((mes, idx) => ({
        mes: MONTH_SHORT[mes - 1] || mes,
        observacoes: data.totalObservacoes[idx],
        participantes: data.participantes[idx],
        compliance: data.taxaCompliance[idx]
    }));

    return (
        <div className={styles.container}>
            <h3 className={styles.title}>
                {t('ehs.stats.evolucao_title', 'Evolução Temporal')}
            </h3>
            <ResponsiveContainer width="100%" height={350}>
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                        dataKey="mes" 
                        stroke="#64748b"
                        style={{ fontSize: '12px' }}
                    />
                    <YAxis 
                        stroke="#64748b"
                        style={{ fontSize: '12px' }}
                    />
                    <Tooltip 
                        contentStyle={{ 
                            backgroundColor: '#fff', 
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            fontSize: '13px'
                        }}
                    />
                    <Legend 
                        wrapperStyle={{ fontSize: '13px' }}
                    />
                    <Line 
                        type="monotone" 
                        dataKey="observacoes" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        name={t('ehs.stats.total_obs', 'Total de Observações')}
                        dot={{ fill: '#3b82f6', r: 4 }}
                        activeDot={{ r: 6 }}
                    />
                    <Line 
                        type="monotone" 
                        dataKey="participantes" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        name={t('ehs.stats.participantes', 'Participantes')}
                        dot={{ fill: '#10b981', r: 4 }}
                        activeDot={{ r: 6 }}
                    />
                    <Line 
                        type="monotone" 
                        dataKey="compliance" 
                        stroke="#f59e0b" 
                        strokeWidth={2}
                        name={t('ehs.stats.compliance', 'Compliance (%)')}
                        dot={{ fill: '#f59e0b', r: 4 }}
                        activeDot={{ r: 6 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
