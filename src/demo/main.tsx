// Must be the first import — see src/lib/bufferPolyfill.ts.
import '../lib/bufferPolyfill';
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../App.css';
import '../web/styles.css';
import { DemoApp } from './DemoApp';
import { LocaleProvider } from '../web/LocaleProvider';
import { detectLocale, persistLocale } from '../web/i18n';

const root = document.getElementById('root');
if (!root) throw new Error('demo root element missing');

const initialLocale = detectLocale();
persistLocale(initialLocale);

ReactDOM.createRoot(root as HTMLElement).render(
  <React.StrictMode>
    <LocaleProvider initialLocale={initialLocale}>
      <DemoApp />
    </LocaleProvider>
  </React.StrictMode>,
);
