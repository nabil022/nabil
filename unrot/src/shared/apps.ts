// The apps people can track as "brain rot". Names only, no logos.

export type AppCategory = 'Short video' | 'Social' | 'Video' | 'Streaming' | 'Chat' | 'Games' | 'Other';

export interface AppDef {
  id: string;
  name: string;
  category: AppCategory;
  /** Dot colour used in charts; any readable hue on both themes. */
  color: string;
}

export const APPS: readonly AppDef[] = [
  { id: 'tiktok', name: 'TikTok', category: 'Short video', color: '#E8457A' },
  { id: 'instagram', name: 'Instagram', category: 'Social', color: '#C060E0' },
  { id: 'youtube', name: 'YouTube', category: 'Video', color: '#E5533C' },
  { id: 'snapchat', name: 'Snapchat', category: 'Social', color: '#E2B80C' },
  { id: 'x', name: 'X / Twitter', category: 'Social', color: '#6E7F94' },
  { id: 'reddit', name: 'Reddit', category: 'Social', color: '#F07A2E' },
  { id: 'facebook', name: 'Facebook', category: 'Social', color: '#4A78E0' },
  { id: 'twitch', name: 'Twitch', category: 'Streaming', color: '#8A5CF0' },
  { id: 'netflix', name: 'Netflix & streaming', category: 'Streaming', color: '#C93B3B' },
  { id: 'discord', name: 'Discord', category: 'Chat', color: '#5C6FE8' },
  { id: 'games', name: 'Mobile games', category: 'Games', color: '#2FA36B' },
  { id: 'other', name: 'Other apps', category: 'Other', color: '#8C8494' },
];

export const APP_IDS: readonly string[] = APPS.map((a) => a.id);

export const DEFAULT_USER_APPS: readonly string[] = ['tiktok', 'instagram', 'youtube', 'snapchat'];

export const DEFAULT_GROUP_APPS: readonly string[] = [
  'tiktok', 'instagram', 'youtube', 'snapchat', 'x', 'reddit', 'facebook', 'twitch', 'games',
];

const byId = new Map(APPS.map((a) => [a.id, a]));

export function appById(id: string): AppDef | undefined {
  return byId.get(id);
}

export function appName(id: string): string {
  return byId.get(id)?.name ?? id;
}

export function isAppId(id: unknown): id is string {
  return typeof id === 'string' && byId.has(id);
}

/** Catalogue order, de-duplicated, unknown ids dropped. */
export function normalizeApps(ids: readonly unknown[]): string[] {
  const set = new Set(ids.filter(isAppId));
  return APP_IDS.filter((id) => set.has(id));
}
