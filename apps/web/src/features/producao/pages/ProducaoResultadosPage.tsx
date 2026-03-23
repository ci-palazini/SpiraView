import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    PageHeader, 
    Card, 
    Button,
    ExportButtons
} from '../../../shared/components';
import { getResultadosMensais } from '../../../services/apiClient';
import type { ResultadosMensais } from '@spiraview/shared';
import { Calendar, Download, BarChart2 } from 'lucide-react';
import { exportToExcel } from '../../../utils/exportExcel';
import styles from './ProducaoResultadosPage.module.css';

export const ProducaoResultadosPage: React.FC = () => {
    const { t } = useTranslation('common');
    
    const today = new Date();
    // Default to last month if we are in the first 5 days, otherwise current
    const initialDate = today.getDate() < 5 ? new Date(today.getFullYear(), today.getMonth() - 1, 1) : today;
    
    const [ano, setAno] = useState(initialDate.getFullYear());
    const [mes, setMes] = useState(initialDate.getMonth() + 1);
    
    const [data, setData] = useState<ResultadosMensais | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const loadData = async () => {
        if (!ano || !mes) return;
        setIsLoading(true);
        try {
            const res = await getResultadosMensais(ano, mes);
            setData(res);
        } catch (err: any) {
            console.error(err);
            alert(err.message || 'Erro ao carregar resultados');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [ano, mes]);

    const handleExport = () => {
        if (!data) return;
        
        // Flatten for excel
        const rows: any[] = [];
        
        data.setores.forEach(setor => {
            setor.maquinas.forEach(maq => {
                const row: any = {
                    'Setor': setor.setorNome,
                    'Máquina': maq.maquinaNome,
                };
                
                // Realizado / Meta
                data.diasMes.forEach(diaKey => {
                    const diaData = maq.dias.find(d => d.dia === diaKey);
                    const label = parseInt(diaKey.split('-')[2], 10);
                    row[`Dia ${label} (Real)`] = diaData ? diaData.horasRealizadas : 0;
                    row[`Dia ${label} (Meta)`] = diaData ? (diaData.horasMeta || 0) : 0;
                });
                
                row['Total Realizado'] = maq.totalRealizado;
                row['Total Meta'] = maq.totalMeta;
                row['% Rendimento'] = maq.totalMeta > 0 ? ((maq.totalRealizado / maq.totalMeta) * 100).toFixed(1) + '%' : '-';
                
                rows.push(row);
            });
        });
        
        exportToExcel(rows, `Resultados ${ano}-${mes}`, `Producao_Resultados_${ano}_${mes}`);
    };

    const getRendimentoColor = (real: number, meta: number) => {
        if (meta === 0) return 'text-gray-500 font-medium';
        const pct = (real / meta) * 100;
        if (pct >= 100) return 'text-green-600 dark:text-green-400 font-bold';
        if (pct >= 85) return 'text-amber-500 dark:text-amber-400 font-semibold';
        return 'text-red-500 dark:text-red-400 font-semibold';
    };

    return (
        <div className={styles.container}>
            <PageHeader
                title="Resultados de Produção"
            />

            <div className={styles.filtersContainer}>
                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>
                        <Calendar size={16}/> Período de Análise
                    </label>
                    <input 
                        type="month"
                        value={`${ano}-${String(mes).padStart(2, '0')}`}
                        onChange={e => {
                            if(e.target.value) {
                                const [y, m] = e.target.value.split('-');
                                setAno(Number(y));
                                setMes(Number(m));
                            }
                        }}
                        className={styles.filterInput}
                    />
                </div>
                
                <div>
                    <Button variant="secondary" onClick={handleExport} disabled={!data || data.setores.length === 0}>
                        <Download size={16} className="mr-2"/> Exportar Excel
                    </Button>
                </div>
            </div>

            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>
                        <BarChart2 size={20} />
                        Mapa de Rendimento
                    </h2>
                </div>

                {isLoading ? (
                    <div className="p-8 flex justify-center text-gray-400">Carregando resultados...</div>
                ) : !data || data.setores.length === 0 ? (
                    <div className="p-8 flex justify-center text-gray-400 flex-col items-center">
                        <p>Nenhuma máquina encontrada para o período.</p>
                        <p className="text-sm mt-2">Verifique a configuração na aba de Estrutura se necessário.</p>
                    </div>
                ) : (
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th className={styles.thSticky}>
                                        Máquina
                                    </th>
                                    {data.diasMes.map(diaKey => (
                                        <th key={diaKey} className={`${styles.th} ${styles.thDay}`}>
                                            {parseInt(diaKey.split('-')[2], 10)}
                                        </th>
                                    ))}
                                    <th className={styles.th} style={{ background: '#eff6ff', borderLeft: '2px solid #e2e8f0' }}>
                                        Total<br/><span className="text-xs text-blue-600">Real</span>
                                    </th>
                                    <th className={styles.th} style={{ background: '#eff6ff' }}>
                                        Meta<br/><span className="text-xs text-blue-600">Mensal</span>
                                    </th>
                                    <th className={styles.th} style={{ background: '#eff6ff', borderRight: '2px solid #e2e8f0' }}>
                                        %<br/><span className="text-xs text-blue-600">Rend.</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.setores.map(setor => (
                                    <React.Fragment key={setor.setorId || 'none'}>
                                        <tr className={styles.trSector}>
                                            <td 
                                                colSpan={data.diasMes.length + 4} 
                                                className={styles.tdSticky}
                                            >
                                                {setor.setorNome}
                                            </td>
                                        </tr>
                                        {setor.maquinas.map(maq => (
                                            <tr key={maq.maquinaId} className={styles.trMachine}>
                                                <td className={styles.tdSticky}>
                                                    {maq.maquinaNome}
                                                </td>
                                                {data.diasMes.map(diaKey => {
                                                    const diaData = maq.dias.find(d => d.dia === diaKey);
                                                    const real = diaData?.horasRealizadas || 0;
                                                    const meta = diaData?.horasMeta || 0; // pode ser null, mas usaremos 0 p viés viusal
                                                    
                                                    // Sem meta = fundo cinza
                                                    // Com meta mas não apontou = vermelho claro
                                                    // Com meta e superou meta = verde claro
                                                    
                                                    let isWeekend = false;
                                                    if(diaKey) {
                                                        const d = new Date(diaKey + 'T12:00:00');
                                                        isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                                    }

                                                    let bgCell = isWeekend ? 'bg-[#f8fafc] text-[#94a3b8]' : 'bg-white text-gray-700';
                                                    let textClass = '';
                                                    
                                                    if (meta > 0) {
                                                        if (real > 0 && real >= meta) textClass += ` ${styles.valPos}`;
                                                        else if (real > 0) textClass += ' text-[#d97706] font-medium'; // Amber
                                                        else if (real === 0 && !isWeekend && (new Date(diaKey + 'T12:00:00')) < new Date()) textClass += ` ${styles.valNeg}`;
                                                    } else if (real > 0) {
                                                        // Produziu sem meta
                                                        textClass += ' text-[#2563eb] font-medium';
                                                    }

                                                    return (
                                                        <td key={diaKey} className={`${styles.td} ${bgCell} ${textClass}`}>
                                                            {real > 0 ? (
                                                                <div>
                                                                    <div>{Number(real.toFixed(1))}</div>
                                                                    {meta > 0 && <div className="text-[9px] text-[#94a3b8]">{Number(meta.toFixed(1))}m</div>}
                                                                </div>
                                                            ) : (
                                                                <div className={styles.valZero}>-</div>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td className={styles.td} style={{ background: '#f0fdf4', fontWeight: 600 }}>
                                                    {Number(maq.totalRealizado.toFixed(1))}
                                                </td>
                                                <td className={styles.td} style={{ background: '#fffbeb', color: '#92400e' }}>
                                                    {Number(maq.totalMeta.toFixed(1))}
                                                </td>
                                                <td className={`${styles.td} ${getRendimentoColor(maq.totalRealizado, maq.totalMeta)}`} style={{ background: '#f8fafc', borderRight: '2px solid #e2e8f0' }}>
                                                    {maq.totalMeta > 0 ? ((maq.totalRealizado / maq.totalMeta) * 100).toFixed(1) + '%' : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
