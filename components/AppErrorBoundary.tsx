import React from 'react';
import { captureAnalyticsException } from '../lib/analytics';

interface AppErrorBoundaryState {
  failed: boolean;
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    captureAnalyticsException(error, { area: 'react_render' });
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="error-boundary" id="main-content">
          <h1>Something went wrong.</h1>
          <p className="panel-context">Portfolio recovery</p>
          <p>Refresh the page to reload Rahul’s portfolio. No form input was saved or transmitted.</p>
          <button type="button" className="button button-primary" onClick={() => window.location.reload()}>Reload portfolio</button>
        </main>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
