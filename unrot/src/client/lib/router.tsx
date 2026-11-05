// A small router. In the installed app the path lives in the URL hash
// (#/groups/abc) so links and refreshes work with any static host. In the
// sandboxed demo it lives in memory, because the host frame owns the URL.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

interface RouterValue {
  path: string;
  go(path: string, opts?: { replace?: boolean }): void;
  back(fallback?: string): void;
}

const RouterContext = createContext<RouterValue | null>(null);

function readHash(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/';
}

export function RouterProvider({ memory, children }: { memory: boolean; children: ReactNode }) {
  const [path, setPath] = useState(() => (memory ? '/' : readHash()));
  const stack = useRef<string[]>([path]);

  useEffect(() => {
    if (memory) return;
    const onHash = () => {
      const next = readHash();
      const s = stack.current;
      if (s.length > 1 && s[s.length - 2] === next) s.pop();
      else if (s[s.length - 1] !== next) s.push(next);
      setPath(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [memory]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  const go = useCallback(
    (next: string, opts: { replace?: boolean } = {}) => {
      if (memory) {
        const s = stack.current;
        if (opts.replace) s[s.length - 1] = next;
        else s.push(next);
        setPath(next);
        return;
      }
      if (opts.replace) {
        stack.current[stack.current.length - 1] = next;
        window.history.replaceState(null, '', `#${next}`);
        setPath(next);
      } else {
        window.location.hash = next;
      }
    },
    [memory],
  );

  const back = useCallback(
    (fallback = '/') => {
      const s = stack.current;
      if (s.length > 1) {
        if (memory) {
          s.pop();
          setPath(s[s.length - 1]!);
        } else {
          window.history.back();
        }
      } else {
        go(fallback, { replace: true });
      }
    },
    [go, memory],
  );

  const value = useMemo(() => ({ path, go, back }), [path, go, back]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const v = useContext(RouterContext);
  if (!v) throw new Error('useRouter outside RouterProvider');
  return v;
}

/** Match '/groups/:id' against a path; returns params or null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('?')[0]!.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i]!.startsWith(':')) params[p[i]!.slice(1)] = decodeURIComponent(a[i]!);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

export function Link({ to, className, children, ariaLabel }: { to: string; className?: string; children: ReactNode; ariaLabel?: string }) {
  const { go } = useRouter();
  return (
    <a
      href={`#${to}`}
      className={className}
      aria-label={ariaLabel}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        go(to);
      }}
    >
      {children}
    </a>
  );
}
