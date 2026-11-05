// The building blocks every screen is made of.

import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { avatarColor } from '../../shared/profile';
import { useApp } from '../lib/app';
import { useRouter } from '../lib/router';
import { Icon, type IconName } from './icons';

export function cx(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(' ');
}

// -- page structure -------------------------------------------------------------

export function Screen({
  title,
  back,
  action,
  children,
  wide,
}: {
  title: ReactNode;
  back?: string | true;
  action?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const router = useRouter();
  return (
    <div className={cx('screen', wide && 'screen-wide')}>
      <header className="topbar">
        <div className="topbar-inner">
          {back ? (
            <button className="icon-btn" onClick={() => router.back(back === true ? '/' : back)} aria-label="Back">
              <Icon name="back" />
            </button>
          ) : null}
          <h1 className="topbar-title">{title}</h1>
          <div className="topbar-action">{action}</div>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

export function Section({ title, action, children, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="section" aria-labelledby={id}>
      {title ? (
        <div className="section-head">
          <h2 className="section-title" id={id}>
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Card({
  children,
  className,
  onClick,
  tone,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  tone?: 'brand' | 'night' | 'fresh' | 'gold' | 'rot' | 'warn';
  as?: 'div' | 'button';
}) {
  const cls = cx('card', tone && `card-${tone}`, onClick && 'card-link', className);
  if (onClick || as === 'button') {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {children}
      </button>
    );
  }
  return <div className={cls}>{children}</div>;
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('row', className)}>{children}</div>;
}

export function Stack({ children, gap = 12, className }: { children: ReactNode; gap?: number; className?: string }) {
  return (
    <div className={cx('stack', className)} style={{ gap }}>
      {children}
    </div>
  );
}

// -- controls ---------------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  block?: boolean;
  busy?: boolean;
};

export function Button({ variant = 'primary', size = 'md', icon, block, busy, children, className, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('btn', `btn-${variant}`, `btn-${size}`, block && 'btn-block', className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <span className="spinner" aria-hidden /> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 20} /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function IconButton({ icon, label, onClick, className }: { icon: IconName; label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" className={cx('icon-btn', className)} onClick={onClick} aria-label={label} title={label}>
      <Icon name={icon} />
    </button>
  );
}

export function Chip({
  selected,
  onClick,
  children,
  disabled,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={cx('chip', selected && 'chip-on')} aria-pressed={selected} onClick={onClick} disabled={disabled}>
      {selected ? <Icon name="check" size={14} /> : null}
      {children}
    </button>
  );
}

export type Tone = 'neutral' | 'brand' | 'fresh' | 'warn' | 'rot' | 'night' | 'gold' | 'danger';

export function Pill({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={cx('pill', `pill-${tone}`)}>
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={cx('seg', value === o.value && 'seg-on')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <p className="field-error">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function Toggle({ checked, onChange, label, detail, id }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; detail?: ReactNode; id: string }) {
  return (
    <label className="toggle" htmlFor={id}>
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {detail ? <span className="toggle-detail">{detail}</span> : null}
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden>
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}

/** Minutes, entered as hours and minutes with ± buttons. */
export function MinutesInput({
  value,
  onChange,
  step = 5,
  max = 24 * 60,
  label,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  max?: number;
  label: string;
  id: string;
}) {
  const h = Math.floor(value / 60);
  const m = value % 60;
  const set = (v: number) => onChange(Math.max(0, Math.min(max, Math.round(v))));
  return (
    <div className="minutes-input" role="group" aria-label={label}>
      <button type="button" className="step-btn" onClick={() => set(value - step)} aria-label={`${label}: ${step} minutes less`} disabled={value <= 0}>
        −
      </button>
      <div className="minutes-fields">
        <input
          id={`${id}-h`}
          inputMode="numeric"
          aria-label={`${label}, hours`}
          value={String(h)}
          onChange={(e) => set(Number(e.target.value.replace(/\D/g, '') || 0) * 60 + m)}
          onFocus={(e) => e.target.select()}
        />
        <span aria-hidden>h</span>
        <input
          id={`${id}-m`}
          inputMode="numeric"
          aria-label={`${label}, minutes`}
          value={String(m).padStart(2, '0')}
          onChange={(e) => set(h * 60 + Math.min(59, Number(e.target.value.replace(/\D/g, '').slice(-2) || 0)))}
          onFocus={(e) => e.target.select()}
        />
        <span aria-hidden>m</span>
      </div>
      <button type="button" className="step-btn" onClick={() => set(value + step)} aria-label={`${label}: ${step} minutes more`} disabled={value >= max}>
        +
      </button>
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  step,
  min,
  max,
  format,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  format: (v: number) => string;
  label: string;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="step-btn" onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min} aria-label={`Less ${label}`}>
        −
      </button>
      <output className="stepper-value" aria-live="polite">
        {format(value)}
      </output>
      <button type="button" className="step-btn" onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max} aria-label={`More ${label}`}>
        +
      </button>
    </div>
  );
}

export function Likert({
  value,
  onChange,
  low,
  high,
  label,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  low: string;
  high: string;
  label: string;
}) {
  return (
    <div className="likert">
      <div className="likert-scale" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${label}: ${n} of 5`}
            className={cx('likert-dot', value === n && 'likert-on')}
            onClick={() => onChange(value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="likert-ends" aria-hidden>
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

// -- display ------------------------------------------------------------------------

export function Avatar({ emoji, color, size = 36 }: { emoji: string; color: number; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, background: avatarColor(color), fontSize: size * 0.55 }} aria-hidden>
      {emoji}
    </span>
  );
}

export function Meter({ value, max, tone = 'brand', label }: { value: number; max: number; tone?: Tone; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cx('meter', `meter-${tone}`)} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <span className="meter-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={cx('stat-value', tone && `ink-${tone}`)}>{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden />
      <span>{label}…</span>
    </div>
  );
}

export function ErrorNote({ error, retry }: { error: { message: string }; retry?: () => void }) {
  return (
    <div className="error-note" role="alert">
      <Icon name="info" />
      <p>{error.message}</p>
      {retry ? (
        <Button variant="secondary" size="sm" onClick={retry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function KV({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="kv">
      <span className="kv-k">{k}</span>
      <span className="kv-v">{v}</span>
    </div>
  );
}

// -- overlays ---------------------------------------------------------------------

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({
  open,
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<unknown> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="confirm-body">{children}</div>
      <div className="sheet-actions">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
            }
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={cx('toast', `toast-${t.tone}`)}>
          <Icon name={t.tone === 'bad' ? 'info' : t.tone === 'good' ? 'check' : 'sparkle'} size={18} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Copies text; falls back to selecting it where the clipboard is refused. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const { toast } = useApp();
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={done ? 'check' : 'copy'}
      onClick={() => {
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setDone(true);
            toast('Copied', 'good');
            setTimeout(() => setDone(false), 1800);
          })
          .catch(() => toast('Copy did not work here. Select the text and copy it by hand.', 'bad'));
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  );
}
