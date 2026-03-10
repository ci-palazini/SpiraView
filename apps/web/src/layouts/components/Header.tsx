import { FiMenu, FiX } from 'react-icons/fi';
import styles from '../MainLayout.module.css';
import LanguageMenu from '../LanguageMenu';
import UserMenu from './UserMenu';
import type { User } from '../../App';

interface HeaderProps {
    isMobileMenuOpen: boolean;
    setIsMobileMenuOpen: (open: boolean) => void;
    title: string;
    user: User;
}

const Header = ({ isMobileMenuOpen, setIsMobileMenuOpen, title, user }: HeaderProps) => {
    return (
        <header className={styles.header}>
            <button
                className={styles.hamburgerButton}
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
                {isMobileMenuOpen ? <FiX /> : <FiMenu />}
            </button>
            <h1>{title}</h1>

            <div className={styles.headerRight}>
                <LanguageMenu className={styles.langMenu} />
                <UserMenu user={user} />
            </div>
        </header>
    );
};

export default Header;
