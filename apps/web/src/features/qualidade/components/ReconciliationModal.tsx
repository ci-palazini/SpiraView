import React, { useState, useEffect } from 'react';
import { FiCheck, FiPlus, FiArrowRight, FiAlertTriangle } from 'react-icons/fi';
import { QualidadeOpcao } from '../../../services/apiClient';
import styles from './ReconciliationModal.module.css';

interface ReconciliationModalProps {
    unknowns: {
        origens: string[];
        motivos: string[];
        responsaveis: string[];
    };
    existing: {
        origens: QualidadeOpcao[];
        motivos: QualidadeOpcao[];
        responsaveis: QualidadeOpcao[];
    };
    onConfirm: (actions: ReconciliationActions) => void;
    onCancel: () => void;
}

export interface ReconciliationActions {
    origens: Record<string, ActionItem>;
    motivos: Record<string, ActionItem>;
    responsaveis: Record<string, ActionItem>;
}

export interface ActionItem {
    type: 'create' | 'map';
    targetValue?: string; // If map, which existing ID/Name?
}

export const ReconciliationModal: React.FC<ReconciliationModalProps> = ({ unknowns, existing, onConfirm, onCancel }) => {
    const [actions, setActions] = useState<ReconciliationActions>({
        origens: {},
        motivos: {},
        responsaveis: {}
    });

    // Initialize actions with 'create' by default
    useEffect(() => {
        const initialAcc: ReconciliationActions = { origens: {}, motivos: {}, responsaveis: {} };
        unknowns.origens.forEach(v => initialAcc.origens[v] = { type: 'create' });
        unknowns.motivos.forEach(v => initialAcc.motivos[v] = { type: 'create' });
        unknowns.responsaveis.forEach(v => initialAcc.responsaveis[v] = { type: 'create' });
        setActions(initialAcc);
    }, [unknowns]); // Depend only on unknowns structure change

    const updateAction = (category: keyof ReconciliationActions, key: string, updates: Partial<ActionItem>) => {
        setActions(prev => ({
            ...prev,
            [category]: {
                ...prev[category],
                [key]: { ...prev[category][key], ...updates }
            }
        }));
    };

    const isValid = () => {
        // Check if all 'map' actions have a targetValue
        const check = (cat: Record<string, ActionItem>) => Object.values(cat).every(a => a.type === 'create' || (a.type === 'map' && a.targetValue));
        return check(actions.origens) && check(actions.motivos) && check(actions.responsaveis);
    };

    const renderSection = (
        title: string,
        items: string[],
        category: keyof ReconciliationActions,
        existingOptions: QualidadeOpcao[]
    ) => {
        if (items.length === 0) return null;
        return (
            <div className={styles.section}>
                <h4 className={styles.sectionTitle}>{title} ({items.length})</h4>
                <div className={styles.list}>
                    {items.map(item => {
                        const action = actions[category][item] || { type: 'create' };
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
                                            name={`${category}-${item}`}
                                            checked={action.type === 'create'}
                                            onChange={() => updateAction(category, item, { type: 'create' })}
                                        />
                                        <FiPlus /> Criar Novo
                                    </label>
                                    <label className={`${styles.option} ${action.type === 'map' ? styles.active : ''}`}>
                                        <input
                                            type="radio"
                                            name={`${category}-${item}`}
                                            checked={action.type === 'map'}
                                            onChange={() => updateAction(category, item, { type: 'map', targetValue: '' })}
                                        />
                                        <FiArrowRight /> Associar a...
                                    </label>
                                </div>
                                {action.type === 'map' && (
                                    <select
                                        className={styles.mapSelect}
                                        value={action.targetValue || ''}
                                        onChange={(e) => updateAction(category, item, { targetValue: e.target.value })}
                                    >
                                        <option value="">Selecione...</option>
                                        {existingOptions.map(opt => (
                                            <option key={opt.id} value={opt.nome}>{opt.nome}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h3>Itens Desconhecidos Identificados</h3>
                    <p>Alguns itens no arquivo não constam no cadastro. O que deseja fazer?</p>
                </div>

                <div className={styles.content}>
                    {renderSection('Origens', unknowns.origens, 'origens', existing.origens)}
                    {renderSection('Motivos', unknowns.motivos, 'motivos', existing.motivos)}
                    {renderSection('Responsáveis', unknowns.responsaveis, 'responsaveis', existing.responsaveis)}
                </div>

                <div className={styles.footer}>
                    <button className={styles.cancelBtn} onClick={onCancel}>Cancelar Importação</button>
                    <button
                        className={styles.confirmBtn}
                        onClick={() => onConfirm(actions)}
                        disabled={!isValid()}
                    >
                        Processar ({unknowns.origens.length + unknowns.motivos.length + unknowns.responsaveis.length} itens)
                    </button>
                </div>
            </div>
        </div>
    );
};
