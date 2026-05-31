import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './main.css';
import { logRuntimeIssue } from './tauri/logging';

function registerGlobalRuntimeLogging(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.addEventListener('error', (event) => {
    void logRuntimeIssue({
      source: 'window.error',
      message: event.message,
      details: event.error instanceof Error && event.error.stack ? event.error.stack : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const details = reason instanceof Error && reason.stack ? reason.stack : undefined;

    void logRuntimeIssue({
      source: 'window.unhandledrejection',
      message,
      details,
    });
  });
}

registerGlobalRuntimeLogging();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
