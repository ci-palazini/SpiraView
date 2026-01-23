// src/features/tv/TvMenuPage.tsx
import { useNavigate } from 'react-router-dom';
import { FiBarChart2, FiTool, FiPackage, FiArrowLeft, FiCalendar } from 'react-icons/fi';
import styles from './TvMenuPage.module.css';

interface ScopeOption {
    id: string;
    label: string;
    desc: string;
    icon: React.ReactNode;
    color: string;
    path: string;
}

export default function TvMenuPage() {
    const navigate = useNavigate();

    const options: ScopeOption[] = [
        {
            id: 'geral',
            label: 'Visão Geral',
            desc: 'Todas as máquinas (Usinagem + Montagem)',
            icon: <FiBarChart2 size={50} />,
            color: '#3b82f6',
            path: '/tv/geral',
        },
        {
            id: 'usinagem',
            label: 'Usinagem',
            desc: 'Painel exclusivo de máquinas de usinagem',
            icon: <FiTool size={50} />,
            color: '#f59e0b',
            path: '/tv/usinagem',
        },
        {
            id: 'montagem',
            label: 'Montagem',
            desc: 'Painel exclusivo das bancadas de montagem',
            icon: <FiPackage size={50} />,
            color: '#8b5cf6',
            path: '/tv/montagem',
        },
        {
            id: 'planejamento',
            label: 'Planejamento',
            desc: 'Análise de Capacidade e Carga por Centro de Trabalho',
            icon: <FiCalendar size={50} />,
            color: '#10b981',
            path: '/tv/planejamento',
        },
    ];

    return (
        <div className={styles.container}>
            <button className={styles.backButton} onClick={() => navigate('/')}>
                <FiArrowLeft size={20} />
                <span>Voltar</span>
            </button>

            <div className={styles.content}>
                <div className={styles.header}>
                    <h1 className={styles.title}>Selecione o Painel</h1>
                    <p className={styles.subtitle}>Escolha qual setor deseja monitorar nesta tela</p>
                </div>

                <div className={styles.optionsGrid}>
                    {options.map((opt) => (
                        <button
                            key={opt.id}
                            className={styles.optionCard}
                            onClick={() => navigate(opt.path)}
                            style={{ '--accent-color': opt.color } as React.CSSProperties}
                        >
                            <div
                                className={styles.iconWrapper}
                                style={{ backgroundColor: `${opt.color}15`, color: opt.color }}
                            >
                                {opt.icon}
                            </div>
                            <h2 className={styles.optionLabel}>{opt.label}</h2>
                            <p className={styles.optionDesc}>{opt.desc}</p>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
