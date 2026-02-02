import styles from './StatCard.module.css';

interface Props {
    title: string;
    value: React.ReactNode;
    subtitle?: string;
    icon?: React.ReactNode;
    color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}

export default function StatCard({ title, value, subtitle, icon, color = 'blue' }: Props) {
    return (
        <div className={`${styles.card} ${styles[color]}`}>
            <div className={styles.content}>
                <div className={styles.header}>
                    <p className={styles.title}>{title}</p>
                    {icon && <div className={`${styles.icon} ${styles[color]}`}>{icon}</div>}
                </div>
                <div className={styles.value}>{value}</div>
                {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
        </div>
    );
}
