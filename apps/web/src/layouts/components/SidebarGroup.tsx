import React from 'react';
import { FiChevronDown } from 'react-icons/fi';
import styles from '../MainLayout.module.css';

interface SidebarGroupProps {
    id: string;
    label: string;
    isOpen: boolean;
    onToggle: (id: string) => void;
    icon?: React.ElementType;
    children: React.ReactNode;
}

const SidebarGroup = ({
    id,
    label,
    isOpen,
    onToggle,
    icon: Icon,
    children
}: SidebarGroupProps) => {
    return (
        <div className={styles.sidebarGroup}>
            <button
                className={`${styles.groupHeader} ${isOpen ? styles.expanded : ''}`}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggle(id);
                }}
                aria-expanded={isOpen}
            >
                <div className={styles.groupHeaderLabel}>
                    {Icon && <Icon style={{ fontSize: 20 }} />}
                    <span>{label}</span>
                </div>
                <FiChevronDown className={`${styles.chevron} ${isOpen ? styles.open : ''}`} />
            </button>
            <div className={`${styles.groupContent} ${isOpen ? styles.open : ''}`}>
                {children}
            </div>
        </div>
    );
};

export default SidebarGroup;
