// Badge.tsx
import React, { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface BadgeProps {
    variant?: BadgeVariant;
    icon?: ReactNode;
    children: ReactNode;
    className?: string;
}

export function Badge({
    variant = 'neutral',
    icon,
    children,
    className = '',
}: BadgeProps) {
    const classes = [styles.badge, styles[variant], className].filter(Boolean).join(' ');

    return (
        <span className={classes}>
            {icon}
            {children}
        </span>
    );
}
