// src/shared/components/PageHeader.tsx
import { ReactNode } from 'react';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
    /** Título principal da página (obrigatório) */
    title: string;
    /** Subtítulo/descrição (opcional) */
    subtitle?: string;
    /** Ações/buttons à direita (opcional) */
    actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
    return (
        <header className={styles.pageHeader}>
            <div className={styles.pageHeaderContent}>
                <h1 className={styles.pageTitle}>{title}</h1>
                {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
            {actions && <div className={styles.pageHeaderActions}>{actions}</div>}
        </header>
    );
}
