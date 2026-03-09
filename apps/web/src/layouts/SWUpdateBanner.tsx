// src/components/SWUpdateBanner.tsx
import { useRef, useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';
import styles from './SWUpdateBanner.module.css';

interface NavigatorWithStandalone extends Navigator {
    standalone?: boolean;
}

const isStandalone = (): boolean =>
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    (window.navigator as NavigatorWithStandalone)?.standalone === true;

interface SWUpdateBannerProps {
    showOnlyInApp?: boolean;
    autoUpdateOnWeb?: boolean;
}

export default function SWUpdateBanner({
    showOnlyInApp = false,
    autoUpdateOnWeb = true
}: SWUpdateBannerProps) {
    const { t } = useTranslation();

    const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
        immediate: true,
        onRegisteredSW(_swUrl: string, r: ServiceWorkerRegistration | undefined) {
            // Verifica atualizações do SW periodicamente (60s)
            if (r) {
                setInterval(() => { r.update(); }, 60_000);
            }
        }
    });

    const [dismissed, setDismissed] = useState(false);
    const standalone = isStandalone();

    const updatedOnce = useRef(false);
    useEffect(() => {
        if (!standalone && autoUpdateOnWeb && needRefresh[0] && !updatedOnce.current) {
            updatedOnce.current = true;
            updateServiceWorker(true);
        }
    }, [standalone, autoUpdateOnWeb, needRefresh, updateServiceWorker]);

    // Auto-dismiss the "installed" confirmation after 4 seconds
    useEffect(() => {
        if (offlineReady[0]) {
            const timer = setTimeout(() => setDismissed(true), 4000);
            return () => clearTimeout(timer);
        }
    }, [offlineReady]);

    if (showOnlyInApp && !standalone) return null;

    if ((!(needRefresh[0] || offlineReady[0])) || dismissed) return null;

    return (
        <div className={styles.banner} role="region" aria-live="polite">
            <div className={styles.content}>
                {offlineReady[0] && !needRefresh[0] && <span>{t('pwa.offlineReady')}</span>}
                {needRefresh[0] && (
                    <>
                        <span className={styles.text}>{t('pwa.newVersion')}</span>
                        <button
                            className={styles.primary}
                            onClick={() => updateServiceWorker(true)}
                        >
                            {t('pwa.update')}
                        </button>
                    </>
                )}
            </div>
            <button
                className={styles.close}
                onClick={() => setDismissed(true)}
                aria-label={t('pwa.dismiss')}
                title={t('pwa.dismiss')}
            >
                ×
            </button>
        </div>
    );
}
