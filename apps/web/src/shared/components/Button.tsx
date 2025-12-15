// Button.tsx
import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    fullWidth?: boolean;
    loading?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    children: ReactNode;
}

export function Button({
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    leftIcon,
    rightIcon,
    children,
    className = '',
    disabled,
    ...props
}: ButtonProps) {
    const classes = [
        styles.button,
        styles[variant],
        size !== 'md' && styles[size],
        fullWidth && styles.fullWidth,
        loading && styles.loading,
        className,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <button
            className={classes}
            disabled={disabled || loading}
            {...props}
        >
            {loading && <span className={styles.spinner} />}
            {leftIcon && !loading && leftIcon}
            {children}
            {rightIcon && !loading && rightIcon}
        </button>
    );
}
