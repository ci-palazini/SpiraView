// src/components/CustomizeShortcutsModal.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiX, FiCheck, FiRefreshCw } from 'react-icons/fi';
import type { ShortcutDefinition } from '../hooks/useHomeShortcuts';
import styles from './CustomizeShortcutsModal.module.css';

interface CustomizeShortcutsModalProps {
    isOpen: boolean;
    onClose: () => void;
    availableShortcuts: ShortcutDefinition[];
    selectedIds: string[];
    toggleShortcut: (id: string) => void;
    resetToDefaults: () => void;
    maxShortcuts: number;
    canAddMore: boolean;
}

const CustomizeShortcutsModal: React.FC<CustomizeShortcutsModalProps> = ({
    isOpen,
    onClose,
    availableShortcuts,
    selectedIds,
    toggleShortcut,
    resetToDefaults,
    maxShortcuts,
    canAddMore,
}) => {
    const { t } = useTranslation();

    if (!isOpen) return null;

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className={styles.backdrop} onClick={handleBackdropClick}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <div>
                        <h2 className={styles.title}>
                            {t('inicio.customizeModal.title', 'Personalizar Atalhos')}
                        </h2>
                        <p className={styles.subtitle}>
                            {t('inicio.customizeModal.subtitle', 'Selecione até {{max}} atalhos para exibir na página inicial', { max: maxShortcuts })}
                        </p>
                    </div>
                    <button className={styles.closeButton} onClick={onClose} aria-label="Fechar">
                        <FiX />
                    </button>
                </div>

                <div className={styles.counter}>
                    <span className={selectedIds.length >= maxShortcuts ? styles.counterFull : ''}>
                        {selectedIds.length} / {maxShortcuts}
                    </span>
                    {t('inicio.customizeModal.selected', 'selecionados')}
                </div>

                <div className={styles.grid}>
                    {availableShortcuts.map((shortcut) => {
                        const isSelected = selectedIds.includes(shortcut.id);
                        const isDisabled = !isSelected && !canAddMore;
                        const Icon = shortcut.icon;

                        return (
                            <button
                                key={shortcut.id}
                                className={`${styles.shortcutItem} ${isSelected ? styles.selected : ''} ${isDisabled ? styles.disabled : ''}`}
                                onClick={() => !isDisabled && toggleShortcut(shortcut.id)}
                                disabled={isDisabled}
                            >
                                <div className={styles.shortcutIcon}>
                                    <Icon />
                                </div>
                                <span className={styles.shortcutLabel}>
                                    {t(shortcut.titleKey, shortcut.id)}
                                </span>
                                {isSelected && (
                                    <div className={styles.checkMark}>
                                        <FiCheck />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className={styles.footer}>
                    <button className={styles.resetButton} onClick={resetToDefaults}>
                        <FiRefreshCw />
                        {t('inicio.customizeModal.reset', 'Restaurar padrão')}
                    </button>
                    <button className={styles.saveButton} onClick={onClose}>
                        {t('inicio.customizeModal.save', 'Concluído')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CustomizeShortcutsModal;
