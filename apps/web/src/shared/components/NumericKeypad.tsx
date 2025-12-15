// NumericKeypad.tsx
import React, { useEffect, useCallback } from 'react';
import { X, Delete, Check } from 'lucide-react';
import styles from './NumericKeypad.module.css';

export interface NumericKeypadProps {
    isOpen: boolean;
    onClose: () => void;
    value: string;
    onChange: (value: string) => void;
    onConfirm: () => void;
    maxLength?: number;
    title?: string;
}

export function NumericKeypad({
    isOpen,
    onClose,
    value,
    onChange,
    onConfirm,
    maxLength = 4,
    title = 'Digite sua matrícula',
}: NumericKeypadProps) {
    // Handle keyboard input
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (!isOpen) return;

            if (e.key === 'Escape') {
                onClose();
                return;
            }

            if (e.key === 'Enter' && value.length === maxLength) {
                onConfirm();
                return;
            }

            if (e.key === 'Backspace') {
                onChange(value.slice(0, -1));
                return;
            }

            if (/^[0-9]$/.test(e.key) && value.length < maxLength) {
                onChange(value + e.key);
            }
        },
        [isOpen, value, maxLength, onChange, onConfirm, onClose]
    );

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // Prevent body scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const handleDigitPress = (digit: string) => {
        if (value.length < maxLength) {
            onChange(value + digit);
        }
    };

    const handleBackspace = () => {
        onChange(value.slice(0, -1));
    };

    const handleClear = () => {
        onChange('');
    };

    const digits = Array.from({ length: maxLength }, (_, i) => value[i] || '');

    return (
        <>
            <div className={styles.overlay} onClick={onClose} />
            <div className={styles.container}>
                <div className={styles.keypad}>
                    {/* Header */}
                    <div className={styles.header}>
                        <p className={styles.title}>{title}</p>
                        <button className={styles.closeButton} onClick={onClose} type="button">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Display */}
                    <div className={styles.display}>
                        {digits.map((d, i) => (
                            <div
                                key={i}
                                className={`${styles.digit} ${d ? styles.digitFilled : ''} ${i === value.length ? styles.digitActive : ''
                                    }`}
                            >
                                {d ? '●' : ''}
                            </div>
                        ))}
                    </div>

                    {/* Keys */}
                    <div className={styles.keys}>
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                            <button
                                key={num}
                                type="button"
                                className={`${styles.key} ${styles.keyNumber}`}
                                onClick={() => handleDigitPress(num)}
                            >
                                {num}
                            </button>
                        ))}

                        <button
                            type="button"
                            className={`${styles.key} ${styles.keyAction}`}
                            onClick={handleClear}
                            title="Limpar"
                        >
                            C
                        </button>

                        <button
                            type="button"
                            className={`${styles.key} ${styles.keyNumber}`}
                            onClick={() => handleDigitPress('0')}
                        >
                            0
                        </button>

                        <button
                            type="button"
                            className={`${styles.key} ${styles.keyAction}`}
                            onClick={handleBackspace}
                            title="Apagar"
                        >
                            <Delete size={24} />
                        </button>
                    </div>

                    {/* Confirm button */}
                    <button
                        type="button"
                        className={`${styles.key} ${styles.keyConfirm}`}
                        style={{ marginTop: 12, width: '100%' }}
                        onClick={onConfirm}
                        disabled={value.length !== maxLength}
                    >
                        <Check size={24} style={{ marginRight: 8 }} />
                        Confirmar
                    </button>
                </div>
            </div>
        </>
    );
}
