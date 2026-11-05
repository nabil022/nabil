// Keeps phone-measured screen time flowing: on start and every time the app
// comes back to the front, it checks Usage access, saves yesterday (once per
// change), and measures today so far.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Me } from '../../engine/ops/account';
import { addDays } from '../../shared/dates';
import type { DayUsage } from '../../shared/usage';
import { useApp } from './app';
import { IS_NATIVE, UsageStats, onResume } from './native';
import { storage } from './storage';
import { hasData, measure, usageBody } from './tracking';

export interface TrackingState {
  /** Running as the Android app. */
  supported: boolean;
  /** Usage access is on; null until checked. */
  granted: boolean | null;
  syncing: boolean;
  /** Today so far, measured on the phone (not saved until tomorrow). */
  today: DayUsage | null;
  /** The last finished day sent to the server. */
  lastSync: { at: number; date: string } | null;
  error: string | null;
}

interface TrackingValue {
  state: TrackingState;
  /** Check access, save yesterday, measure today. `force` skips the one-minute throttle. */
  refresh(force?: boolean): Promise<void>;
  /** Open Android's Usage access screen; tracking resumes when the person comes back. */
  enable(): Promise<void>;
}

const TrackingContext = createContext<TrackingValue | null>(null);

const signature = (d: DayUsage) => JSON.stringify([d.apps, d.lateNightMin]);

export function TrackingProvider({ children }: { children: ReactNode }) {
  const { api, me, setMe, refresh: refreshQueries } = useApp();
  const [state, setState] = useState<TrackingState>({
    supported: IS_NATIVE,
    granted: null,
    syncing: false,
    today: null,
    lastSync: null,
    error: null,
  });
  const busy = useRef(false);
  const lastRun = useRef(0);
  const grantedRef = useRef<boolean | null>(null);
  const lastSyncRef = useRef<TrackingState['lastSync']>(null);
  const ready = !!me?.onboarded;
  // Read through a ref so `refresh` keeps one identity (no effect loops).
  const deps = useRef({ api, setMe, refreshQueries });
  deps.current = { api, setMe, refreshQueries };

  const refresh = useCallback(
    async (force = false) => {
      const { api, setMe, refreshQueries } = deps.current;
      if (!IS_NATIVE || !ready || busy.current) return;
      busy.current = true;
      try {
        // Always re-check access: people come back from the Usage access screen.
        const { granted } = await UsageStats.status();
        const justGranted = granted && grantedRef.current !== true;
        grantedRef.current = granted;
        if (!granted) {
          setState((s) => ({ ...s, granted: false, syncing: false, today: null }));
          return;
        }
        // Reading a day of events is the expensive part; do it at most once a minute.
        if (!force && !justGranted && Date.now() - lastRun.current < 60_000) return;
        lastRun.current = Date.now();
        setState((s) => ({ ...s, granted: true, syncing: true }));
        // The server knows "today" in this person's time zone.
        const fresh = await api.call<Me>('GET', '/api/me');
        const yesterday = addDays(fresh.today, -1);
        const [yDay, tDay] = await measure(fresh, [yesterday, fresh.today]);
        const key = `unrot.synced.${api.mode}.${fresh.id}.${yesterday}`;
        if (yDay && hasData(yDay)) {
          if (force || storage.get(key) !== signature(yDay)) {
            await api.call('PUT', `/api/logs/${yesterday}/usage`, usageBody(yDay));
            storage.set(key, signature(yDay));
            setMe(await api.call<Me>('GET', '/api/me'));
            refreshQueries();
          }
          lastSyncRef.current = { at: Date.now(), date: yesterday };
        }
        setState({ supported: true, granted: true, syncing: false, today: tDay ?? null, lastSync: lastSyncRef.current, error: null });
      } catch (err) {
        setState((s) => ({ ...s, syncing: false, error: err instanceof Error ? err.message : 'Could not read screen time.' }));
      } finally {
        busy.current = false;
      }
    },
    [ready],
  );

  useEffect(() => {
    if (ready) void refresh(true);
  }, [ready, me?.id, api, refresh]);

  useEffect(() => onResume(() => void refresh(false)), [refresh]);

  const value = useMemo<TrackingValue>(
    () => ({
      state,
      refresh,
      async enable() {
        await UsageStats.openSettings();
      },
    }),
    [state, refresh],
  );
  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>;
}

export function useTracking(): TrackingValue {
  const v = useContext(TrackingContext);
  if (!v) throw new Error('useTracking outside TrackingProvider');
  return v;
}
