// src/features/usuarios/pages/PerfilPage.tsx
import React, { useState, FormEvent, ChangeEvent } from 'react';
import styles from './PerfilPage.module.css';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { changePassword } from '../../../services/apiClient';

// ---------- Types ----------
interface User {
    nome?: string;
    email?: string;
    funcao?: string;
}

export interface PerfilPageProps {
    user: User;
}

type RoleLabelMap = {
    [key: string]: { pt: string; es: string };
};

// ---------- Component ----------
const PerfilPage = ({ user }: PerfilPageProps) => {
    const { t, i18n } = useTranslation();
    const [senhaAtual, setSenhaAtual] = useState('');
    const [novaSenha, setNovaSenha] = useState('');
    const [confirmarSenha, setConfirmarSenha] = useState('');
    const [loading, setLoading] = useState(false);

    // traduz a função armazenada (pt) para exibição no idioma atual
    const roleLabel = (funcao: string | undefined): string => {
        const map: RoleLabelMap = {
            gestor: { pt: 'Gestor', es: 'Gestor' },
            manutentor: { pt: 'Manutentor', es: 'Mantenedor' },
            operador: { pt: 'Operador', es: 'Operador' }
        };
        const lng = (i18n.resolvedLanguage || 'pt') as 'pt' | 'es';
        if (!funcao) return '';
        return map[funcao]?.[lng] || funcao;
    };

    const handleChangePassword = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (novaSenha !== confirmarSenha) {
            toast.error(t('perfil.toasts.mismatch'));
            setLoading(false);
            return;
        }
        if (novaSenha.length < 6) {
            toast.error(t('perfil.toasts.short'));
            setLoading(false);
            return;
        }

        try {
            if (!user?.email) {
                toast.error(t('perfil.toasts.noEmail', 'E-mail não encontrado.'));
                setLoading(false);
                return;
            }

            await changePassword({
                email: user.email,
                senhaAtual,
                novaSenha
            });

            toast.success(t('perfil.toasts.success'));
            setSenhaAtual('');
            setNovaSenha('');
            setConfirmarSenha('');
        } catch (error) {
            console.error(error);
            const msg = String((error as Error)?.message || '').toLowerCase();
            if (msg.includes('atual inválida')) toast.error(t('perfil.toasts.wrongPassword'));
            else toast.error(t('perfil.toasts.generic'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <header style={{ padding: '20px', backgroundColor: '#ffffff', borderBottom: '1px solid #e0e0e0' }}>
                <h1>{t('perfil.title')}</h1>
            </header>

            <div className={styles.container} style={{ padding: '20px' }}>
                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>{t('perfil.info.title')}</h2>
                    <div className={styles.infoGrid}>
                        <div className={styles.infoItem}>
                            <strong>{t('perfil.info.name')}</strong>
                            <p>{user.nome}</p>
                        </div>
                        <div className={styles.infoItem}>
                            <strong>{t('perfil.info.email')}</strong>
                            <p>{user.email}</p>
                        </div>
                        <div className={styles.infoItem}>
                            <strong>{t('perfil.info.role')}</strong>
                            <p style={{ textTransform: 'capitalize' }}>
                                {roleLabel(user.funcao)}
                            </p>
                        </div>
                    </div>
                </div>

                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>{t('perfil.changePassword.title')}</h2>
                    <form onSubmit={handleChangePassword}>
                        <div className={styles.formGroup}>
                            <label htmlFor="senha-atual">{t('perfil.changePassword.current')}</label>
                            <input
                                type="password"
                                id="senha-atual"
                                className={styles.input}
                                value={senhaAtual}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setSenhaAtual(e.target.value)}
                                required
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="nova-senha">{t('perfil.changePassword.new')}</label>
                            <input
                                type="password"
                                id="nova-senha"
                                className={styles.input}
                                value={novaSenha}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setNovaSenha(e.target.value)}
                                required
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="confirmar-senha">{t('perfil.changePassword.confirm')}</label>
                            <input
                                type="password"
                                id="confirmar-senha"
                                className={styles.input}
                                value={confirmarSenha}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmarSenha(e.target.value)}
                                required
                            />
                        </div>

                        <button type="submit" className={styles.button} disabled={loading}>
                            {loading ? t('perfil.actions.saving') : t('perfil.actions.save')}
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
};

export default PerfilPage;
