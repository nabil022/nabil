// SQLite persistence using Node's built-in node:sqlite (no native build step).
//
// One table of JSON documents keyed by (collection, id). The engine keeps
// everything in memory and hands over only what each request changed, inside
// one SQLite transaction, so a crash never leaves half a request on disk.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Change, Persistence } from '../engine';
import { COLLECTION_NAMES, type CollectionName, type Doc } from '../shared/types';

const SCHEMA_VERSION = 1;

export interface SqlitePersistence extends Persistence {
  loadAll(): Partial<Record<CollectionName, Doc[]>>;
  replaceAll(data: Record<CollectionName, Doc[]>): void;
  count(): number;
  close(): void;
}

export function openSqlite(file: string): SqlitePersistence {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(`CREATE TABLE IF NOT EXISTS docs (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (collection, id)
  ) WITHOUT ROWID`);
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version === 0) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  else if (version > SCHEMA_VERSION) throw new Error(`Database was written by a newer Unrot (schema ${version}).`);

  const upsert = db.prepare(
    'INSERT INTO docs (collection, id, data) VALUES (?, ?, ?) ON CONFLICT (collection, id) DO UPDATE SET data = excluded.data',
  );
  const remove = db.prepare('DELETE FROM docs WHERE collection = ? AND id = ?');

  const inTransaction = (fn: () => void) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      fn();
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  return {
    loadAll() {
      const out: Partial<Record<CollectionName, Doc[]>> = {};
      const known = new Set<string>(COLLECTION_NAMES);
      for (const row of db.prepare('SELECT collection, data FROM docs').iterate() as Iterable<{ collection: string; data: string }>) {
        if (!known.has(row.collection)) continue;
        const name = row.collection as CollectionName;
        (out[name] ??= []).push(JSON.parse(row.data) as Doc);
      }
      return out;
    },
    save(changes: Change[]) {
      inTransaction(() => {
        for (const c of changes) {
          if (c.doc) upsert.run(c.collection, c.id, JSON.stringify(c.doc));
          else remove.run(c.collection, c.id);
        }
      });
    },
    replaceAll(data) {
      inTransaction(() => {
        db.exec('DELETE FROM docs');
        for (const name of COLLECTION_NAMES) {
          for (const d of data[name] ?? []) upsert.run(name, d.id, JSON.stringify(d));
        }
      });
    },
    count() {
      return (db.prepare('SELECT COUNT(*) AS n FROM docs').get() as { n: number }).n;
    },
    close() {
      db.close();
    },
  };
}
