// src/layouts/OfflineBanner.tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { WifiOff, Wifi } from 'lucide-react';
import styles from './OfflineBanner.module.css';

export default function OfflineBanner() {
    const { t } = useTranslation();
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [showBackOnline, setShowBackOnline] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setShowBackOnline(true);
            const timer = setTimeout(() => setShowBackOnline(false), 3000);
            return () => clearTimeout(timer);
        };
        const handleOffline = () => {
            setIsOnline(false);
            setShowBackOnline(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (isOnline && !showBackOnline) return null;

    return (
        <div
            className={isOnline ? styles.bannerOnline : styles.bannerOffline}
            role="alert"
            aria-live="assertive"
        >
            {isOnline ? (
                <>
                    <Wifi size={16} />
                    <span>{t('offline.backOnline')}</span>
                </>
            ) : (
                <>
                    <WifiOff size={16} />
                    <span>{t('offline.warning')}</span>
                </>
            )}
        </div>
    );
}
