import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './main.css';
import { logRuntimeIssue } from './tauri/logging';

/**
 * 全局运行时日志注册
 * 同时分发自定义事件 vad:runtime-error，供 AppShell 统一消费，
 * 避免在 AppShell 中重复注册 'error' / 'unhandledrejection' 原生监听器。
 */
function registerGlobalRuntimeLogging(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.addEventListener('error', (event) => {
    const message = event.message;
    const details = event.error instanceof Error && event.error.stack ? event.error.stack : undefined;

    void logRuntimeIssue({ source: 'window.error', message, details });

    window.dispatchEvent(
      new CustomEvent('vad:runtime-error', { detail: { source: 'window.error', error: message } }),
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const details = reason instanceof Error && reason.stack ? reason.stack : undefined;

    void logRuntimeIssue({ source: 'window.unhandledrejection', message, details });

    window.dispatchEvent(
      new CustomEvent('vad:runtime-error', { detail: { source: 'window.unhandledrejection', error: message } }),
    );
  });
}

registerGlobalRuntimeLogging();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
