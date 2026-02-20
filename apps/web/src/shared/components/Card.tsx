// Card.tsx
import React, { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
    padding?: CardPadding;
    hoverable?: boolean;
    glass?: boolean;
    children: ReactNode;
}

const paddingMap: Record<CardPadding, string> = {
    none: styles.paddingNone,
    sm: styles.paddingSm,
    md: styles.paddingMd,
    lg: styles.paddingLg,
};

export function Card({
    padding = 'md',
    hoverable = false,
    glass = false,
    children,
    className = '',
    ...props
}: CardProps) {
    const classes = [
        styles.card,
        paddingMap[padding],
        hoverable && styles.hoverable,
        glass && styles.glass,
        className,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={classes} {...props}>
            {children}
        </div>
    );
}

// Sub-components for Card structure
export interface CardHeaderProps {
    title: string;
    subtitle?: string;
    actions?: ReactNode;
}

export function CardHeader({ title, subtitle, actions }: CardHeaderProps) {
    return (
        <div className={styles.header}>
            <div>
                <h2 className={styles.headerTitle}>{title}</h2>
                {subtitle && <p className={styles.headerSubtitle}>{subtitle}</p>}
            </div>
            {actions && <div>{actions}</div>}
        </div>
    );
}

export interface CardFooterProps {
    children: ReactNode;
}

function CardFooter({ children }: CardFooterProps) {
    return <div className={styles.footer}>{children}</div>;
}
