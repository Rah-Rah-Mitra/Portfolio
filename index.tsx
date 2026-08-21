
import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import { initAnalytics } from './lib/analytics';
import './index.css';
import './field-test.css';

// Queue early events, then load PostHog after first interaction or a bounded idle fallback.
initAnalytics();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const application = (
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);

if (rootElement.hasChildNodes()) {
  hydrateRoot(rootElement, application, {
    onRecoverableError: (error, errorInfo) => {
      console.warn('[hydration]', error, errorInfo?.componentStack ?? '');
    },
  });
} else {
  createRoot(rootElement).render(application);
}
    
