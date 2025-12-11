// src/shared/components/Modal.tsx
import { ReactNode, MouseEvent } from 'react';
import styles from './Modal.module.css';
import { FiX } from 'react-icons/fi';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
}

const Modal = ({ isOpen, onClose, title, children }: ModalProps) => {
    if (!isOpen) {
        return null;
    }

    // A função de fechar o modal será chamada se o usuário clicar no fundo escuro
    const handleOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
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
};

export default Modal;
