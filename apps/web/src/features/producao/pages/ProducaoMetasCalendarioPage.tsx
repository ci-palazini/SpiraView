import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    PageHeader, 
    Card, 
    Button, 
    Input,
    Select,
    Badge,
    Modal
} from '../../../shared/components';
import usePermissions from '../../../hooks/usePermissions';
import { 
    listarSetoresProducao, 
    listarMaquinasProducaoConfig,
    listarMetasPadrao,
    listarMetasDia,
    upsertMetaPadrao,
    upsertMetaDia
} from '../../../services/apiClient';
import type { ProducaoSetor, MaquinaProducaoConfig, ProducaoMetaPadrao, ProducaoMetaDia } from '@spiraview/shared';
import { Calendar, Save, Trash2, Settings, History } from 'lucide-react';

// Ajusta a data para focar no mês selecionado
function generateCalendarDays(year: number, month: number) {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);
    const days = [];
    
    // Fill first week with empty slots if it doesn't start on Sunday
    const startDayOfWeek = startOfMonth.getDay();
    for (let i = 0; i < startDayOfWeek; i++) {
        days.push(null);
    }
    
    for (let d = 1; d <= endOfMonth.getDate(); d++) {
        days.push(new Date(year, month - 1, d));
    }
    
    return days;
}

import { useUsuario } from '../../../contexts/UserContext';
import styles from './ProducaoMetasCalendarioPage.module.css';

export const ProducaoMetasCalendarioPage: React.FC = () => {
    const { t } = useTranslation('common');
    const user = useUsuario();
    const { canEditAny } = usePermissions(user);
    const canEdit = canEditAny(['producao_config']);

    const today = new Date();
    const [ano, setAno] = useState(today.getFullYear());
    const [mes, setMes] = useState(today.getMonth() + 1);
    
    const [setores, setSetores] = useState<ProducaoSetor[]>([]);
    const [maquinas, setMaquinas] = useState<MaquinaProducaoConfig[]>([]);
    const [selectedMaquinaId, setSelectedMaquinaId] = useState<string>('');
    
    const [metasPadrao, setMetasPadrao] = useState<ProducaoMetaPadrao[]>([]);
    const [metasDia, setMetasDia] = useState<ProducaoMetaDia[]>([]);
    
    const [isLoading, setIsLoading] = useState(false);

    // Form Meta Padrão Mensal
    const [padraoLoading, setPadraoLoading] = useState(false);
    const [horasMetaPadrao, setHorasMetaPadrao] = useState<number>(0);

    // Modal Dia Override
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [horasMetaDia, setHorasMetaDia] = useState<number | ''>('');
    const [isDiaModalOpen, setIsDiaModalOpen] = useState(false);

    // Carregar estrutura básica
    useEffect(() => {
        Promise.all([
            listarSetoresProducao(),
            listarMaquinasProducaoConfig()
        ]).then(([sets, maqs]) => {
            setSetores(sets);
            // Mostrar apenas máquinas de produção
            const q = maqs.filter(m => m.escopoProducao);
            setMaquinas(q);
            if (q.length > 0 && !selectedMaquinaId) {
                setSelectedMaquinaId(q[0].id);
            }
        });
    }, []);

    // Carregar metas para o mês/ano selecionado
    useEffect(() => {
        if (!ano || !mes) return;
        setIsLoading(true);
        
        const lastDay = new Date(ano, mes, 0).getDate();
        const startStr = `${ano}-${String(mes).padStart(2, '0')}-01`;
        const endStr = `${ano}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        Promise.all([
            listarMetasPadrao(ano, mes),
            listarMetasDia(startStr, endStr)
        ]).then(([mp, md]) => {
            setMetasPadrao(mp);
            setMetasDia(md);
        }).finally(() => {
            setIsLoading(false);
        });
    }, [ano, mes]);

    // Atualiza input com a meta padrão atual da máquina
    useEffect(() => {
        if (selectedMaquinaId) {
            const metaObj = metasPadrao.find(m => m.maquinaId === selectedMaquinaId);
            setHorasMetaPadrao(metaObj ? Number(metaObj.horasMeta) : 0);
        } else {
            setHorasMetaPadrao(0);
        }
    }, [selectedMaquinaId, metasPadrao]);

    // Handle Salvar Meta Padrão
    const handleSavePadrao = async () => {
        if (!selectedMaquinaId || horasMetaPadrao < 0) return;
        try {
            setPadraoLoading(true);
            const saved = await upsertMetaPadrao({
                maquinaId: selectedMaquinaId,
                ano,
                mes,
                horasMeta: horasMetaPadrao
            });
            // Atualizar lista
            setMetasPadrao(prev => {
                const filt = prev.filter(p => !(p.maquinaId === selectedMaquinaId && p.ano === ano && p.mes === mes));
                return [...filt, saved];
            });
            alert('Meta Mensal salva com sucesso!');
        } catch (err: any) {
            alert(err.message || 'Erro ao salvar meta mensal');
        } finally {
            setPadraoLoading(false);
        }
    };

    // Dia Clicks
    const handleDayClick = (date: Date) => {
        if (!canEdit || !selectedMaquinaId) return;
        setSelectedDate(date);
        
        const dataStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const existing = metasDia.find(m => m.maquinaId === selectedMaquinaId && m.dataRef === dataStr);
        
        if (existing) {
            setHorasMetaDia(Number(existing.horasMeta));
        } else {
            setHorasMetaDia('');
        }
        
        setIsDiaModalOpen(true);
    };

    const handleSaveDiaOverride = async () => {
        if (!selectedDate || !selectedMaquinaId) return;
        
        const dataStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
        const val = horasMetaDia === '' ? null : Number(horasMetaDia);

        try {
            const res = await upsertMetaDia({
                maquinaId: selectedMaquinaId,
                dataRef: dataStr,
                horasMeta: val
            });

            setMetasDia(prev => {
                const filt = prev.filter(p => !(p.maquinaId === selectedMaquinaId && p.dataRef === dataStr));
                if (val === null) return filt;
                return [...filt, res as ProducaoMetaDia];
            });

            setIsDiaModalOpen(false);
        } catch (err: any) {
            alert(err.message || 'Erro ao salvar meta do dia');
        }
    };

    const handleDeleteDiaOverride = async () => {
        if (!selectedDate || !selectedMaquinaId) return;
        const dataStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
        
        try {
            await upsertMetaDia({
                maquinaId: selectedMaquinaId,
                dataRef: dataStr,
                horasMeta: null // Removers
            });
            
            setMetasDia(prev => prev.filter(p => !(p.maquinaId === selectedMaquinaId && p.dataRef === dataStr)));
            setIsDiaModalOpen(false);
        } catch (err: any) {
            alert(err.message || 'Erro ao remover meta do dia');
        }
    };

    // Montar Dropdown Grouped
    const maquinaOptions = useMemo(() => {
        const agp = new Map<string, typeof maquinas>();
        maquinas.forEach(m => {
            const k = m.setorProducaoId || '__none';
            if (!agp.has(k)) agp.set(k, []);
            agp.get(k)!.push(m);
        });

        const opts: { label: string; options: { value: string; label: string }[] }[] = [];
        // Ordenados por ordem do setor
        const sortedSets = [...setores].sort((a,b) => a.ordem - b.ordem);
        
        sortedSets.forEach(s => {
            if (agp.has(s.id)) {
                opts.push({
                    label: s.nome,
                    options: agp.get(s.id)!.map(x => ({ value: x.id, label: x.nomeProducao || x.nome }))
                });
            }
        });
        
        if (agp.has('__none')) {
            opts.push({
                label: 'Sem Setor',
                options: agp.get('__none')!.map(x => ({ value: x.id, label: x.nomeProducao || x.nome }))
            });
        }
        return opts;
    }, [maquinas, setores]);

    const calendarDays = useMemo(() => generateCalendarDays(ano, mes), [ano, mes]);
    const currentMetaObj = metasPadrao.find(m => m.maquinaId === selectedMaquinaId);
    const hasCurrentMeta = !!currentMetaObj;

    return (
        <div className={styles.container}>
            <PageHeader
                title="Metas de Produção Calendário"
            />

            <div className="flex flex-col md:flex-row gap-4 mb-2">
                <div className={`${styles.card} flex-[2]`} style={{ padding: '24px', margin: 0 }}>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase flex items-center gap-2 mb-4">
                        <Settings size={16}/> Seleção
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className={styles.filterGroup}>
                            <label className={styles.filterLabel}>
                                Período
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
                                className="w-full flex-1 rounded-lg border-2 border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none transition-all shadow-sm"
                            />
                        </div>
                        <div className={styles.filterGroup}>
                            <label className={styles.filterLabel}>
                                Máquina
                            </label>
                            {/* Um Select simples que agrupa se possível (o nosso Select basico não suporta optgroup perfeitamente, então fazemos nativo ou convertemos props) */}
                            <select
                                className="w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none transition-all shadow-sm"
                                value={selectedMaquinaId}
                                onChange={e => setSelectedMaquinaId(e.target.value)}
                            >
                                <option value="" disabled>Selecione uma máquina</option>
                                {maquinaOptions.map(grp => (
                                    <optgroup key={grp.label} label={grp.label}>
                                        {grp.options.map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {selectedMaquinaId && (
                    <div className={`${styles.card} flex-1`} style={{ padding: '24px', margin: 0, borderLeft: '4px solid #3b82f6' }}>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase flex items-center gap-2 mb-4">
                            <History size={16}/> Meta Mensal Padrão
                        </h3>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <Input 
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={horasMetaPadrao}
                                    onChange={e => setHorasMetaPadrao(Number(e.target.value))}
                                    placeholder="Ex: 8.5"
                                    disabled={!canEdit}
                                />
                            </div>
                            {canEdit && (
                                <button
                                    className={styles.primaryButton}
                                    onClick={handleSavePadrao}
                                    disabled={padraoLoading}
                                >
                                    {padraoLoading ? '...' : 'Salvar'}
                                </button>
                            )}
                        </div>
                        <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                            {hasCurrentMeta ? (
                                <span className="text-green-600 dark:text-green-400 font-medium bg-green-50 px-2 py-1 rounded">✨ Meta de base: {currentMetaObj.horasMeta} horas</span>
                            ) : (
                                <span>Defina um valor padrão a ser aplicado a todos os dias do mês.</span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {selectedMaquinaId && (
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h2 className={styles.cardTitle}>
                            <Calendar size={20} />
                            Mapeamento de Dias — {new Date(ano, mes-1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric'})}
                        </h2>
                        <div className="text-sm flex gap-4">
                            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#fffbeb] border border-[#fde68a]"></span> Override Específico</div>
                            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-white border border-gray-200"></span> Usa Padrão</div>
                        </div>
                    </div>

                    <div className={styles.calendarGrid}>
                        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                            <div key={day} className="text-center font-medium text-sm text-gray-500 py-2">
                                {day}
                            </div>
                        ))}
                        
                        {calendarDays.map((date, i) => {
                            if (!date) return <div key={`empty-${i}`} className="p-4" />;
                            
                            const dataStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                            const override = metasDia.find(m => m.maquinaId === selectedMaquinaId && m.dataRef === dataStr);
                            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                            
                            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                            const isToday = dataStr === todayStr;

                            const effectiveTarget = override ? override.horasMeta : (currentMetaObj?.horasMeta || 0);

                            const cellClass = `${styles.dayCell} ${override ? styles.hasOverride : ''} ${isWeekend ? 'opacity-60 bg-gray-50' : ''} ${isToday ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`;

                            return (
                                <div 
                                    key={dataStr}
                                    onClick={() => handleDayClick(date)}
                                    className={cellClass}
                                >
                                    <div className={styles.dayHeader}>
                                        <span className={`${styles.date} ${isToday ? 'text-blue-600 font-bold' : ''}`}>
                                            {date.getDate()}
                                        </span>
                                        {override && <span className={`${styles.badge} ${styles.override}`}>Específico</span>}
                                    </div>
                                    <div className="mt-auto text-center flex flex-col gap-1">
                                        {Number(effectiveTarget) === 0 ? (
                                            <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Sem Meta</span>
                                        ) : (
                                            <span className={`text-2xl font-bold ${override ? 'text-amber-600' : 'text-slate-700'}`}>
                                                {effectiveTarget}h
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <Modal
                isOpen={isDiaModalOpen}
                onClose={() => setIsDiaModalOpen(false)}
                title={selectedDate ? `Meta Diária: ${selectedDate.toLocaleDateString('pt-BR')}` : ''}
            >
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md">
                        Definir um valor específico substituirá a meta mensal padrão ({currentMetaObj?.horasMeta || 0}h) apenas para este dia. Deixe vazio para voltar ao padrão.
                    </p>
                    
                    <Input 
                        label="Horas de Produção"
                        type="number"
                        min={0}
                        step={0.1}
                        value={horasMetaDia === '' ? '' : horasMetaDia}
                        onChange={e => setHorasMetaDia(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="Ex: 6.5 (ou vazio para cancelar)"
                        autoFocus
                    />

                    <div className="flex justify-between gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                        {horasMetaDia !== '' && typeof horasMetaDia === 'number' && (
                            <Button variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30" onClick={handleDeleteDiaOverride}>
                                Rem. Override
                            </Button>
                        )}
                        <div className="flex gap-2 ml-auto">
                            <Button variant="ghost" onClick={() => setIsDiaModalOpen(false)}>
                                Cancelar
                            </Button>
                            <Button color="primary" onClick={handleSaveDiaOverride}>
                                Salvar Meta
                            </Button>
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
