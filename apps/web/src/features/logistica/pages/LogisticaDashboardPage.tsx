import { useTranslation } from 'react-i18next';
import PageHeader from '../../../shared/components/PageHeader';
import { LogisticsGrid } from '../components/LogisticsGrid';
import styles from './LogisticaDashboardPage.module.css';

const LogisticaDashboardPage = () => {
    const { t } = useTranslation();

    return (
        <div className={styles.container}>
            <PageHeader
                title={t('logistics.dashboardTitle', 'Painel de Logística')}
                subtitle={t('logistics.dashboardSubtitle', 'Acompanhamento diário de KPIs financeiros e operacionais')}
            />

            <div className={styles.content}>
                <LogisticsGrid />
            </div>
        </div>
    );
};

export default LogisticaDashboardPage;
