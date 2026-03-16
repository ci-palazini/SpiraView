import { FiMenu, FiX } from 'react-icons/fi';
import styles from '../MainLayout.module.css';
import LanguageMenu from '../LanguageMenu';
import UserMenu from './UserMenu';
import type { User } from '../../App';
import { isFallbackActive } from '../../services/apiClient';
import { useState, useEffect } from 'react';

interface HeaderProps {
    isMobileMenuOpen: boolean;
    setIsMobileMenuOpen: (open: boolean) => void;
    title: string;
    user: User;
}

const Header = ({ isMobileMenuOpen, setIsMobileMenuOpen, title, user }: HeaderProps) => {
    const [isFallback, setIsFallback] = useState(isFallbackActive());

    useEffect(() => {
        const onFallback = () => setIsFallback(true);
        const onRestore = () => setIsFallback(false);

        window.addEventListener('api-fallback-activated' as any, onFallback);
        window.addEventListener('api-primary-restored' as any, onRestore);

        return () => {
            window.removeEventListener('api-fallback-activated' as any, onFallback);
            window.removeEventListener('api-primary-restored' as any, onRestore);
        };
    }, []);

    return (
        <header className={styles.header}>
            <button
                className={styles.hamburgerButton}
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
                {isMobileMenuOpen ? <FiX /> : <FiMenu />}
            </button>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <h1>{title}</h1>
                {isFallback && (
                    <span 
                        className={styles.fallbackBadge} 
                        title="Servidor Principal instável. Usando modo de reserva (Render)."
                    >
                        Servidor Reserva
                    </span>
                )}
            </div>

            <div className={styles.headerRight}>
                <LanguageMenu className={styles.langMenu} />
                <UserMenu user={user} />
            </div>
        </header>
    );
};

export default Header;
