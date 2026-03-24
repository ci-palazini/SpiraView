// src/features/usuarios/pages/PerfilPage.tsx
import React, { useState, FormEvent } from 'react';
import styles from './PerfilPage.module.css';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { changePassword } from '../../../services/apiClient';
import { Card, CardHeader, Input, Button } from '../../../shared/components';

// ---------- Types ----------
interface UserData {
    nome?: string;
    email?: string;
    funcao?: string;
}

interface PerfilPageProps {
    user: UserData;
}

// ---------- Component ----------
const PerfilPage = ({ user }: PerfilPageProps) => {
    const { t } = useTranslation();
    const [senhaAtual, setSenhaAtual] = useState('');
    const [novaSenha, setNovaSenha] = useState('');
    const [confirmarSenha, setConfirmarSenha] = useState('');
    const [loading, setLoading] = useState(false);

    const roleLabel = (funcao: string | undefined): string => funcao || '';

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
            <header className={styles.pageHeader}>
                <h1>{t('perfil.title')}</h1>
            </header>

            <div className={styles.container}>
                <Card>
                    <CardHeader title={t('perfil.info.title')} />
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
                </Card>

                <Card>
                    <CardHeader title={t('perfil.changePassword.title')} />
                    <form onSubmit={handleChangePassword}>
                        <Input
                            type="password"
                            id="senha-atual"
                            label={t('perfil.changePassword.current')}
                            value={senhaAtual}
                            onChange={(e) => setSenhaAtual(e.target.value)}
                            required
                        />
                        <Input
                            type="password"
                            id="nova-senha"
                            label={t('perfil.changePassword.new')}
                            value={novaSenha}
                            onChange={(e) => setNovaSenha(e.target.value)}
                            required
                        />
                        <Input
                            type="password"
                            id="confirmar-senha"
                            label={t('perfil.changePassword.confirm')}
                            value={confirmarSenha}
                            onChange={(e) => setConfirmarSenha(e.target.value)}
                            required
                        />

                        <Button type="submit" loading={loading}>
                            {t('perfil.actions.save')}
                        </Button>
                    </form>
                </Card>
            </div>
        </>
    );
};

export default PerfilPage;
