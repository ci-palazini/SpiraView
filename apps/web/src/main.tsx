// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './i18n';

import SWUpdateBanner from './components/SWUpdateBanner';
import LegacyDomainWarning from './components/LegacyDomainWarning';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        <BrowserRouter>
            <LegacyDomainWarning />
            <SWUpdateBanner />
            <App />
        </BrowserRouter>
    </React.StrictMode>
);
