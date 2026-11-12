import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { formatArtifactAddress } from '../contract.js';
import type { ArtifactAddress, ArtifactPayload, Manifest } from '../contract.js';
import { api, codeOf } from './api.js';
import type { Where } from './api.js';
import { announceListChange, announceVersion, rememberTitle } from './store.js';

export interface EditorState {
  payload: ArtifactPayload | null;
  draft: string | null;
  loading: boolean;
  saving: boolean;
  failure?: string;
  conflict: boolean;
  revision: number;
}

// Mounted views share one editor. Only unsaved editors survive the last unmount.
const retained = new Map<string, EditorModel>();
let removeGuard: (() => void) | undefined;

export function installDraftGuard(): () => void {
  removeGuard?.();
  const onUnload = (event: BeforeUnloadEvent) => {
    if (![...retained.values()].some(model => model.getSnapshot().draft !== null || model.getSnapshot().saving)) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', onUnload);
  removeGuard = () => window.removeEventListener('beforeunload', onUnload);
  return removeGuard;
}

export class EditorModel {
  private state: EditorState = { payload: null, draft: null, loading: true, saving: false, conflict: false, revision: 0 };
  private readonly listeners = new Set<() => void>();
  private pending: Promise<boolean> | null = null;
  private readSequence = 0;
  private mounts = 0;
  private renameTo: string | undefined;
  readonly where: Where;
  readonly key: string;

  readonly address: ArtifactAddress;

  constructor(address: ArtifactAddress) {
    this.address = address;
    this.key = formatArtifactAddress(address);
    this.where = { scope: address.scope, workspaceId: address.scope === 'workspace' ? address.workspaceId : null };
  }

  getSnapshot = (): EditorState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(patch: Partial<EditorState>): void {
    this.state = { ...this.state, ...patch };
    if (this.state.draft !== null || this.state.saving) retained.set(this.key, this);
    else if (this.mounts === 0 && retained.get(this.key) === this) retained.delete(this.key);
    for (const listener of this.listeners) listener();
  }

  attach(): () => void {
    this.mounts += 1;
    retained.set(this.key, this);
    if (this.mounts === 1 && (this.state.payload === null || this.state.draft === null)) void this.load();
    return () => {
      this.mounts -= 1;
      if (this.mounts === 0 && this.state.draft === null && !this.state.saving && retained.get(this.key) === this) retained.delete(this.key);
    };
  }

  async load(): Promise<void> {
    const sequence = ++this.readSequence;
    this.publish({ loading: true, failure: undefined });
    try {
      const payload = await api.get(this.where, this.address.id);
      if (sequence !== this.readSequence) return;
      // A delayed refresh must not erase typing that started while it was loading.
      if (this.state.draft !== null && this.state.payload !== null) {
        this.publish({ loading: false, conflict: payload.version !== this.state.payload.version });
        return;
      }
      this.publish({ payload, loading: false, conflict: false, failure: undefined, revision: this.state.revision + 1 });
      rememberTitle(this.address.id, payload.manifest.title);
      announceVersion(this.address.id, payload.version);
    } catch (error) {
      if (sequence === this.readSequence) this.publish({ loading: false, failure: codeOf(error) ?? 'artifact/storage-failure' });
    }
  }

  edit(text: string): void {
    this.publish({ draft: text, failure: undefined });
  }

  async discardAndReload(): Promise<void> {
    if (this.pending !== null) await this.pending;
    this.publish({ draft: null, conflict: false, failure: undefined });
    await this.load();
  }

  externalVersion(version: number): void {
    if (this.state.payload === null || version <= this.state.payload.version) return;
    if (this.state.saving) return;
    if (this.state.draft !== null) this.publish({ conflict: true });
    else void this.load();
  }

  save(title?: string): Promise<boolean> {
    if (title !== undefined) this.renameTo = title;
    if (this.pending !== null) return this.pending;
    if (this.state.conflict || this.state.payload === null) return Promise.resolve(false);
    // The promise is installed before any callback can request another write.
    this.pending = Promise.resolve().then(() => this.drain());
    return this.pending;
  }

  private async drain(): Promise<boolean> {
    this.publish({ saving: true, failure: undefined });
    try {
      while (this.state.draft !== null || this.renameTo !== undefined) {
        const payload = this.state.payload;
        if (payload === null || this.state.conflict) return false;
        const submitted = this.state.draft;
        const text = submitted ?? payload.content;
        const title = this.renameTo;
        const { manifest } = await api.update(this.where, this.address.id, payload.version, text, title);
        if (this.renameTo === title) this.renameTo = undefined;
        this.accept(manifest, text, this.state.draft === submitted ? null : this.state.draft);
      }
      return true;
    } catch (error) {
      const failure = codeOf(error) ?? 'artifact/storage-failure';
      this.renameTo = undefined;
      this.publish({ failure, conflict: failure === 'artifact/stale-version' });
      return false;
    } finally {
      this.pending = null;
      this.publish({ saving: false });
    }
  }

  private accept(manifest: Manifest, content: string, draft: string | null): void {
    const previous = this.state.payload;
    if (previous === null) return;
    ++this.readSequence;
    this.publish({ payload: { ...previous, manifest, content, version: manifest.version }, draft, conflict: false, loading: false });
    rememberTitle(manifest.id, manifest.title);
    announceVersion(manifest.id, manifest.version);
    announceListChange();
  }
}

export function useEditor(address: ArtifactAddress): { model: EditorModel; state: EditorState } {
  const key = formatArtifactAddress(address);
  const model = useMemo(() => {
    const existing = retained.get(key);
    if (existing !== undefined) return existing;
    const created = new EditorModel(address);
    retained.set(key, created);
    return created;
  }, [key]);
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  useEffect(() => model.attach(), [model]);
  return { model, state };
}
