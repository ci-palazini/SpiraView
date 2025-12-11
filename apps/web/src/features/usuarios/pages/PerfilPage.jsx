// src/pages/PerfilPage.jsx
import React, { useState } from 'react';
import styles from './PerfilPage.module.css';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { changePassword } from '../../../services/apiClient';

const PerfilPage = ({ user }) => {
  const { t, i18n } = useTranslation();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [loading, setLoading] = useState(false);

  // traduz a função armazenada (pt) para exibição no idioma atual
  const roleLabel = (funcao) => {
    const map = {
      gestor: { pt: 'Gestor', es: 'Gestor' },
      manutentor: { pt: 'Manutentor', es: 'Mantenedor' },
      operador: { pt: 'Operador', es: 'Operador' }
    };
    const lng = i18n.resolvedLanguage || 'pt';
    return map[funcao]?.[lng] || funcao;
  };

  const handleChangePassword = async (e) => {
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
      await changePassword({
        email: user?.email,
        senhaAtual,
        novaSenha
      });

      toast.success(t('perfil.toasts.success'));
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmarSenha('');
    } catch (error) {
      console.error(error);
      const msg = String(error?.message || '').toLowerCase();
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
                onChange={(e) => setSenhaAtual(e.target.value)}
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
                onChange={(e) => setNovaSenha(e.target.value)}
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
                onChange={(e) => setConfirmarSenha(e.target.value)}
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
