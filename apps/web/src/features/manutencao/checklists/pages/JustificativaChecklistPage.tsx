import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { FiCheckSquare, FiAlertTriangle, FiCheck, FiClock, FiFilter, FiList } from 'react-icons/fi';
import PageHeader from '../../../../shared/components/PageHeader';
import { Button } from '../../../../shared/components';
import { http as api } from '../../../../services/apiClient';
import { formatDate } from '../../../../shared/utils/dateUtils';
import styles from './JustificativaChecklistPage.module.css';

interface Pendencia {
    id: string;
    maquina_id: string;
    maquina_nome: string;
    data_ref: string;
    turno: string;
    status: string;
    selected?: boolean;
}

interface HistoryItem {
    id: string;
    maquina_nome: string;
    data_ref: string;
    turno: string;
    justificativa: string;
    justificado_em: string;
    justificado_por_nome?: string;
}

const JustificativaChecklistPage = () => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [pendencias, setPendencias] = useState<Pendencia[]>([]);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Filters
    const [filterTurno, setFilterTurno] = useState<string>('todos'); // 'todos', '1', '2'

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [justificativa, setJustificativa] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const loadPendencias = async () => {
        setLoading(true);
        try {
            const data = await api.get<Pendencia[]>('/checklists/pendencias');
            setPendencias(data.map((d) => ({ ...d, selected: false })));
        } catch (error) {
            console.error(error);
            toast.error('Erro ao carregar pendências.');
        } finally {
            setLoading(false);
        }
    };

    const loadHistory = async () => {
        setHistoryLoading(true);
        try {
            const data = await api.get<HistoryItem[]>('/checklists/pendencias/historico?limit=20');
            setHistory(data);
        } catch (error) {
            console.error(error);
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        loadPendencias();
        loadHistory();
    }, []);

    const toggleSelect = (id: string) => {
        setPendencias(prev => prev.map(p =>
            p.id === id ? { ...p, selected: !p.selected } : p
        ));
    };

    const toggleAll = () => {
        const anyUnselected = filteredPendencias.some(p => !p.selected);
        const newSelected = anyUnselected; // If any unselected, select all. Else deselect all.

        setPendencias(prev => prev.map(p => {
            // Only toggle visible items
            if (filteredPendencias.some(fp => fp.id === p.id)) {
                return { ...p, selected: newSelected };
            }
            return p;
        }));
    };

    const filteredPendencias = useMemo(() => {
        return pendencias.filter(p => {
            if (filterTurno === 'todos') return true;
            // Backend returns '1º', '2º'. Filter usually is '1', '2' or check presence
            if (filterTurno === '1') return p.turno.includes('1');
            if (filterTurno === '2') return p.turno.includes('2');
            return true;
        });
    }, [pendencias, filterTurno]);

    const selectedCount = pendencias.filter(p => p.selected).length;

    const handleJustificarClick = () => {
        if (selectedCount === 0) {
            toast.error('Selecione pelo menos um item.');
            return;
        }
        setJustificativa('');
        setIsModalOpen(true);
    };

    const handleSubmit = async () => {
        if (!justificativa.trim()) {
            toast.error('Informe uma justificativa.');
            return;
        }

        const ids = pendencias.filter(p => p.selected).map(p => p.id);
        setSubmitting(true);
        try {
            await api.post('/checklists/pendencias/justificar', {
                data: { ids, justificativa }
            });
            toast.success('Justificativa enviada com sucesso!');
            setIsModalOpen(false);
            loadPendencias(); // Reload pending
            loadHistory();    // Reload history
        } catch (error) {
            console.error(error);
            toast.error('Erro ao enviar justificativa.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <PageHeader
                title="Justificativa de Checklists Pendentes"
                subtitle="Consulte e justifique checklists não enviados nos turnos anteriores."
            />

            <div className={styles.container}>
                <div className={styles.splitLayout}>
                    {/* Left Panel: Pendencies */}
                    <div className={styles.leftPanel}>
                        <div className={styles.panelHeader}>
                            <h3>
                                <FiList />
                                Itens Pendentes
                            </h3>
                            {selectedCount > 0 && (
                                <span style={{ fontSize: '0.875rem', color: '#666' }}>
                                    {selectedCount} selecionados
                                </span>
                            )}
                        </div>

                        <div className={styles.filters}>
                            <div className={styles.filterGroup}>
                                <label htmlFor="turnoSelect" className={styles.filterLabel}>
                                    <FiFilter style={{ marginRight: 4, display: "inline-block", verticalAlign: "middle" }} />
                                    Filtrar Turno:
                                </label>
                                <select
                                    id="turnoSelect"
                                    className={styles.select}
                                    value={filterTurno}
                                    onChange={e => setFilterTurno(e.target.value)}
                                >
                                    <option value="todos">Todos os Turnos</option>
                                    <option value="1">1º Turno</option>
                                    <option value="2">2º Turno</option>
                                </select>
                            </div>

                            <div style={{ marginLeft: 'auto' }}>
                                <Button
                                    onClick={handleJustificarClick}
                                    disabled={selectedCount === 0}
                                    variant={selectedCount > 0 ? "primary" : "ghost"}
                                    size="sm"
                                >
                                    <FiCheck style={{ marginRight: 8 }} />
                                    Justificar Selecionados
                                </Button>
                            </div>
                        </div>

                        <div className={styles.tableWrapper}>
                            {loading ? (
                                <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>
                            ) : filteredPendencias.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <FiCheckSquare size={32} style={{ marginBottom: '1rem', color: '#10b981' }} />
                                    <p>Nenhuma pendência encontrada para o filtro atual.</p>
                                </div>
                            ) : (
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: 40 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={filteredPendencias.length > 0 && filteredPendencias.every(p => p.selected)}
                                                    onChange={toggleAll}
                                                />
                                            </th>
                                            <th>Data</th>
                                            <th>Turno</th>
                                            <th>Máquina</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredPendencias.map(p => (
                                            <tr key={p.id} className={p.selected ? styles.selectedRow : ''}>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        checked={p.selected}
                                                        onChange={() => toggleSelect(p.id)}
                                                    />
                                                </td>
                                                <td>{p.data_ref.split('-').reverse().join('/')}</td>
                                                <td>{p.turno}</td>
                                                <td className={styles.machineName}>{p.maquina_nome}</td>
                                                <td>
                                                    <span className={styles.statusBadge} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, backgroundColor: '#FEF3C7', color: '#D97706', fontSize: '0.75rem', fontWeight: 600 }}>
                                                        <FiAlertTriangle size={12} />
                                                        Pendente
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    {/* Right Panel: History */}
                    <div className={styles.rightPanel}>
                        <div className={styles.panelHeader}>
                            <h3>
                                <FiClock />
                                Histórico Recente
                            </h3>
                        </div>

                        {historyLoading ? (
                            <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>
                        ) : history.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>
                                <p>Nenhuma justificativa recente.</p>
                            </div>
                        ) : (
                            <ul className={styles.historyList}>
                                {/* Grouping Logic */}
                                {Object.values(
                                    history.reduce((acc, item) => {
                                        const key = `${item.data_ref}-${item.turno}-${item.justificativa}`;
                                        if (!acc[key]) {
                                            acc[key] = {
                                                ...item,
                                                maquinas: [item.maquina_nome],
                                                count: 1
                                            };
                                        } else {
                                            acc[key].maquinas.push(item.maquina_nome);
                                            acc[key].count++;
                                        }
                                        return acc;
                                    }, {} as Record<string, HistoryItem & { maquinas: string[], count: number }>)
                                ).sort((a, b) => new Date(b.justificado_em).getTime() - new Date(a.justificado_em).getTime())
                                    .map((group, index) => (
                                        <li key={index} className={styles.historyItem}>
                                            <div className={styles.historyHeader}>
                                                <span style={{ fontWeight: 600, color: '#1e293b' }}>
                                                    {group.data_ref.split('-').reverse().join('/')} - {group.turno}
                                                </span>
                                                <span>{formatDate(group.justificado_em)}</span>
                                            </div>

                                            <div className={styles.historyReason}>
                                                "{group.justificativa}"
                                            </div>

                                            <details className={styles.machinesDetails}>
                                                <summary>
                                                    {group.count === 1
                                                        ? `1 máquina afetada: ${group.maquinas[0]}`
                                                        : `${group.count} máquinas afetadas (ver lista)`
                                                    }
                                                </summary>
                                                <div className={styles.machinesList}>
                                                    {group.maquinas.map((m, i) => (
                                                        <span key={i} className={styles.machineTag}>{m}</span>
                                                    ))}
                                                </div>
                                            </details>

                                            <div className={styles.historyFooter}>
                                                Por: {group.justificado_por_nome || 'Desconhecido'}
                                            </div>
                                        </li>
                                    ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {isModalOpen && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modal}>
                        <h3>Justificar {selectedCount} itens</h3>
                        <p>Por favor, explique o motivo do não envio dos checklists selecionados:</p>

                        <textarea
                            className={styles.textarea}
                            rows={4}
                            value={justificativa}
                            onChange={e => setJustificativa(e.target.value)}
                            placeholder="Ex: Máquina em manutenção corretiva durante todo o turno..."
                        />

                        <div className={styles.modalButtons}>
                            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                                Cancelar
                            </Button>
                            <Button onClick={handleSubmit} disabled={submitting}>
                                {submitting ? 'Enviando...' : 'Confirmar Justificativa'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default JustificativaChecklistPage;
