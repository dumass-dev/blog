import React from 'react';

// Catches render/runtime crashes in the page tree so one broken view shows a
// recoverable message instead of blanking the whole app. Header and footer
// live outside this boundary and keep working. Keyed by pathname in App, so
// navigating anywhere clears the error state automatically.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Page crash caught by ErrorBoundary:', error, info);
  }

  render() {
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
