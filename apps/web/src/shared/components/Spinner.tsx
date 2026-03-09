import styles from './Spinner.module.css';

interface SpinnerProps {
    size?: number | string;
    className?: string;
    style?: React.CSSProperties;
}

export default function Spinner({ size = 24, className, style }: SpinnerProps) {
    return (
        <span
            className={`${styles.spinner}${className ? ` ${className}` : ''}`}
            style={{ width: size, height: size, ...style }}
            aria-label="loading"
            role="status"
        />
    );
}
