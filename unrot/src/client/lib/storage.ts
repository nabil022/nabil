// localStorage that never throws: private windows, blocked storage and
// sandboxed frames all fall back to "nothing saved".

export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): boolean {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  getJSON<T>(key: string): T | null {
    const raw = storage.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  /** Remove every key starting with `prefix`, except those in `keep`. */
  clearPrefix(prefix: string, keep: readonly string[] = []): void {
    try {
      const ls = window.localStorage;
      const doomed: string[] = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(prefix) && !keep.includes(k)) doomed.push(k);
      }
      for (const k of doomed) ls.removeItem(k);
    } catch {
      // Nothing saved, or storage blocked: nothing to clear.
    }
  },
  setJSON(key: string, value: unknown): boolean {
    try {
      return storage.set(key, JSON.stringify(value));
    } catch {
      return false;
    }
  },
};
