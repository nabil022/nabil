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
  setJSON(key: string, value: unknown): boolean {
    try {
      return storage.set(key, JSON.stringify(value));
    } catch {
      return false;
    }
  },
};
