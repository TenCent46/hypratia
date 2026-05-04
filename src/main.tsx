// Must be the first import — installs a Buffer global so `gray-matter`'s
// parse path (`Buffer.from(input)` inside `to-file.js`) doesn't throw
// `ReferenceError: Can't find variable: Buffer` in the WKWebView. Every
// downstream module that touches `matter()` depends on it.
import './lib/bufferPolyfill';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './i18n';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ReactFlowProvider>
        <App />
      </ReactFlowProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
