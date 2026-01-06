import React, { useEffect, useState } from 'react';

const LEGACY_DOMAINS = ['m-continua-tpm.vercel.app'];
const NEW_URL = 'https://ci-spiraview.vercel.app/';

const LegacyDomainWarning: React.FC = () => {
    const [isLegacy, setIsLegacy] = useState(false);

    useEffect(() => {
        const hostname = window.location.hostname;
        // Check for legacy domain match
        const isLegacyDomain = LEGACY_DOMAINS.includes(hostname) || window.location.search.includes('forceLegacyWarning');

        if (isLegacyDomain) {
            setIsLegacy(true);

            // Critical: Unregister all Service Workers to clear the cache loop
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then((registrations) => {
                    for (const registration of registrations) {
                        console.log('Unregistering legacy SW:', registration);
                        registration.unregister();
                    }
                });
            }
        }
    }, []);

    if (!isLegacy) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            padding: '20px',
            textAlign: 'center'
        }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#ff4d4f' }}>Versão Descontinuada</h1>
            <p style={{ fontSize: '1.2rem', maxWidth: '600px', marginBottom: '2rem', lineHeight: '1.6' }}>
                Você está acessando uma versão antiga salva no seu dispositivo.<br />
                Por favor, clique no botão abaixo para acessar a nova versão correta.
            </p>

            <a
                href={NEW_URL}
                style={{
                    padding: '12px 24px',
                    backgroundColor: '#1890ff',
                    color: 'white',
                    borderRadius: '4px',
                    textDecoration: 'none',
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'background 0.3s'
                }}
            >
                Acessar Nova Versão
            </a>

            <p style={{ marginTop: '2rem', fontSize: '0.9rem', color: '#888' }}>
                Se o problema persistir, tente limpar o cache do seu navegador.
            </p>
        </div>
    );
};

export default LegacyDomainWarning;
