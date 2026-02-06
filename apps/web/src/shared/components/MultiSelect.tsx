import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import styles from './MultiSelect.module.css';
import { useTranslation } from 'react-i18next';

export interface MultiSelectOption {
    label: string;
    value: string | number;
}

interface MultiSelectProps {
    options: MultiSelectOption[];
    value: (string | number)[];
    onChange: (value: (string | number)[]) => void;
    placeholder?: string;
    searchable?: boolean;
}

export default function MultiSelect({
    options,
    value,
    onChange,
    placeholder = 'Selecione...',
    searchable = true
}: MultiSelectProps) {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const toggleOption = (optionValue: string | number) => {
        const newValue = value.includes(optionValue)
            ? value.filter(v => v !== optionValue)
            : [...value, optionValue];
        onChange(newValue);
    };

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(search.toLowerCase())
    );

    const getDisplayValue = () => {
        if (value.length === 0) return <span className={styles.placeholder}>{placeholder}</span>;
        if (value.length === 1) {
            const selected = options.find(o => o.value === value[0]);
            return selected ? selected.label : value[0];
        }
        return (
            <span>
                {value.length} {t('common.selected', 'selecionados')}
            </span>
        );
    };

    return (
        <div className={styles.container} ref={containerRef}>
            <div
                className={styles.trigger}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className={styles.value}>{getDisplayValue()}</div>
                <ChevronDown size={16} color="#64748b" />
            </div>

            {isOpen && (
                <div className={styles.dropdown}>
                    {searchable && (
                        <div className={styles.searchContainer}>
                            <input
                                type="text"
                                className={styles.searchInput}
                                placeholder={t('common.search', 'Buscar...')}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    )}
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((option) => {
                            const isSelected = value.includes(option.value);
                            return (
                                <div
                                    key={option.value}
                                    className={`${styles.option} ${isSelected ? styles.optionSelected : ''}`}
                                    onClick={() => toggleOption(option.value)}
                                >
                                    <div className={`${styles.checkbox} ${isSelected ? styles.checkboxChecked : ''}`}>
                                        {isSelected && <Check size={12} />}
                                    </div>
                                    <span>{option.label}</span>
                                </div>
                            );
                        })
                    ) : (
                        <div className={styles.option} style={{ cursor: 'default', color: '#94a3b8' }}>
                            {t('common.noResults', 'Sem resultados')}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
