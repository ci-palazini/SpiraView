// SelectList.tsx
import React, { useState, useMemo } from 'react';
import { Check, Search } from 'lucide-react';
import styles from './SelectList.module.css';

export interface SelectListOption {
    id: string;
    label: string;
    subtitle?: string;
    avatar?: string; // URL or initials
    disabled?: boolean;
}

export interface SelectListProps {
    label?: string;
    required?: boolean;
    options: SelectListOption[];
    value?: string;
    onChange: (id: string) => void;
    placeholder?: string;
    emptyMessage?: string;
    searchable?: boolean;
    searchPlaceholder?: string;
    layout?: 'list' | 'grid';
    disabled?: boolean;
    className?: string;
}

function getInitials(name: string): string {
    return name
        .split(' ')
        .map((word) => word[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

export function SelectList({
    label,
    required,
    options,
    value,
    onChange,
    placeholder = 'Selecione uma opção',
    emptyMessage = 'Nenhuma opção disponível',
    searchable = false,
    searchPlaceholder = 'Buscar...',
    layout = 'list',
    disabled = false,
    className = '',
}: SelectListProps) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredOptions = useMemo(() => {
        if (!searchTerm.trim()) return options;
        const term = searchTerm.toLowerCase();
        return options.filter(
            (opt) =>
                opt.label.toLowerCase().includes(term) ||
                opt.subtitle?.toLowerCase().includes(term)
        );
    }, [options, searchTerm]);

    const handleSelect = (id: string, optDisabled?: boolean) => {
        if (disabled || optDisabled) return;
        onChange(id);
    };

    return (
        <div className={`${styles.container} ${className}`}>
            {label && (
                <label className={styles.label}>
                    {label}
                    {required && <span className={styles.required}>*</span>}
                </label>
            )}

            {searchable && (
                <div className={styles.searchWrapper}>
                    <Search className={styles.searchIcon} size={18} />
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder={searchPlaceholder}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        disabled={disabled}
                    />
                </div>
            )}

            {filteredOptions.length === 0 ? (
                <div className={styles.emptyState}>{emptyMessage}</div>
            ) : (
                <div
                    className={`${styles.optionsList} ${layout === 'grid' ? styles.grid : ''}`}
                >
                    {filteredOptions.map((option) => {
                        const isSelected = value === option.id;
                        const isDisabled = disabled || option.disabled;

                        return (
                            <button
                                key={option.id}
                                type="button"
                                className={`${styles.option} ${isSelected ? styles.selected : ''} ${isDisabled ? styles.disabled : ''}`}
                                onClick={() => handleSelect(option.id, option.disabled)}
                                disabled={isDisabled}
                            >
                                <div className={styles.optionAvatar}>
                                    {option.avatar || getInitials(option.label)}
                                </div>
                                <div className={styles.optionContent}>
                                    <p className={styles.optionTitle}>{option.label}</p>
                                    {option.subtitle && (
                                        <p className={styles.optionSubtitle}>{option.subtitle}</p>
                                    )}
                                </div>
                                <div className={styles.checkIndicator}>
                                    {isSelected && <Check size={14} />}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
