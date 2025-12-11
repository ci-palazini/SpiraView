// PageHeader - Componente de header de página reutilizável
import React from 'react';
import styles from './PageHeader.module.css';

/**
 * Header padrão para páginas do sistema.
 * 
 * @param {string} title - Título principal da página (obrigatório)
 * @param {string} subtitle - Subtítulo/descrição (opcional)
 * @param {React.ReactNode} actions - Ações/buttons à direita (opcional)
 */
export default function PageHeader({ title, subtitle, actions }) {
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
