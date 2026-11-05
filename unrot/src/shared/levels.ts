// Levels: from fully cooked to unrotted.
//
// Reaching level L takes 50·L·(L-1) XP in total: 100, 300, 600, 1000, …
// so each level costs 100 XP more than the last.

export const LEVEL_TITLES: readonly string[] = [
  'Fully Cooked',
  'Doomscroller',
  'Brain Rot Survivor',
  'Scroll Skeptic',
  'Grass Toucher',
  'Locked In',
  'Focus Goblin',
  'Deep Worker',
  'Dopamine Detoxer',
  'Monk Mode',
  'Aura Farmer',
  'Unrotted Legend',
];

export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function levelTitle(level: number): string {
  if (level <= LEVEL_TITLES.length) return LEVEL_TITLES[level - 1]!;
  return `${LEVEL_TITLES[LEVEL_TITLES.length - 1]} ${level - LEVEL_TITLES.length + 1}`;
}

export interface LevelInfo {
  level: number;
  title: string;
  xp: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans. */
  span: number;
  progress: number;
  nextTitle: string;
}

export function levelInfo(xp: number): LevelInfo {
  const safe = Math.max(0, Math.floor(xp));
  let level = 1;
  while (xpForLevel(level + 1) <= safe) level++;
  const base = xpForLevel(level);
  const span = xpForLevel(level + 1) - base;
  return {
    level,
    title: levelTitle(level),
    xp: safe,
    into: safe - base,
    span,
    progress: (safe - base) / span,
    nextTitle: levelTitle(level + 1),
  };
}
