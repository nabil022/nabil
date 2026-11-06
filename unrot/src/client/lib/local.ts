// The engine running on the device, saved in its storage. Nothing leaves it.
//
//   demo:  seeded with five weeks of a made-up you and your friends.
//   phone: the Android app. Starts empty; you set up your own profile.

import { Engine, Store, type EngineCrypto } from '../../engine';
import { seedDemo } from '../../engine/seed';
import { ApiError, type Api, type SavedWorld } from './api';
import { storage } from './storage';

export type LocalKind = 'demo' | 'phone';

export const LOCAL_KEYS: Record<LocalKind, string> = { demo: 'unrot.demo.v1', phone: 'unrot.phone.v1' };

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Not secure, and does not need to be: these accounts never leave this device. */
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

const deviceCrypto: EngineCrypto = {
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

function fromSaved(saved: SavedWorld, localProfiles: boolean): World {
  const store = new Store();
  store.load(saved.data);
  return { engine: new Engine({ store, crypto: deviceCrypto, localProfiles }), store, token: saved.token };
}

function build(kind: LocalKind): World {
  const localProfiles = kind === 'phone';
  const saved = storage.getJSON<SavedWorld>(LOCAL_KEYS[kind]);
  if (saved?.version === 1 && saved.data) {
    try {
      return fromSaved(saved, localProfiles);
    } catch {
      // Corrupt save: fall through to a fresh world.
    }
  }
  if (kind === 'phone') {
    const store = new Store();
    return { engine: new Engine({ store, crypto: deviceCrypto, localProfiles }), store, token: null };
  }
  const seeded = seedDemo({ now: Date.now(), timezone: timezone(), crypto: deviceCrypto });
  return { engine: seeded.engine, store: seeded.store, token: seeded.token };
}

export function localApi(kind: LocalKind = 'demo'): Api {
  let world = build(kind);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const snapshot = (): SavedWorld => ({ version: 1, token: world.token, data: world.store.snapshot() });
  const write = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    storage.setJSON(LOCAL_KEYS[kind], snapshot());
  };
  const save = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(write, 250);
  };
  // Save at once when the app goes to the background, where the phone may close it.
  const flush = () => {
    if (timer) write();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
  save();

  return {
    mode: kind,
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
      if (timer) clearTimeout(timer);
      timer = null;
      storage.set(LOCAL_KEYS[kind], null);
      world = build(kind);
      if (kind === 'demo') write();
    },
    snapshot,
    restore(saved) {
      world = fromSaved(saved, kind === 'phone');
      write();
    },
  };
}
