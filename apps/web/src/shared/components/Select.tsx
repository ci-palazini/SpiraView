// Select.tsx
import React, { SelectHTMLAttributes, forwardRef } from 'react';
import styles from './Select.module.css';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    required?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
    ({ label, required, className = '', id, children, ...props }, ref) => {
        const selectId = id || `select-${Math.random().toString(36).slice(2, 9)}`;

        return (
            <div className={styles.fieldGroup}>
                {label && (
                    <label htmlFor={selectId} className={styles.label}>
                        {label}
                        {required && <span className={styles.required}>*</span>}
                    </label>
                )}
                <select ref={ref} id={selectId} className={`${styles.select} ${className}`} {...props}>
                    {children}
                </select>
            </div>
        );
    }
);

Select.displayName = 'Select';
