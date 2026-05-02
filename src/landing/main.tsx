import React from 'react';
import ReactDOM from 'react-dom/client';
// Reuse the Mac app's full stylesheet so every theme token (--bg, --accent,
// --text, etc.) and component class (.markdown-node, .chat-panel, .message)
// stays visually in sync with the desktop app.
import '../App.css';
import '../web/styles.css';
import { LandingApp } from './LandingApp';

const root = document.getElementById('root');
if (!root) throw new Error('landing root element missing');

ReactDOM.createRoot(root as HTMLElement).render(
  <React.StrictMode>
    <LandingApp />
  </React.StrictMode>,
);
