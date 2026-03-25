import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronDown, FiX } from 'react-icons/fi';
import type { Departamento } from '@spiraview/shared';
import styles from './DepartmentFilter.module.css';

interface DepartmentFilterProps {
    departamentos: Departamento[];
    selectedDepartamentos: string[];
    onChange: (selected: string[]) => void;
    compact?: boolean;
}

export default function DepartmentFilter({
    departamentos,
    selectedDepartamentos,
    onChange,
    compact = false,
}: DepartmentFilterProps) {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleToggleDepartamento = (id: string) => {
        const updated = selectedDepartamentos.includes(id)
            ? selectedDepartamentos.filter((d) => d !== id)
            : [...selectedDepartamentos, id];
        onChange(updated);
    };

    const handleRemove = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(selectedDepartamentos.filter((d) => d !== id));
    };

    const handleClearAll = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange([]);
    };

    const selectedNames = selectedDepartamentos
        .map((id) => departamentos.find((d) => d.id === id)?.nome)
        .filter(Boolean);

    if (compact) {
        return (
            <div className={`${styles.filterContainer} ${styles.compact}`}>
                <div className={styles.filterLabel}>
                    {t('departamento', 'Departamento')}
                </div>

                <div className={styles.pillsContainer}>
                    {departamentos.map((dept) => (
                        <button
                            key={dept.id}
                            onClick={() => handleToggleDepartamento(dept.id)}
                            className={`${styles.pill} ${selectedDepartamentos.includes(dept.id) ? styles.pillSelected : ''}`}
                            title={dept.nome}
                        >
                            <span className={styles.pillText}>{dept.nome}</span>
                            {dept.colaboradores_count && (
                                <span className={styles.pillCount}>{dept.colaboradores_count}</span>
                            )}
                        </button>
                    ))}
                </div>

                {selectedDepartamentos.length > 0 && (
                    <button
                        onClick={handleClearAll}
                        className={styles.clearButton}
                    >
                        {t('common.clear', 'Limpar tudo')}
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className={styles.filterContainer}>
            <div className={styles.filterLabel}>
                {t('departamento', 'Departamento')}
            </div>

            <div ref={dropdownRef} className={styles.dropdownWrapper}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={`${styles.dropdownButton} ${isOpen ? styles.open : ''}`}
                >
                    <div className={styles.buttonContent}>
                        {selectedDepartamentos.length === 0 ? (
                            <span className={styles.placeholder}>
                                {t('common.select', 'Selecionar')}
                            </span>
                        ) : (
                            <span className={styles.selectedCount}>
                                {selectedDepartamentos.length} selecionado{selectedDepartamentos.length !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                    <FiChevronDown className={styles.chevron} size={18} />
                </button>

                {isOpen && (
                    <div className={styles.dropdownMenu}>
                        <div className={styles.menuHeader}>
                            <span className={styles.menuTitle}>
                                {departamentos.length} departamento{departamentos.length !== 1 ? 's' : ''}
                            </span>
                            {selectedDepartamentos.length > 0 && (
                                <button
                                    onClick={handleClearAll}
                                    className={styles.clearLink}
                                >
                                    {t('common.clear', 'Limpar')}
                                </button>
                            )}
                        </div>

                        <div className={styles.optionsList}>
                            {departamentos.map((dept) => (
                                <label key={dept.id} className={styles.option}>
                                    <input
                                        type="checkbox"
                                        checked={selectedDepartamentos.includes(dept.id)}
                                        onChange={() => handleToggleDepartamento(dept.id)}
                                        className={styles.checkbox}
                                    />
                                    <span className={styles.optionLabel}>{dept.nome}</span>
                                    {dept.colaboradores_count ? (
                                        <span className={styles.count}>
                                            {dept.colaboradores_count}
                                        </span>
                                    ) : null}
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {selectedDepartamentos.length > 0 && (
                <div className={styles.chipContainer}>
                    {selectedNames.map((name, idx) => (
                        <div key={idx} className={styles.chip}>
                            <span>{name}</span>
                            <button
                                onClick={(e) => handleRemove(selectedDepartamentos[idx], e)}
                                className={styles.chipRemove}
                                aria-label="Remove"
                            >
                                <FiX size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
