// src/shared/components/ExportButtons.tsx
import React from 'react';
import styles from './ExportButtons.module.css';

interface ExportButtonsProps {
    onExportExcel?: () => void;
    onExportPdf?: () => void;
    showExcel?: boolean;
    showPdf?: boolean;
    className?: string;
}

export default function ExportButtons({
    onExportExcel,
    onExportPdf,
    showExcel = true,
    showPdf = true,
    className = ''
}: ExportButtonsProps) {
    return (
        <div className={`${styles.exportButtons} ${className}`}>
            {showExcel && onExportExcel && (
                <button
                    onClick={onExportExcel}
                    className={styles.exportButton}
                    title="Exportar para Excel"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                    </svg>
                    Excel
                </button>
            )}
            {showPdf && onExportPdf && (
                <button
                    onClick={onExportPdf}
                    className={`${styles.exportButton} ${styles.pdf}`}
                    title="Exportar para PDF"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                    </svg>
                    PDF
                </button>
            )}
        </div>
    );
}
