
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initAnalytics } from './lib/analytics';

// Initialise PostHog before the React tree mounts so the
// automatic $pageview fires before any component-level events.
initAnalytics();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
    