// src/components/LanguageMenu.tsx
import { useEffect, useRef, useState, ElementType } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './LanguageMenu.module.css';

// Bandeiras (npm i country-flag-icons)
import { BR, ES, US, GB, FR, IT, DE, CN, TW, JP, KR } from 'country-flag-icons/react/3x2';

type LanguageCode = 'pt' | 'es' | 'en' | 'fr' | 'de' | 'it' | 'zh-Hans' | 'zh-Hant' | 'ja' | 'ko';

// mapa: código -> componente de bandeira
const FLAG: Record<string, ElementType> = {
    pt: BR,
    es: ES,
    en: GB,
    fr: FR,
    de: DE,
    it: IT,
    'zh-Hans': CN,
    'zh-Hant': TW,
    ja: JP,
    ko: KR
};

interface LanguageOption {
    code: LanguageCode;
    label: string;
}

// Idiomas oferecidos
const DEFAULT_LANGS: LanguageOption[] = [
    { code: 'pt', label: 'Português' },
    { code: 'es', label: 'Español' },
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'it', label: 'Italiano' },
    { code: 'zh-Hans', label: '简体中文' },
    { code: 'zh-Hant', label: '繁體中文' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' }
];

// mantém o script para zh (Hans/Hant) ao resolver o idioma atual
const resolveCurrent = (lng: string): string => {
    const raw = (lng || 'pt').toString();
    if (/^zh/i.test(raw)) {
        if (/hant/i.test(raw) || /-(tw|hk|mo)/i.test(raw)) return 'zh-Hant';
        return 'zh-Hans';
    }
    return raw.split('-')[0];
};

interface LanguageMenuProps {
    className?: string;
    langs?: LanguageOption[];
}

export default function LanguageMenu({ className, langs = DEFAULT_LANGS }: LanguageMenuProps) {
    const { i18n } = useTranslation();
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const raw = i18n.resolvedLanguage || i18n.language || 'pt';
    const current = resolveCurrent(raw);
    const CurrentFlag = FLAG[current] || US;
    const currentLabel = langs.find(l => l.code === current)?.label || current.toUpperCase();
    const currentShort =
        current === 'zh-Hans' ? '简体中文' :
            current === 'zh-Hant' ? '繁體中文' :
                current.toUpperCase();

    // fecha ao clicar fora ou ESC
    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, []);

    return (
        <div ref={rootRef} className={`${styles.menuRoot} ${className || ''}`}>
            <button
                className={styles.langBtn}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen(v => !v)}
                title={currentLabel}
            >
                <span className={styles.flagWrap}>
                    {CurrentFlag ? <CurrentFlag /> : currentShort}
                </span>
                <span className={styles.langCode}>{currentShort}</span>
            </button>

            {open && (
                <div className={styles.langList} role="menu" aria-label="language menu">
                    {langs.map(({ code, label }) => {
                        const F = FLAG[code] || US;
                        const active = code === current;
                        return (
                            <button
                                key={code}
                                className={`${styles.langItem} ${active ? styles.langItemActive : ''}`}
                                onClick={() => {
                                    i18n.changeLanguage(code);
                                    setOpen(false);
                                }}
                                disabled={active}
                                role="menuitem"
                            >
                                <span className={styles.flagWrap}>{F ? <F /> : code.toUpperCase()}</span>
                                <span className={styles.langLabel}>{label}</span>
                                <span className={styles.langCodeSmall}>{code.toUpperCase()}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
