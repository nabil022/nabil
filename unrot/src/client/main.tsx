import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppProvider, STANDALONE } from './lib/app';
import { IS_NATIVE, IS_REAL_NATIVE, UsageStats } from './lib/native';
import { RouterProvider } from './lib/router';
import { TrackingProvider } from './lib/tracking-context';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('No #root element');

createRoot(root).render(
  <StrictMode>
    <AppProvider>
      <TrackingProvider>
        <RouterProvider memory={STANDALONE}>
          <App />
        </RouterProvider>
      </TrackingProvider>
    </AppProvider>
  </StrictMode>,
);

// Android: one line in logcat proving the native usage reader works on this phone.
if (IS_REAL_NATIVE) {
  void (async () => {
    try {
      const { granted, sdk } = await UsageStats.status();
      let events = -1;
      if (granted) events = (await UsageStats.queryEvents({ start: Date.now() - 86_400_000, end: Date.now() })).events.length;
      console.info(`[unrot] usage access: granted=${granted} sdk=${sdk} events=${events}`);
    } catch (err) {
      console.error(`[unrot] usage access check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();
}

// Offline support for the installed web app. Not in the standalone demo (the
// host page owns the origin) or the Android app (its files are already local).
if (!STANDALONE && !IS_NATIVE && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline caching is a nice-to-have; the app works without it.
    });
  });
}
