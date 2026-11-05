// App-wide state: which backend, who is logged in, a refresh counter that
// re-runs every query after a change, toasts, and the theme.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Me } from '../../engine/ops/account';
import { ApiError, httpApi, setServerUrl, type Api } from './api';
import { storage } from './storage';

export const STANDALONE = import.meta.env.VITE_STANDALONE === '1';
const MODE_KEY = 'unrot.mode';
const THEME_KEY = 'unrot.theme';

export type Theme = 'system' | 'light' | 'dark';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
}

interface AppValue {
  api: Api;
  me: Me | null;
  ready: boolean;
  version: number;
  /** Re-run every query (after any change). */
  refresh(): void;
  setMe(me: Me | null): void;
  signIn(token: string, me: Me): void;
  signOut(): Promise<void>;
  startDemo(): Promise<void>;
  exitDemo(): void;
  /** Android app: point at a server (after checking it answers) and reconnect. */
  connectServer(url: string | null): Promise<void>;
  resetDemo(): Promise<void>;
  toast(text: string, tone?: Toast['tone']): void;
  toasts: Toast[];
  theme: Theme;
  setTheme(t: Theme): void;
  /** Run a change, refresh on success, toast the error on failure. Returns undefined on failure. */
  mutate<T>(method: string, path: string, body?: unknown, okText?: string): Promise<T | undefined>;
}

const AppContext = createContext<AppValue | null>(null);

async function makeApi(mode: 'server' | 'demo'): Promise<Api> {
  if (mode === 'demo') {
    const { localApi } = await import('./local');
    return localApi();
  }
  return httpApi();
}

function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<Api | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setThemeState] = useState<Theme>(() => (storage.get(THEME_KEY) as Theme) || 'system');
  const toastId = useRef(0);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const loadMe = useCallback(async (a: Api) => {
    if (!a.token) {
      setMe(null);
      return;
    }
    try {
      setMe(await a.call<Me>('GET', '/api/me'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        a.setToken(null);
        setMe(null);
      } else {
        throw err;
      }
    }
  }, []);

  const boot = useCallback(
    async (mode: 'server' | 'demo') => {
      setReady(false);
      const a = await makeApi(mode);
      setApi(a);
      try {
        await loadMe(a);
      } catch {
        // Offline with a saved session: keep going; screens show their own errors.
      }
      setReady(true);
    },
    [loadMe],
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const mode = STANDALONE || storage.get(MODE_KEY) === 'demo' ? 'demo' : 'server';
    void boot(mode);
  }, [boot]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const value = useMemo<AppValue | null>(() => {
    if (!api) return null;
    return {
      api,
      me,
      ready,
      version,
      refresh,
      setMe,
      signIn(token, m) {
        api.setToken(token);
        setMe(m);
        refresh();
      },
      async signOut() {
        try {
          await api.call('POST', '/api/auth/logout');
        } catch {
          // Already gone server-side; forget it locally either way.
        }
        api.setToken(null);
        setMe(null);
        refresh();
      },
      async startDemo() {
        storage.set(MODE_KEY, 'demo');
        await boot('demo');
      },
      exitDemo() {
        storage.set(MODE_KEY, null);
        void boot('server');
      },
      async connectServer(url) {
        if (url) {
          const res = await fetch(`${url}/api/info`).catch(() => null);
          const info = res && res.ok ? ((await res.json().catch(() => null)) as { name?: string } | null) : null;
          if (info?.name !== 'Unrot') throw new Error('No Unrot server answered at that address. Check it and your connection.');
        }
        api.setToken(null);
        setServerUrl(url);
        storage.set(MODE_KEY, null);
        await boot('server');
      },
      async resetDemo() {
        await api.reset?.();
        await loadMe(api);
        refresh();
      },
      toast,
      toasts,
      theme,
      setTheme(t) {
        storage.set(THEME_KEY, t === 'system' ? null : t);
        setThemeState(t);
      },
      async mutate<T>(method: string, path: string, body?: unknown, okText?: string) {
        try {
          const out = await api.call<T>(method, path, body);
          if (okText) toast(okText, 'good');
          if (api.token) {
            try {
              setMe(await api.call<Me>('GET', '/api/me'));
            } catch {
              // ignore; the next refresh will try again
            }
          }
          refresh();
          return out;
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Something went wrong.', 'bad');
          if (err instanceof ApiError && err.status === 401) {
            api.setToken(null);
            setMe(null);
          }
          return undefined;
        }
      },
    };
  }, [api, me, ready, version, refresh, toast, toasts, theme, boot, loadMe]);

  if (!value) return null;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

export interface Query<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  reload(): void;
}

/** Fetch `path`, and again whenever anything changes. Keeps old data while reloading. */
export function useQuery<T>(path: string | null): Query<T> {
  const { api, version } = useApp();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) return;
    let live = true;
    setLoading(true);
    api
      .call<T>('GET', path)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!live) return;
        setError(e instanceof ApiError ? e : new ApiError(0, 'error', String(e)));
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [api, path, version, nonce]);

  return { data, error, loading, reload: () => setNonce((n) => n + 1) };
}
