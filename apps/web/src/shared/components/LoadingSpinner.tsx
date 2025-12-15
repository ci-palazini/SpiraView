// LoadingSpinner.tsx
import React from 'react';
import styles from './LoadingSpinner.module.css';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface LoadingSpinnerProps {
    size?: SpinnerSize;
    text?: string;
    className?: string;
}

export function LoadingSpinner({ size = 'md', text, className = '' }: LoadingSpinnerProps) {
    return (
        <div className={`${styles.container} ${className}`}>
            <div className={`${styles.spinner} ${styles[size]}`} />
            {text && <p className={styles.text}>{text}</p>}
        </div>
    );
}
