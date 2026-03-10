// src/features/tv/components/TvPinGate.tsx
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { FiDelete } from 'react-icons/fi';
import { Monitor, Lock } from 'lucide-react';
import { tvLogin } from '../../../services/apiClient';
import logo from '../../../assets/logo-sidebar.png';
import styles from './TvPinGate.module.css';

const TV_TOKEN_KEY = 'tv_token';
const PIN_LENGTH = 4;

function getTvToken(): string | null {
    try {
        const userRaw = localStorage.getItem('usuario');
        if (userRaw) {
            const userObj = JSON.parse(userRaw);
            if (userObj?.token) return String(userObj.token).trim();
        }
        return sessionStorage.getItem(TV_TOKEN_KEY);
    } catch {
        return null;
    }
}

function saveTvToken(token: string): void {
    try {
        sessionStorage.setItem(TV_TOKEN_KEY, token);
    } catch { }
}

interface TvPinGateProps {
    children: ReactNode;
}

export default function TvPinGate({ children }: TvPinGateProps) {
    const [authenticated, setAuthenticated] = useState<boolean>(() => !!getTvToken());
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleConfirm = useCallback(async (currentPin: string) => {
        if (currentPin.length !== PIN_LENGTH) return;
        setLoading(true);
        setError('');
        try {
            const { token } = await tvLogin(currentPin);
            saveTvToken(token);
            setAuthenticated(true);
        } catch (err: any) {
            const msg = String(err?.message || err);
            if (msg.includes('503') || msg.includes('não configurado')) {
                setError('Modo TV não está configurado. Contate o administrador.');
            } else {
                setError('PIN incorreto. Tente novamente.');
            }
            setPin('');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (pin.length === PIN_LENGTH) {
            handleConfirm(pin);
        }
    }, [pin, handleConfirm]);

    useEffect(() => {
        if (authenticated) return;
        const onKey = (e: KeyboardEvent) => {
            if (loading) return;
            if (e.key === 'Backspace') {
                setPin(p => p.slice(0, -1));
                setError('');
            } else if (/^[0-9]$/.test(e.key)) {
                setPin(p => p.length < PIN_LENGTH ? p + e.key : p);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [authenticated, loading]);

    if (authenticated) return <>{children}</>;

    const pressDigit = (d: string) => {
        if (loading || pin.length >= PIN_LENGTH) return;
        setError('');
        setPin(p => p + d);
    };

    const pressDelete = () => {
        if (loading) return;
        setError('');
        setPin(p => p.slice(0, -1));
    };

    return (
        <div className={styles.container}>
            <div className={styles.backgroundPattern}></div>

            <div className={styles.contentWrapper}>
                {/* Logo Section */}
                <div className={styles.logoContainer}>
                    <img src={logo} alt="SpiraView Logo" className={styles.logo} />
                </div>

                <div className={styles.card}>
                    <div className={styles.iconWrapper}>
                        <div className={styles.iconPulseRing}></div>
                        <Monitor className={styles.mainIcon} strokeWidth={1.5} />
                        <Lock className={styles.secondaryIcon} strokeWidth={2} />
                    </div>

                    <div className={styles.header}>
                        <h1 className={styles.title}>Modo TV</h1>
                        <p className={styles.subtitle}>Digite o PIN para acessar o painel</p>
                    </div>

                    {/* Dots */}
                    <div className={styles.pinDisplay}>
                        {Array.from({ length: PIN_LENGTH }, (_, i) => (
                            <div
                                key={i}
                                className={`${styles.pinDot} ${i < pin.length ? styles.pinDotFilled : ''}`}
                            />
                        ))}
                    </div>

                    {/* Keypad */}
                    <div className={styles.keypad}>
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                            <button key={d} type="button" className={styles.key} onClick={() => pressDigit(d)}>
                                {d}
                            </button>
                        ))}
                        <div className={`${styles.key} ${styles.keyEmpty}`} />
                        <button type="button" className={styles.key} onClick={() => pressDigit('0')}>0</button>
                        <button
                            type="button"
                            className={`${styles.key} ${styles.keyDelete}`}
                            onClick={pressDelete}
                            title="Apagar"
                        >
                            <FiDelete size={28} />
                        </button>
                    </div>

                    {error && <div className={styles.error}>{error}</div>}
                    {loading && <div className={styles.loading}>Verificando PIN...</div>}
                </div>

                {/* Footer */}
                <div className={styles.footer}>
                    <p>
                        SpiraView &copy; {new Date().getFullYear()} - Melhoria Contínua
                    </p>
                </div>
            </div>
        </div>
    );
}
