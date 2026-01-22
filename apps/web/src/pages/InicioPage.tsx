// src/pages/InicioPage.tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import styles from './InicioPage.module.css';
import usePermissions from '../hooks/usePermissions';
import useHomeShortcuts from '../hooks/useHomeShortcuts';
import CustomizeShortcutsModal from '../components/CustomizeShortcutsModal';
import { FiSettings } from 'react-icons/fi';

// ---------- Types ----------
interface User {
    nome?: string;
    role?: string;
    email?: string;
}

interface InicioPageProps {
    user: User;
}

// ---------- Component ----------
const InicioPage = ({ user }: InicioPageProps) => {
    const { t, i18n } = useTranslation();
    const perm = usePermissions(user);
    const isPt = (i18n?.language || '').toLowerCase().startsWith('pt');

    const [isModalOpen, setIsModalOpen] = useState(false);

    const {
        availableShortcuts,
        selectedShortcuts,
        selectedIds,
        toggleShortcut,
        resetToDefaults,
        maxShortcuts,
        canAddMore,
    } = useHomeShortcuts(perm, isPt);

    return (
        <>
            <header className={styles.header}>
                <div className={styles.headerContent}>
                    <div>
                        <h1>{t('inicio.title')}</h1>
                        <p>
                            <Trans i18nKey="inicio.welcome" values={{ name: user.nome }}>
                                Bem-vindo de volta, <strong>{{ name: user.nome } as unknown as string}</strong>!
                            </Trans>
                        </p>
                    </div>
                </div>
            </header>

            <div className={styles.content}>
                <div className={styles.sectionHeader}>
                    <h2>{t('inicio.quickAccess')}</h2>
                    <button
                        className={styles.customizeButton}
                        onClick={() => setIsModalOpen(true)}
                        title={t('inicio.customize', 'Personalizar')}
                    >
                        <FiSettings />
                        <span>{t('inicio.customize', 'Personalizar')}</span>
                    </button>
                </div>

                <div className={styles.actionsGrid}>
                    {selectedShortcuts.map((shortcut) => {
                        const Icon = shortcut.icon;
                        return (
                            <Link key={shortcut.id} to={shortcut.path} className={styles.actionCard}>
                                <Icon className={styles.cardIcon} />
                                <h3 className={styles.cardTitle}>
                                    {t(shortcut.titleKey, shortcut.id)}
                                </h3>
                                <p className={styles.cardDescription}>
                                    {t(shortcut.descKey, '')}
                                </p>
                            </Link>
                        );
                    })}
                </div>

                {selectedShortcuts.length === 0 && (
                    <div className={styles.emptyState}>
                        <p>{t('inicio.noShortcuts', 'Nenhum atalho selecionado.')}</p>
                        <button onClick={() => setIsModalOpen(true)}>
                            {t('inicio.addShortcuts', 'Adicionar atalhos')}
                        </button>
                    </div>
                )}
            </div>

            <CustomizeShortcutsModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                availableShortcuts={availableShortcuts}
                selectedIds={selectedIds}
                toggleShortcut={toggleShortcut}
                resetToDefaults={resetToDefaults}
                maxShortcuts={maxShortcuts}
                canAddMore={canAddMore}
            />
        </>
    );
};

export default InicioPage;
