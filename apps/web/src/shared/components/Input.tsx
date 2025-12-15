// Input.tsx
import React, { InputHTMLAttributes, forwardRef } from 'react';
import styles from './Input.module.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    required?: boolean;
    error?: string;
    helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, required, error, helperText, className = '', id, ...props }, ref) => {
        const inputId = id || `input-${Math.random().toString(36).slice(2, 9)}`;

        const inputClasses = [
            styles.input,
            error && styles.inputError,
            className,
        ]
            .filter(Boolean)
            .join(' ');

        return (
            <div className={styles.fieldGroup}>
                {label && (
                    <label htmlFor={inputId} className={styles.label}>
                        {label}
                        {required && <span className={styles.required}>*</span>}
                    </label>
                )}
                <input ref={ref} id={inputId} className={inputClasses} {...props} />
                {error && <span className={styles.errorMessage}>{error}</span>}
                {helperText && !error && <span className={styles.helperText}>{helperText}</span>}
            </div>
        );
    }
);

Input.displayName = 'Input';
