import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiUser, FiLogOut } from 'react-icons/fi';
import styles from '../MainLayout.module.css';
import type { User } from '../../App';

interface UserMenuProps {
    user: User;
}

const UserMenu = ({ user }: UserMenuProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const userMenuRef = useRef<HTMLDivElement>(null);

    const userInitials = useMemo(() => {
        const nome = ((user as { nome?: string })?.nome || '').trim();
        if (nome) {
            const parts = nome.split(/\s+/);
            if (parts.length >= 2) {
                return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
            }
            return nome.slice(0, 2).toUpperCase();
        }
        const email = (user?.email || '').trim();
        if (email) return email.slice(0, 2).toUpperCase();
        return '?';
    }, [(user as { nome?: string })?.nome, user?.email]);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (!userMenuRef.current) return;
            if (!userMenuRef.current.contains(e.target as Node)) {
                setUserMenuOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setUserMenuOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, []);

    const handleLogout = () => {
        try {
            localStorage.removeItem('usuario');
            localStorage.removeItem('dadosTurno');
            localStorage.removeItem('tv_token');
        } catch { /* ignore */ }
        window.dispatchEvent(new Event('auth-user-changed'));
        navigate('/login', { replace: true });
    };

    return (
        <div className={styles.userMenuRoot} ref={userMenuRef}>
            <button
                className={styles.userAvatarButton}
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                title={(user as { nome?: string })?.nome || user?.email || ''}
            >
                <span className={styles.userAvatarCircle}>{userInitials}</span>
            </button>

            {userMenuOpen && (
                <div className={styles.userMenu} role="menu">
                    <button
                        className={styles.userMenuItem}
                        onClick={() => {
                            setUserMenuOpen(false);
                            navigate('/perfil');
                        }}
                        role="menuitem"
                    >
                        <FiUser className={styles.userMenuIcon} />
                        <span>{t('nav.profile')}</span>
                    </button>

                    <button
                        className={styles.userMenuItem}
                        onClick={() => {
                            setUserMenuOpen(false);
                            handleLogout();
                        }}
                        role="menuitem"
                    >
                        <FiLogOut className={styles.userMenuIcon} />
                        <span>{t('common.logout', 'Sair')}</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default UserMenu;
