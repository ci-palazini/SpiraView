import styles from './Skeleton.module.css';

interface SkeletonProps {
    variant?: 'text' | 'rectangular' | 'circular' | 'rounded';
    width?: number | string;
    height?: number | string;
    style?: React.CSSProperties;
    className?: string;
}

export default function Skeleton({ variant = 'text', width, height, style, className }: SkeletonProps) {
    const variantClass = {
        text: styles.text,
        rectangular: styles.rectangular,
        circular: styles.circular,
        rounded: styles.rounded,
    }[variant];

    return (
        <span
            className={`${styles.skeleton} ${variantClass}${className ? ` ${className}` : ''}`}
            style={{ width, height, ...style }}
            aria-hidden="true"
        />
    );
}
