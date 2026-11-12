import React from 'react';
import type { ReactNode } from 'react';

/** What the boundary renders when it catches a failure. */
export interface SurfaceBoundaryProps {
  title: string;
  hint: string;
  reloadLabel: string;
  children?: ReactNode;
}

/** The boundary's own state. */
interface SurfaceBoundaryState {
  failed: boolean;
}

/**
 * Keep one plugin surface from taking the sidebar down when it throws.
 *
 * The fallback is a message and a window reload. The failure still reaches the
 * browser console through React; the plugin logs no artifact content.
 */
export class SurfaceBoundary extends React.Component<SurfaceBoundaryProps, SurfaceBoundaryState> {
  constructor(props: SurfaceBoundaryProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): SurfaceBoundaryState {
    return { failed: true };
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="art-root" data-dsh-artifacts="">
        <div className="art-center" role="alert">
          <p className="art-center-title">{this.props.title}</p>
          <p className="art-center-hint">{this.props.hint}</p>
          <button type="button" className="art-button" onClick={() => window.location.reload()}>
            {this.props.reloadLabel}
          </button>
        </div>
      </section>
    );
  }
}
