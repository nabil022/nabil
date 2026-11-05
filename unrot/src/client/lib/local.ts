// Demo mode: the real engine, seeded with five weeks of you and your friends,
// running entirely in this browser. Nothing leaves the device.

import { Engine, Store, type EngineCrypto } from '../../engine';
import { seedDemo } from '../../engine/seed';
import type { CollectionName, Doc } from '../../shared/types';
import { ApiError, type Api } from './api';
import { storage } from './storage';

const KEY = 'unrot.demo.v1';

interface Saved {
  version: 1;
  token: string | null;
  data: Record<CollectionName, Doc[]>;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Not secure, and does not need to be: demo accounts never leave this device. */
function weakHash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

const demoCrypto: EngineCrypto = {
  hashPassword: (pw) => `demo$${weakHash(`unrot:${pw}`)}`,
  verifyPassword: (pw, stored) => stored === `demo$${weakHash(`unrot:${pw}`)}`,
  hashToken: (t) => weakHash(t),
  randomHex,
};

function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

interface World {
  engine: Engine;
  store: Store;
  token: string | null;
}

function build(): World {
  const saved = storage.getJSON<Saved>(KEY);
  if (saved?.version === 1 && saved.data) {
    try {
      const store = new Store();
      store.load(saved.data);
      return { engine: new Engine({ store, crypto: demoCrypto }), store, token: saved.token };
    } catch {
      // Corrupt save: fall through to a fresh world.
    }
  }
  const seeded = seedDemo({ now: Date.now(), timezone: timezone(), crypto: demoCrypto });
  return { engine: seeded.engine, store: seeded.store, token: seeded.token };
}

export function localApi(): Api {
  let world = build();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const save = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      storage.setJSON(KEY, { version: 1, token: world.token, data: world.store.snapshot() } satisfies Saved);
    }, 250);
  };
  save();

  return {
    mode: 'demo',
    get token() {
      return world.token;
    },
    setToken(t) {
      world.token = t;
      save();
    },
    async call<T>(method: string, fullPath: string, body?: unknown): Promise<T> {
      const [path, qs] = fullPath.split('?');
      const res = world.engine.handle({
        method,
        path: path!,
        query: Object.fromEntries(new URLSearchParams(qs ?? '')),
        body,
        token: world.token ?? undefined,
      });
      save();
      if (res.status !== 200) {
        const e = (res.body as { error?: { code: string; message: string } }).error;
        throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? 'Something went wrong.');
      }
      // Hand back a copy so screens can never mutate engine state by accident.
      return structuredClone(res.body) as T;
    },
    async reset() {
      storage.set(KEY, null);
      world = build();
      save();
    },
  };
}
