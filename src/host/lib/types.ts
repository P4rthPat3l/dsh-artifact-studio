import type { IncomingMessage, ServerResponse } from 'node:http';

/** One registered workspace, as far as this plugin reads it. */
export interface WorkspaceRecord {
  readonly id: string;
  readonly path: string;
  readonly sessionIds?: readonly string[];
}

/** The workspace registry service. */
export interface WorkspaceRegistry {
  get(id: string): WorkspaceRecord | undefined;
  list(): readonly WorkspaceRecord[];
}

/** The caller behind an admitted request. */
export interface Peer {
  readonly principal?: { readonly kind?: string };
}

export type Admission = { readonly peer: Peer } | { readonly rejection: number };

/** One authenticated browser connection. */
export interface Connection {
  admit(request: IncomingMessage): Admission;
}

/** One route the web server exposes. */
export interface Route {
  readonly kind: 'prefix';
  readonly path: string;
  readonly handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
}

/** The web server service. */
export interface WebServer {
  register(route: Route): () => void;
}

/** One failure as the endpoint handler reports it. */
export interface EndpointFailure {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

/** The value an endpoint handler resolves with. */
export type EndpointResult = { ok: true; value: unknown } | { ok: false; error: EndpointFailure };

/** The endpoint handler the route calls. */
export type EndpointHandler = (endpoint: string, payload: unknown) => Promise<EndpointResult>;
