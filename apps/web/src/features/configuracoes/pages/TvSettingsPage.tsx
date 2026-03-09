import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { FiLock, FiUnlock } from 'react-icons/fi';
import PageHeader from '../../../shared/components/PageHeader';
import { Button, Input } from '../../../shared/components';
import usePermissions from '../../../hooks/usePermissions';
import { getTvConfig, setTvPin, deleteTvPin } from '../../../services/apiClient';
import Skeleton from '../../../shared/components/Skeleton';
import styles from './TvSettingsPage.module.css';

interface TvSettingsPageProps {
    user: { role?: string; email?: string; permissoes?: Record<string, string> };
}

export default function TvSettingsPage({ user }: TvSettingsPageProps) {
    const { t } = useTranslation();
    const perm = usePermissions(user);

    const [hasPin, setHasPin] = useState<boolean | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [pin, setPin] = useState('');
    const [pinConfirm, setPinConfirm] = useState('');
    const [pinError, setPinError] = useState('');
    const [confirmError, setConfirmError] = useState('');
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState(false);

    useEffect(() => {
        if (!perm.isAdmin) return;
        getTvConfig()
            .then(cfg => setHasPin(cfg.hasPin))
            .catch(() => toast.error(t('tvSettings.errorLoad')))
            .finally(() => setLoadingConfig(false));
    }, [perm.isAdmin, t]);

    if (!perm.isAdmin) {
        return <p className={styles.accessDenied}>{t('tvSettings.accessDenied')}</p>;
    }

    const handleSave = async () => {
        let valid = true;
        if (!/^\d{4,8}$/.test(pin)) {
            setPinError(t('tvSettings.errorLength'));
            valid = false;
        } else {
            setPinError('');
        }
        if (pin !== pinConfirm) {
            setConfirmError(t('tvSettings.errorMatch'));
            valid = false;
        } else {
            setConfirmError('');
        }
        if (!valid) return;

        setSaving(true);
        try {
            await setTvPin(pin);
            setHasPin(true);
            setPin('');
            setPinConfirm('');
            toast.success(t('tvSettings.successSet'));
        } catch (err: any) {
            toast.error(String(err?.message || t('tvSettings.errorSave')));
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async () => {
        if (!window.confirm(t('tvSettings.confirmRemove'))) return;
        setRemoving(true);
        try {
            await deleteTvPin();
            setHasPin(false);
            toast.success(t('tvSettings.successRemoved'));
        } catch (err: any) {
            toast.error(String(err?.message || t('tvSettings.errorRemove')));
        } finally {
            setRemoving(false);
        }
    };

    return (
        <>
            <PageHeader
                title={t('tvSettings.title')}
                subtitle={t('tvSettings.subtitle')}
            />

            <div className={styles.container}>
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h3>
                            {loadingConfig ? (
                                <Skeleton variant="text" width={160} />
                            ) : hasPin ? (
                                <span className={`${styles.statusBadge} ${styles.statusActive}`}>
                                    <FiLock size={14} />
                                    {t('tvSettings.statusHasPin')}
                                </span>
                            ) : (
                                <span className={`${styles.statusBadge} ${styles.statusInactive}`}>
                                    <FiUnlock size={14} />
                                    {t('tvSettings.statusNoPin')}
                                </span>
                            )}
                        </h3>
                        <p>{t('tvSettings.pinDesc')}</p>
                    </div>

                    <h4 className={styles.sectionTitle}>
                        {hasPin ? t('tvSettings.sectionChangePin') : t('tvSettings.sectionSetPin')}
                    </h4>

                    <div className={styles.formGroup}>
                        <Input
                            label={t('tvSettings.labelNewPin')}
                            type="password"
                            inputMode="numeric"
                            maxLength={8}
                            value={pin}
                            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                            placeholder="••••"
                            error={pinError}
                        />
                        <Input
                            label={t('tvSettings.labelConfirmPin')}
                            type="password"
                            inputMode="numeric"
                            maxLength={8}
                            value={pinConfirm}
                            onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                            placeholder="••••"
                            error={confirmError}
                        />
                    </div>

                    <div className={styles.actions}>
                        <Button
                            onClick={handleSave}
                            disabled={saving || pin.length < 4}
                        >
                            {saving
                                ? t('tvSettings.btnSaving')
                                : hasPin
                                    ? t('tvSettings.btnChange')
                                    : t('tvSettings.btnSet')}
                        </Button>

                        {hasPin && (
                            <Button
                                variant="danger"
                                onClick={handleRemove}
                                disabled={removing}
                            >
                                {removing ? t('tvSettings.btnRemoving') : t('tvSettings.btnRemove')}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
