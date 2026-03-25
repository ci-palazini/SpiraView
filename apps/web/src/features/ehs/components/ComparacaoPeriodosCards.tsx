import { useTranslation } from 'react-i18next';
import { FiTrendingUp, FiTrendingDown, FiMinus } from 'react-icons/fi';
import type { ComparacaoPeriodos } from '@spiraview/shared';
import styles from './ComparacaoPeriodosCards.module.css';

interface ComparacaoPeriodosCardsProps {
    data: ComparacaoPeriodos;
}

export default function ComparacaoPeriodosCards({ data }: ComparacaoPeriodosCardsProps) {
    const { t } = useTranslation();

    const getTrendIcon = (value: number) => {
        if (value > 0) return <FiTrendingUp size={20} />;
        if (value < 0) return <FiTrendingDown size={20} />;
        return <FiMinus size={20} />;
    };

    const getTrendColor = (value: number) => {
        if (value > 0) return '#10b981'; // green
        if (value < 0) return '#ef4444'; // red
        return '#64748b'; // gray
    };

    const cards = [
        {
            label: t('ehs.stats.total_obs', 'Total de Observações'),
            current: data.anoAtual.totalObservacoes,
            previous: data.anoAnterior.totalObservacoes,
            change: data.variacao.observacoes
        },
        {
            label: t('ehs.stats.participantes', 'Participantes'),
            current: data.anoAtual.participantes,
            previous: data.anoAnterior.participantes,
            change: data.variacao.participantes
        },
        {
            label: t('ehs.stats.compliance', 'Compliance'),
            current: `${data.anoAtual.compliance.toFixed(1)}%`,
            previous: `${data.anoAnterior.compliance.toFixed(1)}%`,
            change: data.variacao.compliance
        }
    ];

    return (
        <div className={styles.container}>
            <h3 className={styles.title}>
                {t('ehs.stats.comparacao_title', 'Comparação de Períodos')}
            </h3>
            <div className={styles.cardsGrid}>
                {cards.map((card, idx) => (
                    <div key={idx} className={styles.card}>
                        <p className={styles.cardLabel}>{card.label}</p>
                        
                        <div className={styles.valuesRow}>
                            <div className={styles.valueBlock}>
                                <span className={styles.valueLabel}>
                                    {t('ehs.stats.ano_atual', 'Ano Atual')}
                                </span>
                                <span className={styles.valueCurrent}>{card.current}</span>
                            </div>
                            
                            <div className={styles.valueBlock}>
                                <span className={styles.valueLabel}>
                                    {t('ehs.stats.ano_anterior', 'Ano Anterior')}
                                </span>
                                <span className={styles.valuePrevious}>{card.previous}</span>
                            </div>
                        </div>

                        <div 
                            className={styles.changeBlock}
                            style={{ color: getTrendColor(card.change) }}
                        >
                            <span className={styles.changeIcon}>
                                {getTrendIcon(card.change)}
                            </span>
                            <span className={styles.changeText}>
                                {card.change > 0 ? '+' : ''}{card.change.toFixed(1)}%
                            </span>
                            <span className={styles.changeLabel}>
                                {card.change > 0 
                                    ? t('ehs.stats.crescimento', 'crescimento')
                                    : card.change < 0 
                                        ? t('ehs.stats.queda', 'queda')
                                        : t('ehs.stats.estavel', 'estável')
                                }
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
