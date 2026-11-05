// In-memory document collections with secondary indexes, transactions and a
// persistence hook.
//
// The whole dataset lives in memory; persistence only ever sees the documents
// a transaction touched. That is what lets exactly the same engine run on the
// server (persisting to SQLite) and in the browser demo (persisting to
// localStorage). If a transaction throws, every change it made is rolled back,
// so a failed request never leaves half-applied state behind.

import { COLLECTION_NAMES, type CollectionName, type Collections, type Doc } from '../shared/types';

export interface Change {
  collection: CollectionName;
  id: string;
  /** null = deleted */
  doc: Doc | null;
}

export interface Persistence {
  save(changes: Change[]): void;
}

type KeyFn<T> = (doc: T) => string | null;

/** The untyped view of a collection that the store's journal works with. */
interface AnyCollection {
  readonly name: CollectionName;
  get(id: string): Doc | undefined;
  all(): Doc[];
  set(doc: Doc): void;
  unset(id: string): void;
}

export class Collection<T extends Doc> {
  private readonly map = new Map<string, T>();
  private readonly indexes = new Map<string, { key: KeyFn<T>; buckets: Map<string, Set<string>> }>();

  constructor(
    readonly name: CollectionName,
    private readonly store: Store,
  ) {}

  addIndex(name: string, key: KeyFn<T>): this {
    const buckets = new Map<string, Set<string>>();
    this.indexes.set(name, { key, buckets });
    for (const doc of this.map.values()) this.indexAdd(doc);
    return this;
  }

  get(id: string): T | undefined {
    return this.map.get(id);
  }

  has(id: string): boolean {
    return this.map.has(id);
  }

  get size(): number {
    return this.map.size;
  }

  all(): T[] {
    return [...this.map.values()];
  }

  values(): IterableIterator<T> {
    return this.map.values();
  }

  filter(pred: (doc: T) => boolean): T[] {
    const out: T[] = [];
    for (const d of this.map.values()) if (pred(d)) out.push(d);
    return out;
  }

  find(pred: (doc: T) => boolean): T | undefined {
    for (const d of this.map.values()) if (pred(d)) return d;
    return undefined;
  }

  /** Documents whose index `name` maps to `key`. */
  by(name: string, key: string): T[] {
    const idx = this.indexes.get(name);
    if (!idx) throw new Error(`No index ${this.name}.${name}`);
    const ids = idx.buckets.get(key);
    if (!ids) return [];
    const out: T[] = [];
    for (const id of ids) {
      const d = this.map.get(id);
      if (d) out.push(d);
    }
    return out;
  }

  insert(doc: T): T {
    if (this.map.has(doc.id)) throw new Error(`Duplicate ${this.name}/${doc.id}`);
    this.store.record(this.untyped(), doc.id, undefined);
    this.set(doc);
    return doc;
  }

  put(doc: T): T {
    this.store.record(this.untyped(), doc.id, this.map.get(doc.id));
    this.set(doc);
    return doc;
  }

  update(id: string, patch: Partial<T>): T {
    const cur = this.map.get(id);
    if (!cur) throw new Error(`Missing ${this.name}/${id}`);
    const next = { ...cur, ...patch, id: cur.id } as T;
    this.store.record(this.untyped(), id, cur);
    this.set(next);
    return next;
  }

  delete(id: string): boolean {
    const cur = this.map.get(id);
    if (!cur) return false;
    this.store.record(this.untyped(), id, cur);
    this.unset(id);
    return true;
  }

  private untyped(): AnyCollection {
    return this as unknown as AnyCollection;
  }

  /** @internal Raw write used by load/rollback: no journal, no dirty tracking. */
  set(doc: T): void {
    const prev = this.map.get(doc.id);
    if (prev) this.indexRemove(prev);
    this.map.set(doc.id, doc);
    this.indexAdd(doc);
  }

  /** @internal */
  unset(id: string): void {
    const prev = this.map.get(id);
    if (!prev) return;
    this.indexRemove(prev);
    this.map.delete(id);
  }

  private indexAdd(doc: T): void {
    for (const { key, buckets } of this.indexes.values()) {
      const k = key(doc);
      if (k === null) continue;
      let set = buckets.get(k);
      if (!set) buckets.set(k, (set = new Set()));
      set.add(doc.id);
    }
  }

  private indexRemove(doc: T): void {
    for (const { key, buckets } of this.indexes.values()) {
      const k = key(doc);
      if (k === null) continue;
      const set = buckets.get(k);
      if (!set) continue;
      set.delete(doc.id);
      if (set.size === 0) buckets.delete(k);
    }
  }
}

type Collections_ = { [K in CollectionName]: Collection<Collections[K]> };

interface JournalEntry {
  collection: AnyCollection;
  id: string;
  prev: Doc | undefined;
}

export class Store {
  readonly c: Collections_;
  private journal: JournalEntry[] | null = null;
  private readonly dirty = new Map<string, { collection: CollectionName; id: string; col: AnyCollection }>();

  constructor(private persistence: Persistence | null = null) {
    const c = {} as Record<CollectionName, unknown>;
    for (const name of COLLECTION_NAMES) c[name] = new Collection<Doc>(name, this);
    this.c = c as Collections_;
  }

  setPersistence(p: Persistence | null): void {
    this.persistence = p;
  }

  /** Bulk load without journaling or persisting. */
  load(data: Partial<Record<CollectionName, Doc[]>>): void {
    for (const name of COLLECTION_NAMES) {
      const docs = data[name];
      if (!docs) continue;
      const col = this.c[name] as unknown as AnyCollection;
      for (const d of docs) col.set(d);
    }
  }

  snapshot(): Record<CollectionName, Doc[]> {
    const out = {} as Record<CollectionName, Doc[]>;
    for (const name of COLLECTION_NAMES) out[name] = (this.c[name] as unknown as AnyCollection).all();
    return out;
  }

  /** @internal */
  record(collection: AnyCollection, id: string, prev: Doc | undefined): void {
    if (this.journal) this.journal.push({ collection, id, prev });
    this.dirty.set(`${collection.name}\u0000${id}`, { collection: collection.name, id, col: collection });
  }

  get inTransaction(): boolean {
    return this.journal !== null;
  }

  transaction<R>(fn: () => R): R {
    if (this.journal) return fn();
    this.journal = [];
    try {
      const result = fn();
      this.flush();
      return result;
    } catch (err) {
      const journal = this.journal;
      for (let i = journal.length - 1; i >= 0; i--) {
        const { collection, id, prev } = journal[i]!;
        if (prev === undefined) collection.unset(id);
        else collection.set(prev);
      }
      this.dirty.clear();
      throw err;
    } finally {
      this.journal = null;
    }
  }

  /** Hand every changed document to persistence. */
  flush(): void {
    if (this.dirty.size === 0) return;
    const changes: Change[] = [];
    for (const { collection, id, col } of this.dirty.values()) {
      changes.push({ collection, id, doc: col.get(id) ?? null });
    }
    this.dirty.clear();
    this.persistence?.save(changes);
  }
}
