import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { FiCalendar, FiSettings, FiSave, FiClock } from 'react-icons/fi';
import { 
    PageHeader, 
    Button, 
    Input,
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
import { useUsuario } from '../../../contexts/UserContext';
import styles from './ProducaoMetasCalendarioPage.module.css';

function generateCalendarDays(year: number, month: number) {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);
    const days: (Date | null)[] = [];
    
    const startDayOfWeek = startOfMonth.getDay();
    for (let i = 0; i < startDayOfWeek; i++) {
        days.push(null);
    }
    
    for (let d = 1; d <= endOfMonth.getDate(); d++) {
        days.push(new Date(year, month - 1, d));
    }
    
    return days;
}

const ProducaoMetasCalendarioPage: React.FC = () => {
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

    // Form Meta Padrao
    const [padraoLoading, setPadraoLoading] = useState(false);
    const [horasMetaPadrao, setHorasMetaPadrao] = useState<number>(0);

    // Modal Dia Override
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [horasMetaDia, setHorasMetaDia] = useState<number | ''>('');
    const [isDiaModalOpen, setIsDiaModalOpen] = useState(false);

    useEffect(() => {
        Promise.all([
            listarSetoresProducao(),
            listarMaquinasProducaoConfig()
        ]).then(([sets, maqs]) => {
            setSetores(sets);
            const q = maqs.filter(m => m.escopoProducao);
            setMaquinas(q);
            if (q.length > 0 && !selectedMaquinaId) {
                setSelectedMaquinaId(q[0].id);
            }
        });
    }, []);

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

    useEffect(() => {
        if (selectedMaquinaId) {
            const metaObj = metasPadrao.find(m => m.maquinaId === selectedMaquinaId);
            setHorasMetaPadrao(metaObj ? Number(metaObj.horasMeta) : 0);
        } else {
            setHorasMetaPadrao(0);
        }
    }, [selectedMaquinaId, metasPadrao]);

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
            setMetasPadrao(prev => {
                const filt = prev.filter(p => !(p.maquinaId === selectedMaquinaId && p.ano === ano && p.mes === mes));
                return [...filt, saved];
            });
            toast.success(t('producao.metas.toast.standardSaved', 'Meta mensal salva com sucesso'));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('producao.metas.errors.savePadrao', 'Erro ao salvar meta mensal');
            toast.error(msg);
        } finally {
            setPadraoLoading(false);
        }
    };

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
            toast.success(t('producao.metas.toast.daySaved', 'Meta do dia salva'));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('producao.metas.errors.saveDay', 'Erro ao salvar meta do dia');
            toast.error(msg);
        }
    };

    const handleDeleteDiaOverride = async () => {
        if (!selectedDate || !selectedMaquinaId) return;
        const dataStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
        
        try {
            await upsertMetaDia({
                maquinaId: selectedMaquinaId,
                dataRef: dataStr,
                horasMeta: null
            });
            
            setMetasDia(prev => prev.filter(p => !(p.maquinaId === selectedMaquinaId && p.dataRef === dataStr)));
            setIsDiaModalOpen(false);
            toast.success(t('producao.metas.toast.dayRemoved', 'Override removido'));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('producao.metas.errors.removeDay', 'Erro ao remover override');
            toast.error(msg);
        }
    };

    const maquinaOptions = useMemo(() => {
        const agp = new Map<string, typeof maquinas>();
        maquinas.forEach(m => {
            const k = m.setorProducaoId || '__none';
            if (!agp.has(k)) agp.set(k, []);
            agp.get(k)!.push(m);
        });

        const opts: { label: string; options: { value: string; label: string }[] }[] = [];
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
                label: t('producao.metas.noSector', 'Sem Setor'),
                options: agp.get('__none')!.map(x => ({ value: x.id, label: x.nomeProducao || x.nome }))
            });
        }
        return opts;
    }, [maquinas, setores, t]);

    const calendarDays = useMemo(() => generateCalendarDays(ano, mes), [ano, mes]);
    const currentMetaObj = metasPadrao.find(m => m.maquinaId === selectedMaquinaId);
    const hasCurrentMeta = !!currentMetaObj;

    const weekDays = [
        t('producao.metas.weekdays.sun', 'Dom'),
        t('producao.metas.weekdays.mon', 'Seg'),
        t('producao.metas.weekdays.tue', 'Ter'),
        t('producao.metas.weekdays.wed', 'Qua'),
        t('producao.metas.weekdays.thu', 'Qui'),
        t('producao.metas.weekdays.fri', 'Sex'),
        t('producao.metas.weekdays.sat', 'Sab'),
    ];

    return (
        <>
            <PageHeader
                title={t('producao.metas.title', 'Metas de Producao')}
                subtitle={t('producao.metas.subtitle', 'Defina metas mensais e overrides diarios por maquina')}
            />

            <div className={styles.container}>
                {/* Top Controls */}
                <div className={styles.controlsRow}>
                    <div className={styles.filterCard}>
                        <div className={styles.filterSection}>
                            <label className={styles.filterLabel}>
                                <FiCalendar size={14} />
                                {t('producao.metas.period', 'Periodo')}
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
                                className={styles.monthInput}
                            />
                        </div>
                        <div className={styles.filterSection}>
                            <label className={styles.filterLabel}>
                                <FiSettings size={14} />
                                {t('producao.metas.machine', 'Maquina')}
                            </label>
                            <select
                                className={styles.machineSelect}
                                value={selectedMaquinaId}
                                onChange={e => setSelectedMaquinaId(e.target.value)}
                            >
                                <option value="" disabled>{t('producao.metas.selectMachine', 'Selecione uma maquina')}</option>
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

                    {selectedMaquinaId && (
                        <div className={styles.standardMetaCard}>
                            <label className={styles.filterLabel}>
                                <FiClock size={14} />
                                {t('producao.metas.standardGoal', 'Meta Mensal Padrao')}
                            </label>
                            <div className={styles.standardMetaRow}>
                                <div className={styles.standardMetaInput}>
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
                                        className={styles.saveButton}
                                        onClick={handleSavePadrao}
                                        disabled={padraoLoading}
                                    >
                                        <FiSave size={14} />
                                        {padraoLoading ? '...' : t('common.save', 'Salvar')}
                                    </button>
                                )}
                            </div>
                            <div className={styles.metaInfo}>
                                {hasCurrentMeta ? (
                                    <span className={styles.metaActive}>
                                        {t('producao.metas.currentBase', 'Meta base')}: {currentMetaObj.horasMeta}h
                                    </span>
                                ) : (
                                    <span className={styles.metaEmpty}>
                                        {t('producao.metas.defineDefault', 'Defina um valor padrao para todos os dias do mes.')}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Calendar */}
                {selectedMaquinaId && (
                    <div className={styles.calendarCard}>
                        <div className={styles.calendarHeader}>
                            <h2 className={styles.calendarTitle}>
                                <FiCalendar size={18} />
                                {new Date(ano, mes-1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric'})}
                            </h2>
                            <div className={styles.legendRow}>
                                <div className={styles.legendItem}>
                                    <span className={styles.legendDotOverride}></span>
                                    {t('producao.metas.legend.override', 'Override')}
                                </div>
                                <div className={styles.legendItem}>
                                    <span className={styles.legendDotDefault}></span>
                                    {t('producao.metas.legend.default', 'Padrao')}
                                </div>
                            </div>
                        </div>

                        <div className={styles.calendarGrid}>
                            {weekDays.map(day => (
                                <div key={day} className={styles.weekdayLabel}>{day}</div>
                            ))}
                            
                            {calendarDays.map((date, i) => {
                                if (!date) return <div key={`empty-${i}`} className={styles.emptyCell} />;
                                
                                const dataStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                                const override = metasDia.find(m => m.maquinaId === selectedMaquinaId && m.dataRef === dataStr);
                                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                                
                                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                                const isToday = dataStr === todayStr;

                                const effectiveTarget = override
                                    ? override.horasMeta
                                    : (isWeekend ? 0 : (currentMetaObj?.horasMeta || 0));

                                return (
                                    <div 
                                        key={dataStr}
                                        onClick={() => handleDayClick(date)}
                                        className={`${styles.dayCell} ${override ? styles.hasOverride : ''} ${isWeekend ? styles.weekend : ''} ${isToday ? styles.today : ''}`}
                                    >
                                        <div className={styles.dayHeader}>
                                            <span className={`${styles.dayNumber} ${isToday ? styles.dayToday : ''}`}>
                                                {date.getDate()}
                                            </span>
                                            {override && <span className={styles.overrideBadge}>{t('producao.metas.specific', 'Espec.')}</span>}
                                        </div>
                                        <div className={styles.dayValue}>
                                            {Number(effectiveTarget) === 0 ? (
                                                <span className={styles.noMeta}>{t('producao.metas.noGoal', 'Sem Meta')}</span>
                                            ) : (
                                                <span className={`${styles.metaValue} ${override ? styles.metaOverride : ''}`}>
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

                {/* Day Override Modal */}
                <Modal
                    isOpen={isDiaModalOpen}
                    onClose={() => setIsDiaModalOpen(false)}
                    title={selectedDate ? `${t('producao.metas.modal.dailyGoal', 'Meta Diaria')}: ${selectedDate.toLocaleDateString('pt-BR')}` : ''}
                >
                    <div className={styles.modalContent}>
                        <p className={styles.modalHelp}>
                            {t('producao.metas.modal.overrideHelp', {
                                meta: currentMetaObj?.horasMeta || 0,
                                defaultValue: `Definir um valor especifico substituira a meta mensal padrao (${currentMetaObj?.horasMeta || 0}h) apenas para este dia. Deixe vazio para voltar ao padrao.`
                            })}
                        </p>
                        
                        <Input 
                            label={t('producao.metas.modal.hoursLabel', 'Horas de Producao')}
                            type="number"
                            min={0}
                            step={0.1}
                            value={horasMetaDia === '' ? '' : horasMetaDia}
                            onChange={e => setHorasMetaDia(e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder={t('producao.metas.modal.hoursPlaceholder', 'Ex: 6.5 (ou vazio para cancelar)')}
                            autoFocus
                        />

                        <div className={styles.modalActions}>
                            {horasMetaDia !== '' && typeof horasMetaDia === 'number' && (
                                <Button variant="ghost" className={styles.removeButton} onClick={handleDeleteDiaOverride}>
                                    {t('producao.metas.modal.removeOverride', 'Remover Override')}
                                </Button>
                            )}
                            <div className={styles.modalButtonGroup}>
                                <Button variant="ghost" onClick={() => setIsDiaModalOpen(false)}>
                                    {t('common.cancel', 'Cancelar')}
                                </Button>
                                <Button color="primary" onClick={handleSaveDiaOverride}>
                                    {t('common.save', 'Salvar')}
                                </Button>
                            </div>
                        </div>
                    </div>
                </Modal>
            </div>
        </>
    );
};

export default ProducaoMetasCalendarioPage;
