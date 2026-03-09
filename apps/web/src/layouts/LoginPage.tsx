// src/components/LoginPage.tsx
import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiEye, FiEyeOff, FiUsers, FiMonitor } from 'react-icons/fi';
import { login } from '../services/apiClient';
import toast from 'react-hot-toast';
import styles from './LoginPage.module.css';
import logo from '../assets/logo.png';
import LanguageMenu from './LanguageMenu';
import OperatorLoginForm from './OperatorLoginForm';

interface StoredUser {
    id?: string;
    email: string;
    name?: string;
    nome?: string;
    role: string;
    token?: string;
}

function readStoredUser(): StoredUser | null {
    try {
        const raw = localStorage.getItem('usuario');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function persistUser(userObj: StoredUser): void {
    try {
        const json = JSON.stringify(userObj);
        localStorage.setItem('usuario', json);
        ['authUser', 'user', 'currentUser'].forEach((legacyKey) => {
            localStorage.removeItem(legacyKey);
        });
    } catch { /* ignore */ }
}

export default function LoginPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();

    const [userInput, setUserInput] = useState('');
    const [senha, setSenha] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showOperatorMode, setShowOperatorMode] = useState(false);

    const search = new URLSearchParams(location.search);
    const redirectTo = search.get('redirect') || '/';

    useEffect(() => {
        const u = readStoredUser();
        if (u?.email) {
            const isOperador = (u.role || '').toLowerCase() === 'operador';
            const next = isOperador ? '/inicio-turno' : redirectTo;
            navigate(next, { replace: true });
        }
    }, [navigate, redirectTo]);

    const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (loading) return;
        setLoading(true);

        try {
            let identifier = (userInput || '').trim();
            if (identifier && !identifier.includes('@')) {
                identifier = `${identifier}@m.continua.tpm`;
            }

            const user = await login({ userOrEmail: identifier, senha });

            const normalized: StoredUser = {
                ...user,
                email: String(user?.email || identifier).trim().toLowerCase(),
                role: String(user?.role || '').trim().toLowerCase(),
                token: user?.token, // <--- Armazena o token
            };

            persistUser(normalized);

            try {
                window.dispatchEvent(new StorageEvent('storage', { key: 'usuario' }));
            } catch { /* ignore */ }

            const isOperador = (normalized.role || '').toLowerCase() === 'operador';
            const next = isOperador ? '/inicio-turno' : redirectTo;

            navigate(next, { replace: true });
        } catch (err) {
            console.error('Erro no login:', err);
            toast.error(t('login.invalid'));
        } finally {
            setLoading(false);
        }
    };

    const handleOperatorSuccess = (user: { id: string; nome: string; email: string; role: string; token?: string }) => {
        const normalized: StoredUser = {
            id: user.id,
            email: String(user.email).trim().toLowerCase(),
            name: user.nome,
            nome: user.nome,
            role: 'operador',
            token: user.token,
        };

        persistUser(normalized);

        try {
            window.dispatchEvent(new StorageEvent('storage', { key: 'usuario' }));
        } catch { /* ignore */ }

        navigate('/inicio-turno', { replace: true });
    };

    const userPlaceholder = t('login.userPlaceholder', '');

    return (
        <div className={styles.pageWrapper}>
            <LanguageMenu className={styles.loginLangMenu} />

            <div className={styles.cardWrapper}>
                <div className={styles.loginCard}>
                    {/* LADO ESQUERDO: LOGO / BRANDING */}
                    <div className={styles.brandSection}>
                        <div className={styles.brandInner}>
                            <img src={logo} alt="Logo" className={styles.brandLogo} />
                        </div>
                        <div className={styles.brandFooter}>
                            <span>
                                {t('login.brand.by', 'Desenvolvido pela Melhoria Contínua.')}
                            </span>
                            <span className={styles.brandCopy}>© 2025</span>
                        </div>
                    </div>

                    {/* LADO DIREITO: FORMULÁRIO */}
                    <div className={styles.formSection}>
                        {showOperatorMode ? (
                            <OperatorLoginForm
                                onSuccess={handleOperatorSuccess}
                                onBack={() => setShowOperatorMode(false)}
                            />
                        ) : (
                            <>
                                <h1 className={styles.title}>
                                    {t('login.title', 'Entrar no portal')}
                                </h1>
                                <p className={styles.subtitle}>
                                    {t('login.subtitle', 'Use seu usuário e senha.')}
                                </p>

                                <form onSubmit={handleLogin} className={styles.loginForm}>
                                    <div className={styles.fieldGroup}>
                                        <label htmlFor="userInput" className={styles.fieldLabel}>
                                            {t('login.userOrEmail')}
                                            <span className={styles.requiredMark}>*</span>
                                        </label>
                                        <input
                                            type="text"
                                            id="userInput"
                                            className={styles.fieldInput}
                                            value={userInput}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => setUserInput(e.target.value)}
                                            required
                                            autoComplete="username"
                                            autoFocus
                                            placeholder={userPlaceholder}
                                        />
                                    </div>

                                    <div className={styles.fieldGroup}>
                                        <label htmlFor="senha" className={styles.fieldLabel}>
                                            {t('login.password')}
                                            <span className={styles.requiredMark}>*</span>
                                        </label>
                                        <div className={styles.passwordWrapper}>
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                id="senha"
                                                className={styles.fieldInput}
                                                value={senha}
                                                onChange={(e: ChangeEvent<HTMLInputElement>) => setSenha(e.target.value)}
                                                required
                                                autoComplete="current-password"
                                                placeholder={t('login.passwordPlaceholder', '')}
                                            />
                                            <button
                                                type="button"
                                                className={styles.passwordToggle}
                                                onClick={() => setShowPassword((v) => !v)}
                                                aria-label={showPassword ? t('login.hidePassword', 'Ocultar senha') : t('login.showPassword', 'Mostrar senha')}
                                            >
                                                {showPassword ? <FiEyeOff /> : <FiEye />}
                                            </button>
                                        </div>
                                    </div>

                                    <p className={styles.forgotHint}>
                                        {t('login.forgotHint', 'Esqueceu a senha? Procure o responsável de Melhoria Contínua.')}
                                    </p>

                                    <button
                                        type="submit"
                                        className={styles.submitButton}
                                        disabled={loading}
                                    >
                                        {loading ? t('login.loading', 'Entrando...') : t('login.next', 'Entrar')}
                                    </button>
                                </form>

                                {/* Divisor */}
                                <div className={styles.divider}>
                                    <span className={styles.dividerLine} />
                                    <span className={styles.dividerText}>
                                        {t('login.or', 'ou')}
                                    </span>
                                    <span className={styles.dividerLine} />
                                </div>

                                {/* Botão Operação */}
                                <button
                                    type="button"
                                    className={styles.operatorButton}
                                    onClick={() => setShowOperatorMode(true)}
                                >
                                    <FiUsers className={styles.operatorIcon} />
                                    {t('login.operationBtn', 'Operação')}
                                </button>

                                {/* Link para TV/Kiosk */}
                                <button
                                    type="button"
                                    className={styles.tvButton}
                                    onClick={() => navigate('/tv')}
                                >
                                    <FiMonitor className={styles.operatorIcon} />
                                    {t('login.tvBtn', 'Modo TV / Kiosk')}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
