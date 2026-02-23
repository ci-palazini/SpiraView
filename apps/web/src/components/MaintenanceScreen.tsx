import React from 'react';
import { Settings, Wrench, RefreshCw } from 'lucide-react';
import styles from './MaintenanceScreen.module.css';
import logo from '../assets/logo-sidebar.png';
import { useTranslation } from 'react-i18next';

interface MaintenanceScreenProps {
    manuallyTriggered?: boolean;
}

const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({ manuallyTriggered = false }) => {
    const { t } = useTranslation();

    return (
        <div className={styles.container}>
            <div className={styles.backgroundPattern}></div>

            <div className={styles.contentWrapper}>
                {/* Logo Section */}
                <div className={styles.logoContainer}>
                    <img src={logo} alt="SpiraView Logo" className={styles.logo} />
                </div>

                {/* Main Card */}
                <div className={styles.card}>
                    <div className={styles.iconWrapper}>
                        <div className={styles.iconPulseRing}></div>
                        <Settings className={styles.mainIcon} strokeWidth={1.5} />
                        <Wrench className={styles.secondaryIcon} strokeWidth={2} />
                    </div>

                    <h1 className={styles.title}>
                        {t('maintenance.title', 'Sistema em Manutenção')}
                    </h1>

                    <p className={styles.description}>
                        {t(
                            'maintenance.description',
                            'Nós estamos realizando algumas melhorias na plataforma agora mesmo para garantir que você tenha a melhor experiência possível.'
                        )}
                    </p>

                    <div className={styles.statusIndicator}>
                        <RefreshCw className={styles.spinner} />
                        <span>
                            {t('maintenance.checking', 'Aguardando o sistema voltar online...')}
                        </span>
                    </div>
                </div>

                {/* Footer */}
                <div className={styles.footer}>
                    <p>
                        SpiraView &copy; {new Date().getFullYear()} - Melhoria Contínua
                    </p>
                </div>
            </div>
        </div>
    );
};

export default MaintenanceScreen;
