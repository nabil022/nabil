// Formatting shared by the engine (feed text) and the client.

/** 222 -> '3h 42m', 45 -> '45m', 0 -> '0m'. */
export function fmtMin(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

/** Signed minutes: '-1h 05m' style without zero padding: '-1h 5m' / '+20m'. */
export function fmtMinSigned(minutes: number): string {
  if (Math.round(minutes) === 0) return '0m';
  return `${minutes < 0 ? '-' : '+'}${fmtMin(Math.abs(minutes))}`;
}

/** 222 -> '3.7 h' */
export function fmtHours(minutes: number, digits = 1): string {
  return `${(minutes / 60).toFixed(digits)} h`;
}

export function fmtPct(x: number, digits = 0): string {
  const v = Number(x.toFixed(digits));
  return `${v === 0 ? 0 : v}%`;
}

/** Cut percentage with sign: 23.4 -> '-23%' (less brain rot), -5 -> '+5%'. */
export function fmtCut(pctCut: number): string {
  const v = Math.round(pctCut);
  if (v === 0) return '0%';
  return v > 0 ? `-${v}%` : `+${-v}%`;
}

export function fmtNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
