// Simulated money. Integer cents everywhere; nothing here talks to a bank.

import { MONEY } from './balance';
import type { Payout } from './types';

export function formatCents(cents: number, opts: { sign?: boolean } = {}): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  const frac = abs % 100;
  const body = frac === 0 ? `$${whole}` : `$${whole}.${String(frac).padStart(2, '0')}`;
  if (neg) return `-${body}`;
  return opts.sign && cents > 0 ? `+${body}` : body;
}

export interface Ranked {
  userId: string;
  /** Already rounded the way it is displayed; equal scores are ties. */
  score: number;
}

/**
 * Split a pot among ranked, eligible people (best first).
 *
 * 'winner': everyone tied for first shares the pot.
 * 'top3':   positions 1-3 are paid 60/30/10. People tied across positions share
 *           those positions' money evenly (golf rules). With fewer than three
 *           eligible people the unused shares are spread proportionally.
 *
 * Leftover cents from rounding go one at a time down the ranking, so the
 * payouts always add up to exactly the pot.
 */
export function splitPot(potCents: number, ranked: readonly Ranked[], payout: Payout): Map<string, number> {
  const out = new Map<string, number>();
  if (potCents <= 0 || ranked.length === 0) return out;

  const groups: Ranked[][] = [];
  for (const r of ranked) {
    const last = groups[groups.length - 1];
    if (last && last[0]!.score === r.score) last.push(r);
    else groups.push([r]);
  }

  let shares: number[];
  if (payout === 'winner') {
    shares = [1];
  } else {
    const paid = Math.min(MONEY.TOP3_SPLIT.length, ranked.length);
    const raw = MONEY.TOP3_SPLIT.slice(0, paid);
    const total = raw.reduce((a, b) => a + b, 0);
    shares = raw.map((s) => s / total);
  }

  const fractions = new Map<string, number>();
  let position = 0;
  for (const group of groups) {
    if (position >= shares.length) break;
    let groupShare = 0;
    for (let p = position; p < position + group.length && p < shares.length; p++) groupShare += shares[p]!;
    // In 'winner' mode only the first tie group exists in the paid range.
    if (payout === 'winner') groupShare = 1;
    for (const r of group) fractions.set(r.userId, groupShare / group.length);
    position += group.length;
    if (payout === 'winner') break;
  }

  let allocated = 0;
  for (const [userId, f] of fractions) {
    const cents = Math.floor(potCents * f);
    out.set(userId, cents);
    allocated += cents;
  }
  let left = potCents - allocated;
  const order = ranked.filter((r) => fractions.has(r.userId));
  for (let i = 0; left > 0 && order.length > 0; i = (i + 1) % order.length) {
    const id = order[i]!.userId;
    out.set(id, (out.get(id) ?? 0) + 1);
    left--;
  }
  return out;
}

export function parseDollarsToCents(input: string): number | null {
  const s = input.trim().replace(/^\$/, '');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}
