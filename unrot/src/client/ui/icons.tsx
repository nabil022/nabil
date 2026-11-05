// Line icons, 24×24, drawn for this app. Stroke follows currentColor.

import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  home: <path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z" />,
  groups: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20v-.5A4.5 4.5 0 0 1 7 15h4a4.5 4.5 0 0 1 4.5 4.5v.5" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 15.2a4.5 4.5 0 0 1 3 4.3v.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  bolt: <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" />,
  wallet: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
      <rect x="3.5" y="7.5" width="17" height="12" rx="2.5" />
      <path d="M16 13.5h.5" />
    </>
  ),
  moon: <path d="M20 14.6A8.5 8.5 0 0 1 9.4 4a8.5 8.5 0 1 0 10.6 10.6z" />,
  book: (
    <>
      <path d="M12 6.5c-2-1.5-4.5-2-8-2v13c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-13c-3.5 0-6 .5-8 2z" />
      <path d="M12 6.5v13" />
    </>
  ),
  chart: <path d="M4 20V11M10 20V5M16 20v-7M21.5 20h-19" />,
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H4.5v1.5A3 3 0 0 0 7.5 10.5M16 6h3.5v1.5a3 3 0 0 1-3 3M12 13v4M8.5 20.5h7M9.5 17h5v3.5h-5z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  check: <path d="M5 12.5 10 17.5 19 7" />,
  back: <path d="M15 18.5 8.5 12 15 5.5" />,
  next: <path d="M9 5.5 15.5 12 9 18.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  flame: <path d="M12 3c.8 3.2 5 5.4 5 10.2a5 5 0 0 1-10 0c0-2.2 1-3.7 2.2-4.7.1 1.9 1 3 2 3.2C11.3 9 10.6 6.4 12 3z" />,
  steps: (
    <>
      <path d="M7.5 3.5c-1.7 0-2.8 2-2.8 4.4 0 1.8.7 3.1 1.6 3.6h2.6c.9-.5 1.4-1.8 1.4-3.6 0-2.4-1.1-4.4-2.8-4.4zM6.3 13.5h2.9v1.3a1.45 1.45 0 0 1-2.9 0z" />
      <path d="M16.5 8.5c1.7 0 2.8 2 2.8 4.4 0 1.8-.7 3.1-1.6 3.6h-2.6c-.9-.5-1.4-1.8-1.4-3.6 0-2.4 1.1-4.4 2.8-4.4zM14.8 18.5h2.9v1.3a1.45 1.45 0 0 1-2.9 0z" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.5.8-2.5 1.9 0 2.6 5 1.4 5 4.1 0 1.1-1 2-2.5 2-1.2 0-2.1-.5-2.6-1.3M12 6.5V8M12 16v1.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  share: <path d="M12 3.5v12M7.5 8 12 3.5 16.5 8M5 13.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-5.5" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
      <path d="M15.5 5.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.6v.4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  sparkle: <path d="M12 3.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5zM18.5 15.5c.2 1.5.8 2.1 2.3 2.3-1.5.2-2.1.8-2.3 2.3-.2-1.5-.8-2.1-2.3-2.3 1.5-.2 2.1-.8 2.3-2.3z" />,
  logout: <path d="M14 4.5H6.5a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5H14M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5" />,
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12M10 11v5.5M14 11v5.5" />,
  edit: <path d="M14.5 5.5l4 4M4 20l1-4.5L15.8 4.7a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L8.5 19z" />,
  bell: <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0" />,
  phoneOff: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M11 17.5h2M3.5 3.5l17 17" />
    </>
  ),
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  calculator: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M8.5 7h7M8.5 11.5h.5M12 11.5h.5M15.5 11.5h.5M8.5 15h.5M12 15h.5M15.5 15v2.5M8.5 18h.5M12 18h.5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r=".8" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5S14.3 18.1 12 20.5C9.7 18.1 8.6 15.3 8.6 12S9.7 5.9 12 3.5z" />
    </>
  ),
  download: <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />,
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  table: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" />
    </>
  ),
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, label, className }: { name: IconName; size?: number; label?: string; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** The Unrot mark: a brain built from overlapping lobes, with one fold down the middle. */
export function BrainMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <g fill="var(--brand)">
        <circle cx="22" cy="22" r="12" />
        <circle cx="16" cy="34" r="10" />
        <circle cx="25" cy="43" r="10" />
        <circle cx="30" cy="20" r="9" />
        <circle cx="42" cy="22" r="12" />
        <circle cx="48" cy="34" r="10" />
        <circle cx="39" cy="43" r="10" />
        <circle cx="34" cy="20" r="9" />
        <circle cx="32" cy="33" r="13" />
      </g>
      <path
        d="M32 13.5v38M23.5 15.5c-3.2 1.4-4.3 4.2-3.3 7.4M13.5 29.5c3.3-1.2 6.2.4 6.8 3.8M20 45.5c.8-3.1 3.6-4.6 6.6-3.7M40.5 15.5c3.2 1.4 4.3 4.2 3.3 7.4M50.5 29.5c-3.3-1.2-6.2.4-6.8 3.8M44 45.5c-.8-3.1-3.6-4.6-6.6-3.7"
        fill="none"
        stroke="var(--brand-ink)"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity=".85"
      />
    </svg>
  );
}
