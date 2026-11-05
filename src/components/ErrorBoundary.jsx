import React from 'react';
import { isStaleChunkError, reloadForNewVersion } from '../utils/staleChunk';

// Catches render/runtime crashes in the page tree so one broken view shows a
// recoverable message instead of blanking the whole app. Wraps the whole
// shell (header, routes, footer) in App, so a throw in any of them shows the
// fallback. Keyed by pathname in App, so navigating anywhere clears the
// error state automatically.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // The site was updated while this tab was open: load the new version
    // instead of showing a crash.
    if (isStaleChunkError(error) && reloadForNewVersion()) {
      this.setState({ reloading: true });
      return;
    }
    console.error('Page crash caught by ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.reloading) {
      return (
        <div className="notebook-container py-24 text-center text-xs font-sans text-[var(--text-muted)] italic">
          Loading the latest version…
        </div>
      );
    }
    if (this.state.hasError) {
      return (
        <div className="notebook-container py-24 text-center">
          <h1 className="text-2xl font-serif font-medium mb-3">Something went wrong</h1>
          <p className="text-sm font-sans text-[var(--text-secondary)] mb-8 max-w-md mx-auto">
            This page hit an unexpected error. Reloading usually fixes it — your saved work is stored on the server, not in this tab.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="quiet-button text-sm"
          >
            Reload page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
