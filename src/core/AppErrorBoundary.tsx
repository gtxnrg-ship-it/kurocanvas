import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the details local to the browser console; do not send project data to a server.
    console.error('Kuro Canvas encountered a rendering error.', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-crash-recovery" role="alert" aria-live="assertive">
          <div className="app-crash-mark" aria-hidden="true">K</div>
          <p className="app-crash-eyebrow">KURO CANVAS · RECOVERY</p>
          <h1>Something went wrong.</h1>
          <p>The interface hit an unexpected error. Your latest saved work should remain in this browser's local storage, but unsaved changes may not have been preserved.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload Kuro Canvas</button>
          <small>If this repeats, report the steps you took and the browser console error. Do not share API keys or private story material.</small>
        </main>
      );
    }
    return this.props.children;
  }
}
