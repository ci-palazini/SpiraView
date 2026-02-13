import React, { ReactNode } from 'react';
import { FiHelpCircle } from 'react-icons/fi';
import styles from './HelpTooltip.module.css';

interface HelpTooltipProps {
    content: ReactNode;
    size?: number;
    placement?: 'top' | 'top-left' | 'top-right';
}

export default function HelpTooltip({ content, size = 16, placement = 'top' }: HelpTooltipProps) {
    let placementClass = '';
    if (placement === 'top-left') placementClass = styles.topLeft;
    if (placement === 'top-right') placementClass = styles.topRight;

    return (
        <div className={styles.container}>
            <FiHelpCircle size={size} />
            <div className={`${styles.tooltip} ${placementClass}`}>
                {content}
                <div className={styles.arrow} />
            </div>
        </div>
    );
}
