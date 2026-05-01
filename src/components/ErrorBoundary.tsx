import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] caught', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="splash error" style={{ padding: 24, textAlign: 'left' }}>
          <h2 style={{ fontFamily: 'serif' }}>Something broke during render.</h2>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontSize: 12,
              background: '#fdf3f3',
              padding: 12,
              borderRadius: 6,
              border: '1px solid #e2c5c5',
            }}
          >
            {this.state.error.stack ?? this.state.error.message}
          </pre>
          <p style={{ color: '#666', fontSize: 13 }}>
            Open the devtools console (⌥⌘I) for more detail. Reload the window
            after the issue is fixed.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
