// Charts, drawn as plain SVG. One hue per chart (the --viz token), hairline
// grids, thin bars with rounded data-ends, and a tooltip on hover, tap or
// keyboard focus. Every value a tooltip shows is also printed somewhere else
// on the screen or in a table view.

import { useState, type ReactNode } from 'react';
import { dayName, shortDate, type ISODate } from '../../shared/dates';
import { fmtMin } from '../../shared/format';
import { cx, type Tone } from './kit';

// -- shared bits -------------------------------------------------------------------

function useActive() {
  const [active, setActive] = useState<number | null>(null);
  const bind = (i: number) => ({
    tabIndex: 0,
    onPointerEnter: () => setActive(i),
    onPointerLeave: () => setActive((a) => (a === i ? null : a)),
    onClick: () => setActive((a) => (a === i ? null : i)),
    onFocus: () => setActive(i),
    onBlur: () => setActive((a) => (a === i ? null : a)),
  });
  return { active, bind };
}

function Tip({ x, children, width }: { x: number; children: ReactNode; width: number }) {
  // x is in viewBox units; position as a percentage so it tracks the SVG's scaling.
  const left = Math.max(12, Math.min(88, (x / width) * 100));
  return (
    <div className="chart-tip" style={{ left: `${left}%` }} role="status">
      {children}
    </div>
  );
}

/** Column path with a 4px rounded top and a square base. */
function column(x: number, w: number, base: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  const top = base - h;
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
}

/** Bar path with a 4px rounded right end and a square left. */
function bar(x: number, y: number, w: number, h: number): string {
  if (w <= 0) return '';
  const r = Math.min(4, h / 2, w);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

function niceMax(v: number, step: number): number {
  return Math.max(step, Math.ceil(v / step) * step);
}

// -- the rot meter -------------------------------------------------------------------

/** A half-dial: brain rot per day against your goal and your normal. */
export function RotMeter({ value, goal, normal, caption }: { value: number; goal: number; normal: number; caption: string }) {
  const max = Math.max(normal * 1.25, value * 1.08, 60);
  const tone = value <= goal ? 'fresh' : value <= normal ? 'warn' : 'rot';
  const cxy = 100;
  const r = 82;
  const point = (frac: number) => {
    const a = Math.PI * (1 - Math.max(0, Math.min(1, frac)));
    return [cxy + r * Math.cos(a), 100 - r * Math.sin(a)] as const;
  };
  const arc = (from: number, to: number) => {
    const [x0, y0] = point(from);
    const [x1, y1] = point(to);
    return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
  };
  const tick = (frac: number) => {
    const a = Math.PI * (1 - frac);
    const inner = r - 13;
    const outer = r + 13;
    return `M${cxy + inner * Math.cos(a)},${100 - inner * Math.sin(a)}L${cxy + outer * Math.cos(a)},${100 - outer * Math.sin(a)}`;
  };
  return (
    <figure className="rot-meter" aria-label={`${caption}: ${fmtMin(value)} a day. Goal ${fmtMin(goal)}, normal ${fmtMin(normal)}.`}>
      <svg viewBox="0 0 200 112" role="img" aria-hidden>
        <path d={arc(0, 1)} className={`dial-track dial-${tone}`} />
        {value > 0 ? <path d={arc(0, value / max)} className={`dial-fill dial-${tone}`} /> : null}
        {goal > 0 ? <path d={tick(goal / max)} className="dial-tick" /> : null}
        {normal > 0 ? <path d={tick(normal / max)} className="dial-tick dial-tick-strong" /> : null}
      </svg>
      <figcaption className="rot-meter-center">
        <span className="hero-number">{fmtMin(value)}</span>
        <span className="rot-meter-caption">{caption}</span>
      </figcaption>
      <div className="rot-meter-keys" aria-hidden>
        <span>
          <i className="key-tick" /> Goal {fmtMin(goal)}
        </span>
        <span>
          <i className="key-tick key-tick-strong" /> Normal {fmtMin(normal)}
        </span>
      </div>
    </figure>
  );
}

// -- this week -------------------------------------------------------------------------

export interface WeekPoint {
  date: ISODate;
  net: number | null;
  raw: number | null;
  credit: number;
  logged: boolean;
}

/** Seven columns, Monday to Sunday. Unlogged past days show the baseline they count as. */
export function WeekBars({ days, normal, today }: { days: WeekPoint[]; normal: number; today: ISODate }) {
  const W = 320;
  const H = 150;
  const top = 18;
  const base = 124;
  const plotH = base - top;
  const max = niceMax(Math.max(normal, ...days.map((d) => d.net ?? 0)) * 1.08, 60);
  const slot = W / 7;
  const bw = Math.min(24, slot * 0.5);
  const y = (v: number) => base - (v / max) * plotH;
  const { active, bind } = useActive();
  const lastLogged = [...days].reverse().find((d) => d.logged);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" aria-label="Brain rot per day this week">
        <line x1={0} x2={W} y1={base} y2={base} className="axis" />
        {normal > 0 ? (
          <>
            <line x1={0} x2={W - 52} y1={y(normal)} y2={y(normal)} className="ref-line" />
            <text x={W} y={y(normal) + 4} textAnchor="end" className="ref-label">
              normal
            </text>
          </>
        ) : null}
        {days.map((d, i) => {
          const x = i * slot + (slot - bw) / 2;
          const isFuture = d.date > today;
          const v = d.net ?? 0;
          const h = isFuture ? 0 : (v / max) * plotH;
          const label = isFuture
            ? `${shortDate(d.date)}: still to come`
            : d.logged
              ? `${shortDate(d.date)}: ${fmtMin(v)}`
              : d.date === today
                ? `${shortDate(d.date)}: not logged yet`
                : `${shortDate(d.date)}: not logged, counts as your normal ${fmtMin(normal)}`;
          return (
            <g key={d.date} className={cx('mark', active === i && 'mark-on')} {...bind(i)} role="img" aria-label={label}>
              <rect x={i * slot} y={top - 10} width={slot} height={base - top + 30} className="hit" />
              {h > 0 ? <path d={column(x, bw, base, h)} className={d.logged ? 'col' : 'col-assumed'} /> : null}
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" className={cx('tick-label', d.date === today && 'tick-today')}>
                {dayName(d.date).slice(0, 1)}
              </text>
            </g>
          );
        })}
        {lastLogged && lastLogged.net !== null ? (
          <text
            x={days.indexOf(lastLogged) * slot + slot / 2}
            y={Math.max(12, y(lastLogged.net) - 6)}
            textAnchor="middle"
            className="value-label"
          >
            {fmtMin(lastLogged.net)}
          </text>
        ) : null}
      </svg>
      {active !== null && days[active] && days[active]!.date <= today ? (
        <Tip x={active * slot + slot / 2} width={W}>
          <strong>{days[active]!.logged ? fmtMin(days[active]!.net ?? 0) : 'Not logged'}</strong>
          <span>
            {shortDate(days[active]!.date)}
            {days[active]!.logged && days[active]!.credit > 0
              ? ` · ${fmtMin(days[active]!.raw ?? 0)} minus ${fmtMin(days[active]!.credit)} bonus`
              : !days[active]!.logged && days[active]!.date !== today
                ? ` · counts as ${fmtMin(normal)}`
                : ''}
          </span>
        </Tip>
      ) : null}
    </div>
  );
}

// -- many days ---------------------------------------------------------------------------

export function DayBars({ days, normal }: { days: { date: ISODate; net: number | null; raw: number | null; credit: number }[]; normal: number }) {
  const W = 340;
  const H = 170;
  const top = 14;
  const base = 140;
  const left = 34;
  const plotW = W - left;
  const plotH = base - top;
  const max = niceMax(Math.max(normal, ...days.map((d) => d.raw ?? 0)) * 1.05, 60);
  const slot = plotW / days.length;
  const bw = Math.max(2, Math.min(24, slot - 2));
  const y = (v: number) => base - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const { active, bind } = useActive();
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" aria-label="Brain rot per day">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
            <text x={left - 6} y={y(t) + 4} textAnchor="end" className="tick-label tabular">
              {`${Math.round(t / 60)}h`}
            </text>
          </g>
        ))}
        {normal > 0 ? <line x1={left} x2={W} y1={y(normal)} y2={y(normal)} className="ref-line" /> : null}
        {days.map((d, i) => {
          const x = left + i * slot + (slot - bw) / 2;
          const showTick = days.length <= 14 || i % 7 === 0;
          return (
            <g key={d.date} className={cx('mark', active === i && 'mark-on')} {...bind(i)} role="img" aria-label={`${shortDate(d.date)}: ${d.net === null ? 'not logged' : fmtMin(d.net)}`}>
              <rect x={left + i * slot} y={top} width={slot} height={base - top} className="hit" />
              {d.net !== null ? <path d={column(x, bw, base, (d.net / max) * plotH)} className="col" /> : null}
              {showTick ? (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="tick-label">
                  {days.length <= 7 ? dayName(d.date).slice(0, 1) : `${Number(d.date.slice(8))}/${Number(d.date.slice(5, 7))}`}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {active !== null && days[active] ? (
        <Tip x={left + active * slot + slot / 2} width={W}>
          <strong>{days[active]!.net === null ? 'Not logged' : fmtMin(days[active]!.net!)}</strong>
          <span>
            {shortDate(days[active]!.date)}
            {days[active]!.credit > 0 ? ` · ${fmtMin(days[active]!.raw ?? 0)} minus ${fmtMin(days[active]!.credit)} bonus` : ''}
          </span>
        </Tip>
      ) : null}
      <p className="chart-note">
        <i className="key-line" aria-hidden /> Line: your normal, {fmtMin(normal)} a day
      </p>
    </div>
  );
}

// -- ranked horizontal bars --------------------------------------------------------------

export function HBars({ items, format }: { items: { label: string; value: number }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="hbars">
      {items.map((it) => (
        <div key={it.label} className="hbar-row">
          <span className="hbar-label">{it.label}</span>
          <span className="hbar-track">
            <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden>
              <path d={bar(0, 0, (it.value / max) * 100, 12)} className="col" />
            </svg>
          </span>
          <span className="hbar-value tabular">{format(it.value)}</span>
        </div>
      ))}
    </div>
  );
}

// -- distribution with you in it -------------------------------------------------------------

export function Histogram({ bins, you, label }: { bins: number[]; you: number; label: string }) {
  const W = 320;
  const H = 130;
  const top = 22;
  const base = 104;
  const slot = W / bins.length;
  const bw = Math.min(24, slot - 4);
  const max = Math.max(...bins, 0.0001);
  const youBin = Math.min(bins.length - 1, Math.max(0, Math.floor(you / 10)));
  const { active, bind } = useActive();
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" aria-label={label}>
        <line x1={0} x2={W} y1={base} y2={base} className="axis" />
        {bins.map((b, i) => {
          const x = i * slot + (slot - bw) / 2;
          const h = (b / max) * (base - top);
          return (
            <g key={i} className={cx('mark', active === i && 'mark-on')} {...bind(i)} role="img" aria-label={`Scores ${i * 10} to ${i * 10 + 9}: ${Math.round(b * 100)}% of people`}>
              <rect x={i * slot} y={0} width={slot} height={base} className="hit" />
              <path d={column(x, bw, base, Math.max(h, b > 0 ? 2 : 0))} className={i === youBin ? 'col' : 'col-muted'} />
            </g>
          );
        })}
        <text x={youBin * slot + slot / 2} y={top - 8} textAnchor="middle" className="value-label">
          You
        </text>
        {[0, 50, 100].map((t) => (
          <text key={t} x={t === 100 ? W : t === 0 ? 0 : W / 2} y={H - 6} textAnchor={t === 0 ? 'start' : t === 100 ? 'end' : 'middle'} className="tick-label tabular">
            {t}%
          </text>
        ))}
      </svg>
      {active !== null ? (
        <Tip x={active * slot + slot / 2} width={W}>
          <strong>{Math.round(bins[active]! * 100)}% of people</strong>
          <span>
            scored {active * 10}-{active * 10 + 9}
            {active === youBin ? ' (you)' : ''}
          </span>
        </Tip>
      ) : null}
    </div>
  );
}

// -- small trend line ---------------------------------------------------------------------------

export function Spark({ values, labels, format }: { values: (number | null)[]; labels: string[]; format: (v: number) => string }) {
  const W = 320;
  const H = 86;
  const pad = 10;
  const right = 46;
  const top = 12;
  const base = 62;
  const n = values.length;
  const known = values.filter((v): v is number => v !== null);
  // Zoom to the data (at least a 20-point window) so week-to-week change is visible.
  const lo = Math.max(0, Math.floor(((known.length ? Math.min(...known) : 0) - 5) / 10) * 10);
  const hi = Math.min(100, Math.max(lo + 20, Math.ceil(((known.length ? Math.max(...known) : 100) + 5) / 10) * 10));
  const x = (i: number) => pad + (i * (W - pad - right)) / Math.max(1, n - 1);
  const y = (v: number) => base - ((v - lo) / (hi - lo)) * (base - top);
  let d = '';
  values.forEach((v, i) => {
    if (v === null) return;
    const prev = i > 0 ? values[i - 1] : null;
    d += `${prev === null || prev === undefined ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  const lastIdx = values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop();
  const { active, bind } = useActive();
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg">
        <line x1={pad} x2={W - right + 6} y1={y(hi)} y2={y(hi)} className="grid" />
        <line x1={pad} x2={W - right + 6} y1={base} y2={base} className="axis" />
        <text x={W - right + 10} y={y(hi) + 4} className="tick-label tabular">
          {hi}
        </text>
        <text x={W - right + 10} y={base + 4} className="tick-label tabular">
          {lo}
        </text>
        <path d={d} className="line" />
        {values.map((v, i) =>
          v === null ? null : (
            <g key={i} className={cx('mark', active === i && 'mark-on')} {...bind(i)} role="img" aria-label={`${labels[i]}: ${format(v)}`}>
              <rect x={x(i) - 14} y={0} width={28} height={H} className="hit" />
              {i === lastIdx || active === i ? <circle cx={x(i)} cy={y(v)} r={4.5} className="dot" /> : null}
            </g>
          ),
        )}
        {lastIdx !== undefined ? (
          <text x={x(lastIdx)} y={y(values[lastIdx]!) - 9} textAnchor="end" className="value-label">
            {format(values[lastIdx]!)}
          </text>
        ) : null}
        {labels.map((l, i) =>
          i === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 4} textAnchor={i === 0 ? 'start' : 'end'} className="tick-label">
              {i === 0 ? l.replace('Week of ', '') : l}
            </text>
          ) : null,
        )}
      </svg>
      {active !== null && values[active] !== null ? (
        <Tip x={x(active)} width={W}>
          <strong>{format(values[active]!)}</strong>
          <span>{labels[active]}</span>
        </Tip>
      ) : null}
    </div>
  );
}

// -- ring --------------------------------------------------------------------------------------

export function Ring({ value, size = 92, tone = 'brand', children, label }: { value: number | null; size?: number; tone?: Tone; children?: ReactNode; label: string }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="ring" style={{ width: size, height: size }} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r={r} className={`ring-track ring-${tone}`} />
        {value !== null ? (
          <circle cx="50" cy="50" r={r} className={`ring-fill ring-${tone}`} strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 50 50)" />
        ) : null}
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

// -- a day's study plan --------------------------------------------------------------------------

export function Timeline({
  blocks,
  fromMin,
  toMin,
  cutoffMin,
}: {
  blocks: { startMin: number; endMin: number; title: string }[];
  fromMin: number;
  toMin: number;
  cutoffMin: number;
}) {
  const span = Math.max(60, toMin - fromMin);
  const pct = (m: number) => ((m - fromMin) / span) * 100;
  return (
    <div className="timeline" aria-hidden>
      {blocks.map((b, i) => (
        <span key={i} className="timeline-block" style={{ left: `${pct(b.startMin)}%`, width: `${Math.max(1.5, pct(b.endMin) - pct(b.startMin))}%` }} title={b.title} />
      ))}
      <span className="timeline-cutoff" style={{ left: `calc(${Math.min(100, Math.max(0, pct(cutoffMin)))}% - 2px)` }} title="Cut-off" />
    </div>
  );
}
