import React from 'react';
import ReactDOM from 'react-dom/client';
// Landing has its own dark theme + Tailwind utilities. We deliberately do NOT
// import App.css / web/styles.css here so the landing stays fully isolated
// from the Mac app's CSS surface.
import './tailwind.css';
import { LandingApp } from './LandingApp';
import { LocaleProvider } from '../web/LocaleProvider';
import { detectLocale, persistLocale } from '../web/i18n';

const root = document.getElementById('root');
if (!root) throw new Error('landing root element missing');

const initialLocale = detectLocale();
persistLocale(initialLocale);

ReactDOM.createRoot(root as HTMLElement).render(
  <React.StrictMode>
    <LocaleProvider initialLocale={initialLocale}>
      <LandingApp />
    </LocaleProvider>
  </React.StrictMode>,
);
