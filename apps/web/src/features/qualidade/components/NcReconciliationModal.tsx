import React, { useState, useEffect } from 'react';
import { FiCheck, FiPlus, FiArrowRight, FiAlertTriangle } from 'react-icons/fi';
import { QualidadeOpcao } from '../../../services/apiClient';
import styles from './ReconciliationModal.module.css';

interface NcReconciliationModalProps {
    unknowns: string[];
    existing: QualidadeOpcao[];
    onConfirm: (actions: Record<string, ActionItem>) => void;
    onCancel: () => void;
}

export interface ActionItem {
    type: 'create' | 'map';
    targetValue?: string; // If map, which existing ID/Name?
}

export const NcReconciliationModal: React.FC<NcReconciliationModalProps> = ({ unknowns, existing, onConfirm, onCancel }) => {
    const [actions, setActions] = useState<Record<string, ActionItem>>({});

    // Initialize actions with 'create' by default
    useEffect(() => {
        const initialAcc: Record<string, ActionItem> = {};
        unknowns.forEach(v => initialAcc[v] = { type: 'create' });
        setActions(initialAcc);
    }, [unknowns]);

    const updateAction = (key: string, updates: Partial<ActionItem>) => {
        setActions(prev => ({
            ...prev,
            [key]: { ...prev[key], ...updates }
        }));
    };

    const isValid = () => {
        // Check if all 'map' actions have a targetValue
        return Object.values(actions).every(a => a.type === 'create' || (a.type === 'map' && a.targetValue));
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h3>Não Conformidades Desconhecidas</h3>
                    <p>Algumas não conformidades no arquivo não constam no cadastro. O que deseja fazer?</p>
                </div>

                <div className={styles.content}>
                    <div className={styles.section}>
                        <h4 className={styles.sectionTitle}>Não Conformidades ({unknowns.length})</h4>
                        <div className={styles.list}>
                            {unknowns.map(item => {
                                const action = actions[item] || { type: 'create' };
                                return (
                                    <div key={item} className={styles.row}>
                                        <div className={styles.valueDisplay}>
                                            <FiAlertTriangle className={styles.icon} />
                                            <span>{item}</span>
                                        </div>
                                        <div className={styles.controls}>
                                            <label className={`${styles.option} ${action.type === 'create' ? styles.active : ''}`}>
                                                <input
                                                    type="radio"
                                                    name={`nc-${item}`}
                                                    checked={action.type === 'create'}
                                                    onChange={() => updateAction(item, { type: 'create' })}
                                                />
                                                <FiPlus /> Criar Nova
                                            </label>
                                            <label className={`${styles.option} ${action.type === 'map' ? styles.active : ''}`}>
                                                <input
                                                    type="radio"
                                                    name={`nc-${item}`}
                                                    checked={action.type === 'map'}
                                                    onChange={() => updateAction(item, { type: 'map', targetValue: '' })}
                                                />
                                                <FiArrowRight /> Associar a...
                                            </label>
                                        </div>
                                        {action.type === 'map' && (
                                            <select
                                                className={styles.mapSelect}
                                                value={action.targetValue || ''}
                                                onChange={(e) => updateAction(item, { targetValue: e.target.value })}
                                            >
                                                <option value="">Selecione...</option>
                                                {existing.map(opt => (
                                                    <option key={opt.id} value={opt.nome}>{opt.nome}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className={styles.footer}>
                    <button className={styles.cancelBtn} onClick={onCancel}>Cancelar Importação</button>
                    <button
                        className={styles.confirmBtn}
                        onClick={() => onConfirm(actions)}
                        disabled={!isValid()}
                    >
                        Processar ({unknowns.length} itens)
                    </button>
                </div>
            </div>
        </div>
    );
};
