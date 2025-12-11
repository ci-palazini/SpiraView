// src/components/SWUpdateBanner.jsx
import React, { useRef, useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';
import styles from './SWUpdateBanner.module.css';

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)')?.matches ||
  window.navigator?.standalone === true; // iOS

export default function SWUpdateBanner({ showOnlyInApp = true, autoUpdateOnWeb = false }) {
  const { t } = useTranslation();

  // 👉 registra o SW aqui, apenas uma vez, já na primeira carga
  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    immediate: true
  });

  const [dismissed, setDismissed] = useState(false);
  const standalone = isStandalone();

  // (opcional) Se quiser auto-atualizar no web sem mostrar banner, chame apenas UMA vez
  const updatedOnce = useRef(false);
  useEffect(() => {
    if (!standalone && autoUpdateOnWeb && needRefresh && !updatedOnce.current) {
      updatedOnce.current = true;
      updateServiceWorker(true);
    }
  }, [standalone, autoUpdateOnWeb, needRefresh, updateServiceWorker]);

  // Mostrar só quando instalado (recomendado)
  if (showOnlyInApp && !standalone) return null;

  if ((!(needRefresh || offlineReady)) || dismissed) return null;

  return (
    <div className={styles.banner} role="region" aria-live="polite">
      <div className={styles.content}>
        {offlineReady && <span>{t('pwa.offlineReady')}</span>}
        {needRefresh && (
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
