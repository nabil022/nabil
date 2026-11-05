// The Android app's native side: the UsageStats plugin (src: android/app/
// src/main/java/app/unrot/UsageStatsPlugin.java), reminders, and app state.
//
// Tests and screenshots run in a normal browser by injecting
// window.__UNROT_FAKE_NATIVE__ before the app loads; the app then behaves as
// the Android app does, against made-up usage events.

import { Capacitor, registerPlugin } from '@capacitor/core';
import type { EventBatch, PackageInfo } from '../../shared/usage';

export interface UsageStatsPlugin {
  status(): Promise<{ granted: boolean; sdk: number }>;
  openSettings(): Promise<void>;
  queryEvents(options: { start: number; end: number }): Promise<EventBatch>;
  appInfo(options: { packages: string[] }): Promise<Record<string, PackageInfo>>;
}

export interface FakeNative {
  granted: boolean;
  events: EventBatch;
  info: Record<string, PackageInfo>;
}

declare global {
  interface Window {
    __UNROT_FAKE_NATIVE__?: FakeNative;
  }
}

const fake = typeof window !== 'undefined' ? window.__UNROT_FAKE_NATIVE__ : undefined;

/** Running inside the Android app (with the real plugin). */
export const IS_REAL_NATIVE = import.meta.env.VITE_NATIVE === '1' && Capacitor.isNativePlatform();

/** Running as the Android app, real or simulated for tests. */
export const IS_NATIVE = IS_REAL_NATIVE || !!fake;

function fakePlugin(f: FakeNative): UsageStatsPlugin {
  return {
    async status() {
      return { granted: f.granted, sdk: 35 };
    },
    async openSettings() {
      // Simulates the user switching Usage access on and coming back.
      f.granted = true;
      setTimeout(() => document.dispatchEvent(new Event('unrot-resume')), 50);
    },
    async queryEvents({ start, end }) {
      if (!f.granted) throw new Error('Usage access is turned off for Unrot.');
      const events = f.events.events.filter(([t]) => t >= start && t < end);
      return { events, packages: f.events.packages };
    },
    async appInfo({ packages }) {
      return Object.fromEntries(packages.filter((p) => f.info[p]).map((p) => [p, f.info[p]!]));
    },
  };
}

export const UsageStats: UsageStatsPlugin = fake ? fakePlugin(fake) : registerPlugin<UsageStatsPlugin>('UsageStats');

/** Calls `fn` whenever the app comes back to the foreground. Returns an unsubscribe function. */
export function onResume(fn: () => void): () => void {
  const onVisible = () => document.visibilityState === 'visible' && fn();
  document.addEventListener('visibilitychange', onVisible);
  document.addEventListener('unrot-resume', fn);
  let remove: (() => void) | null = null;
  if (IS_REAL_NATIVE) {
    void import('@capacitor/app').then(({ App }) =>
      App.addListener('appStateChange', (s) => s.isActive && fn()).then((h) => {
        remove = () => void h.remove();
      }),
    );
  }
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    document.removeEventListener('unrot-resume', fn);
    remove?.();
  };
}
