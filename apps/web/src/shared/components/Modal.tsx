// src/shared/components/Modal.tsx
import { ReactNode, MouseEvent, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';
import { FiX } from 'react-icons/fi';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
}

const Modal = ({ isOpen, onClose, title, children }: ModalProps) => {
    // Bloqueia scroll do body quando modal está aberto
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

    if (!isOpen) {
        return null;
    }

    // A função de fechar o modal será chamada se o usuário clicar no fundo escuro
    const handleOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const modalContent = (
        <div className={styles.modalOverlay} onClick={handleOverlayClick}>
            {/* O card do modal em si */}
            <div className={styles.modalContent}>
                <div className={styles.modalHeader}>
                    <h2 className={styles.modalTitle}>{title}</h2>
                    <button onClick={onClose} className={styles.closeButton}>
                        <FiX size={24} />
                    </button>
                </div>
                <div className={styles.modalBody}>
                    {children}
                </div>
            </div>
        </div>
    );

    // Usa Portal para renderizar fora da hierarquia DOM atual
    return createPortal(modalContent, document.body);
};

export default Modal;
