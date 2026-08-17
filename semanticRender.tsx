import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';

export const SemanticAppRoot: React.FC = () => (
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);

export const renderSemanticPortfolio = () => renderToStaticMarkup(<SemanticAppRoot />);
