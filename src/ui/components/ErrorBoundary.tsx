import { Component, type ErrorInfo, type ReactNode } from 'react';
import { bridge, hasBridge } from '../bridge';
import { restartScreen } from '../diagnostics';
import { crumb, recentTrail } from '../trail';

/**
 * A drawing error anywhere inside used to blank the whole window. This catches it, logs it with
 * the recent trail, and restarts the screen, which comes straight back to the run (it saves after
 * every move). `quiet` parts (a speech box, say) just disappear instead of restarting anything.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; name: string; quiet?: boolean },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    crumb(`error in ${this.props.name}: ${error.message}`);
    if (hasBridge())
      void bridge().invoke('system.log', 'error', `drawing error in ${this.props.name}`, {
        message: error.message,
        stack: error.stack,
        component: info.componentStack?.split('\n').slice(0, 8).join('\n'),
        trail: recentTrail(),
      });
    if (this.props.quiet) {
      // Try again on the next change; a one-off glitch shouldn't hide the part for good.
      setTimeout(() => this.setState({ failed: false }), 1500);
      return;
    }
    restartScreen(`drawing error in ${this.props.name}: ${error.message}`);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return this.props.quiet ? null : (
      <div className="screen" role="status" style={{ display: 'grid', placeItems: 'center' }}>
        <p className="dim">Restarting the screen…</p>
      </div>
    );
  }
}
