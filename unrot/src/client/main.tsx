import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppProvider, STANDALONE } from './lib/app';
import { RouterProvider } from './lib/router';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('No #root element');

createRoot(root).render(
  <StrictMode>
    <AppProvider>
      <RouterProvider memory={STANDALONE}>
        <App />
      </RouterProvider>
    </AppProvider>
  </StrictMode>,
);

// Offline support for the installed app. Not in the standalone demo, where the
// host page owns the origin and service workers are not available.
if (!STANDALONE && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline caching is a nice-to-have; the app works without it.
    });
  });
}
