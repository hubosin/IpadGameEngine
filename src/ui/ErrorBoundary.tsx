import { Component, type ReactNode } from 'react';
import { editor } from '../core/editorStore';

/** Keeps one broken panel from blanking the whole editor. */
export class ErrorBoundary extends Component<{ children: ReactNode; name: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { editor().log('error', `${this.props.name} crashed: ${error.message}`, 'editor'); }
  render() {
    if (this.state.error) {
      return (
        <div className="hint" style={{ padding: 12 }}>
          {this.props.name} hit an error: {this.state.error.message}
          <div><button className="btn sm" onClick={() => this.setState({ error: null })}>Retry</button></div>
        </div>
      );
    }
    return this.props.children;
  }
}
