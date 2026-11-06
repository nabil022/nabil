// The client talks to one interface. In server mode it is fetch() to the Node
// API; in demo and phone mode it is the very same engine running on the device
// (phone mode is the Android app: your own profile, saved on the phone).

import type { SavedWorld } from './backup';
import { storage } from './storage';

export type { SavedWorld };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type Mode = 'server' | 'demo' | 'phone';

export interface Api {
  readonly mode: Mode;
  readonly token: string | null;
  setToken(token: string | null): void;
  call<T>(method: string, path: string, body?: unknown): Promise<T>;
  /** Demo and phone only: wipe the data on this device (the demo starts over). */
  reset?(): Promise<void>;
  /** Demo and phone only: everything on this device, for a backup. */
  snapshot?(): SavedWorld;
  /** Demo and phone only: replace everything on this device (a checked backup) and save it. */
  restore?(world: SavedWorld): void;
}

const TOKEN_KEY = 'unrot.token';
const SERVER_KEY = 'unrot.server';

/**
 * Where the API lives. The web app uses its own origin (''); the Android app
 * runs from https://localhost on the phone, so it needs the server's address.
 */
export function serverUrl(): string {
  return (storage.get(SERVER_KEY) ?? import.meta.env.VITE_SERVER_URL ?? '').replace(/\/+$/, '');
}

export function setServerUrl(url: string | null): void {
  storage.set(SERVER_KEY, url ? url.trim().replace(/\/+$/, '') : null);
}

/** Normalise what someone typed into an https URL, or null if it can't be one. */
export function normaliseServerUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

export function httpApi(): Api {
  let token = storage.get(TOKEN_KEY);
  const base = serverUrl();
  return {
    mode: 'server',
    get token() {
      return token;
    },
    setToken(t) {
      token = t;
      storage.set(TOKEN_KEY, t);
    },
    async call<T>(method: string, path: string, body?: unknown): Promise<T> {
      let res: Response;
      try {
        res = await fetch(`${base}${path}`, {
          method,
          headers: {
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch {
        throw new ApiError(0, 'offline', 'You seem to be offline. Check your connection and try again.');
      }
      const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
      if (!res.ok) {
        throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? `Something went wrong (${res.status}).`);
      }
      return data as T;
    },
  };
}
