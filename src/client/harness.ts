import type { ComponentType, ReactNode } from 'react';

/** Harness services the browser client receives through its plugin context. */

/** One outcome of a route call. */
export type RpcOutcome =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string; details: Record<string, unknown> } };

export interface ConnectionService {
  rpc: { call(route: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RpcOutcome> };
}

export interface OpenResourceOptions {
  kind?: string;
  params?: Record<string, unknown>;
}

export interface SidebarRightService {
  openResource(address: string, options?: OpenResourceOptions): void;
  openTab(kind: string, options?: { params?: Record<string, unknown> }): void;
}

/** The central-panel switch of the Harness layout. */
export interface LayoutService {
  selectPanel(panelId: string | null): void;
}

/** A guarded copy of the composer caret, as the input actions return it. */
export interface TokenSpan {
  readonly start: number;
  readonly end: number;
  readonly draftRev: number;
}

/** The composer actions a session-scoped slot receives. Nothing here sends a message. */
export interface InputActions {
  insertQuote(text: string): boolean;
  captureInsertion(): TokenSpan;
  insertText(text: string, span: TokenSpan): boolean;
}

export type Translator = (key: string, values?: Record<string, string | number>) => string;

export interface LocaleService {
  register(namespace: string, language: string, dictionary: Record<string, string>): void;
  bind(namespace: string): Translator;
}

export interface TabNavigation {
  address?: string;
  params?: Record<string, unknown>;
  revision?: number;
}

/** The actions a tab may take on itself. */
export interface TabActions {
  bindCommands(commands: { refresh?: () => void }): () => void;
  openResource(address: string, options?: OpenResourceOptions): void;
  openTab(kind: string, options?: { params?: Record<string, unknown> }): void;
  close(): void;
}

export interface TabInfo {
  sidebar?: { expanded: boolean; fullscreen: boolean };
  tab: { id: string; contentId?: string; navigation?: TabNavigation; visible?: boolean; actions?: TabActions };
  panel: { id: string };
}

export type UseTabInfo = () => TabInfo;

export interface WorkspaceItem {
  workspaceId: string;
  path: string;
  title: string;
  sessionIds?: readonly string[];
}

/** The workspace registry's client store. */
export interface WorkspacesSource {
  getSnapshot(): { items: readonly WorkspaceItem[] };
  subscribe(listener: () => void): () => void;
}

export interface WorkspacesService {
  list: WorkspacesSource;
}

export interface SessionItem {
  cwd?: string;
}

export interface WorkspaceState {
  items: WorkspaceItem[];
}

export interface SessionState {
  byId: Record<string, SessionItem | undefined>;
}

export type StoreHook<T> = <R>(selector: (state: T) => R) => R;

export interface GuideEntry {
  id: string;
  order: number;
  title: () => string;
  description: () => string;
  icon: () => ReactNode;
}

export interface TabTypeDefinition {
  id: string;
  kind: string;
  priority: 'extension' | 'builtin' | 'fallback';
  keepMounted?: boolean;
  patterns?: string[];
  title: (address: string) => string;
  canOpen?: (address: string) => boolean;
  guide?: GuideEntry[];
}

export interface SlotSpec {
  name: string;
  key?: string;
  id?: string;
  order?: number;
  locale?: string;
  label?: string | (() => string);
  inject?: () => Record<string, unknown>;
}

export interface SlotsService {
  inject(name: string, register: () => (() => void) | void): void;
  register<P>(spec: SlotSpec, component: ComponentType<P>): () => void;
}

export interface ClientContext {
  connection: ConnectionService;
  sidebarRight: SidebarRightService;
  locale: LocaleService;
  slots: SlotsService;
  sidebarRightTabs: { register(definition: TabTypeDefinition): () => void };
  workspaces: WorkspacesService;
  /** Look up an optional service by name. */
  get(name: string): unknown;
  effect(callback: () => (() => void) | void, label?: string): void;
}

/** Standard props every session-scoped slot body receives, plus the translator this plugin injects. */
export interface SessionSlotProps {
  sessionId: string;
  t: Translator;
  useSessions: StoreHook<SessionState>;
  useWorkspaces: StoreHook<WorkspaceState>;
  /** Present when the slot belongs to a live session composer. */
  inputActions?: InputActions;
}

export interface TabProps extends SessionSlotProps {
  useTabInfo: UseTabInfo;
}

/** The parts of a settled tool result this plugin reads. */
export interface ToolResultBlock {
  isError?: boolean;
  meta?: unknown;
  content?: readonly unknown[];
  /** Parsed call arguments, present on running and settled calls. */
  args?: unknown;
  /** Raw argument text of a dispatched call. */
  argsRaw?: string;
}

export interface ToolViewProps extends SessionSlotProps {
  phase?: 'preparing' | 'start' | 'result';
  toolName?: string;
  block?: ToolResultBlock;
}
