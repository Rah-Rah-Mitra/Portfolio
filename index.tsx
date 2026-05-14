
import React from 'react';
import ReactDOM from 'react-dom/client';
import { PostHogErrorBoundary, PostHogProvider } from '@posthog/react';
import App from './App';
import { getPostHogClient, initAnalytics } from './lib/analytics';
import './index.css';

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
    <PostHogProvider client={getPostHogClient()}>
      <PostHogErrorBoundary
        additionalProperties={() => ({ area: 'react_render' })}
        fallback={(
          <div className="min-h-screen bg-gray-950 px-6 py-20 text-center text-white">
            <h1 className="text-2xl font-bold">Something went wrong.</h1>
            <p className="mt-3 text-gray-300">Refresh the page to reload the portfolio.</p>
          </div>
        )}
      >
        <App />
      </PostHogErrorBoundary>
    </PostHogProvider>
  </React.StrictMode>
);
    
