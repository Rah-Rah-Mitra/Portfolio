import React from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';

export const SemanticAppRoot: React.FC = () => (
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);

// renderToString (not renderToStaticMarkup) so the emitted document keeps the
// text-node separator comments hydrateRoot needs; static markup forces React to
// discard the entire server DOM and re-render on every visit.
export const renderSemanticPortfolio = () => renderToString(<SemanticAppRoot />);
