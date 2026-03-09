// src/pages/ResetPasswordPage.tsx
import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiEye, FiEyeOff, FiArrowLeft } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { resetPassword } from '../services/apiClient';
import styles from './ResetPasswordPage.module.css';
import logo from '../assets/logo.png';

export default function ResetPasswordPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();

    const [token, setToken] = useState('');
    const [email, setEmail] = useState('');
    const [novaSenha, setNovaSenha] = useState('');
    const [confirmarSenha, setConfirmarSenha] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const t = params.get('token');
        const e = params.get('email');
        if (t) setToken(t);
        if (e) setEmail(e);
    }, [location]);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!token) {
            toast.error('Token inválido ou inexistente na URL.');
            return;
        }

        if (novaSenha !== confirmarSenha) {
            toast.error('As senhas não coincidem.');
            return;
        }

        if (novaSenha.length < 6) {
            toast.error('A senha deve ter pelo menos 6 caracteres.');
            return;
        }

        setLoading(true);
        try {
            await resetPassword({ token, novaSenha });
            setSuccess(true);
            toast.success('Senha atualizada com sucesso!');
        } catch (err: any) {
            console.error('Erro ao redefinir senha:', err);
            toast.error(err.message || 'Erro ao redefinir senha.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.pageWrapper}>
            <div className={styles.cardWrapper}>
                <div className={styles.resetCard}>
                    <div className={styles.brandSection}>
                        <img src={logo} alt="Logo" className={styles.brandLogo} />
                    </div>

                    <div className={styles.formSection}>
                        <h1 className={styles.title}>Redefinir Senha</h1>
                        <p className={styles.subtitle}>
                            {email ? `Criando nova senha para ${email}` : 'Crie uma nova senha para sua conta.'}
                        </p>

                        {success ? (
                            <div className={styles.successBox}>
                                <p>Sua senha foi redefinida com sucesso.</p>
                                <button className={styles.submitButton} onClick={() => navigate('/login')}>
                                    Ir para o Login
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit}>
                                <div className={styles.fieldGroup}>
                                    <label className={styles.fieldLabel}>Nova Senha <span className={styles.requiredMark}>*</span></label>
                                    <div className={styles.passwordWrapper}>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            className={styles.fieldInput}
                                            value={novaSenha}
                                            onChange={(e) => setNovaSenha(e.target.value)}
                                            required
                                            placeholder="Nova senha"
                                        />
                                        <button
                                            type="button"
                                            className={styles.passwordToggle}
                                            onClick={() => setShowPassword(!showPassword)}
                                        >
                                            {showPassword ? <FiEyeOff /> : <FiEye />}
                                        </button>
                                    </div>
                                </div>

                                <div className={styles.fieldGroup}>
                                    <label className={styles.fieldLabel}>Confirmar Nova Senha <span className={styles.requiredMark}>*</span></label>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className={styles.fieldInput}
                                        value={confirmarSenha}
                                        onChange={(e) => setConfirmarSenha(e.target.value)}
                                        required
                                        placeholder="Repita a nova senha"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className={styles.submitButton}
                                    disabled={loading || !token}
                                >
                                    {loading ? 'Redefinindo...' : 'Salvar Nova Senha'}
                                </button>

                                <div className={styles.backLink}>
                                    <Link to="/login">
                                        <FiArrowLeft /> Voltar para o Login
                                    </Link>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
