import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/ui/button';
import { ErrorScreen, reloadPage } from './ErrorScreen';

interface State {
  error: Error | null;
}

/** Catches errors above the router, for example in the providers, so the writer never sees a blank page. */
export class RootErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Vlo root error', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          detail={this.state.error.message}
          actions={<Button onClick={reloadPage}>Reload Vlo</Button>}
        />
      );
    }
    return this.props.children;
  }
}
