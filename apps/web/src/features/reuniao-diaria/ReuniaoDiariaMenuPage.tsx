// src/features/reuniao-diaria/ReuniaoDiariaMenuPage.tsx
import { useNavigate } from 'react-router-dom';
import { FiTool, FiPackage, FiTruck, FiArrowLeft } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import styles from './ReuniaoDiaria.module.css';

interface DeptOption {
    id: string;
    labelKey: string;
    fallback: string;
    descKey: string;
    descFallback: string;
    icon: React.ReactNode;
    color: string;
}

const DEPARTMENTS: DeptOption[] = [
    {
        id: 'usinagem',
        labelKey: 'reuniao_diaria.dept.usinagem',
        fallback: 'Usinagem',
        descKey: 'reuniao_diaria.dept.usinagem_desc',
        descFallback: 'Eficiência de produção por máquina',
        icon: <FiTool size={44} />,
        color: '#f59e0b',
    },
    {
        id: 'montagem',
        labelKey: 'reuniao_diaria.dept.montagem',
        fallback: 'Montagem & Pintura',
        descKey: 'reuniao_diaria.dept.montagem_desc',
        descFallback: 'Eficiência de produção da montagem',
        icon: <FiPackage size={44} />,
        color: '#8b5cf6',
    },
    {
        id: 'logistica',
        labelKey: 'reuniao_diaria.dept.logistica',
        fallback: 'Logística',
        descKey: 'reuniao_diaria.dept.logistica_desc',
        descFallback: 'Indicadores de expedição e faturamento',
        icon: <FiTruck size={44} />,
        color: '#3b82f6',
    },
];

export default function ReuniaoDiariaMenuPage() {
    const navigate = useNavigate();
    const { t } = useTranslation();

    return (
        <div className={styles.menuContainer}>
            <button className={styles.backBtn} onClick={() => navigate('/')}>
                <FiArrowLeft size={18} />
                <span>{t('common.back', 'Voltar')}</span>
            </button>

            <div className={styles.menuContent}>
                <div className={styles.menuHeader}>
                    <h1 className={styles.menuTitle}>
                        {t('reuniao_diaria.title', 'Reunião Diária — SQDCP')}
                    </h1>
                    <p className={styles.menuSubtitle}>
                        {t('reuniao_diaria.subtitle', 'Selecione o departamento para a apresentação')}
                    </p>
                </div>

                <div className={styles.deptGrid}>
                    {DEPARTMENTS.map((dept) => (
                        <button
                            key={dept.id}
                            className={styles.deptCard}
                            onClick={() => navigate(`/reuniao-diaria/${dept.id}`)}
                            style={{ '--accent': dept.color } as React.CSSProperties}
                        >
                            <div className={styles.deptIcon}>
                                {dept.icon}
                            </div>
                            <h2 className={styles.deptLabel}>{t(dept.labelKey, dept.fallback)}</h2>
                            <p className={styles.deptDesc}>{t(dept.descKey, dept.descFallback)}</p>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
