// Backups of the Android app: everything the phone keeps about you, in one
// JSON file the person saves through Android's own file screens (Google Drive
// included) and opens again after a reinstall or on a new phone.
//
// The format helpers are pure, so tests can run them without a phone.

import { Store } from '../../engine';
import type { CollectionName, Doc, LogDoc, UserDoc } from '../../shared/types';

/** Everything the on-device engine keeps, as saved in local storage. */
export interface SavedWorld {
  version: 1;
  token: string | null;
  data: Record<CollectionName, Doc[]>;
}

export const BACKUP_KIND = 'unrot-phone-backup';
export const BACKUP_VERSION = 1;

/** Settings kept outside the engine that belong in a backup. */
export const BACKUP_PREFS: readonly string[] = ['unrot.extraApps', 'unrot.reminders', 'unrot.theme'];

/** When the last backup was saved (ms), in local storage. */
export const LAST_BACKUP_KEY = 'unrot.lastBackup';

export interface Backup {
  kind: typeof BACKUP_KIND;
  version: typeof BACKUP_VERSION;
  savedAt: number;
  world: SavedWorld;
  prefs: Record<string, string>;
}

export interface BackupSummary {
  name: string;
  avatar: string;
  color: number;
  savedAt: number;
  /** Days with anything logged or measured. */
  days: number;
  /** The newest such day, if any. */
  lastDay: string | null;
  cutoff: string;
}

export class BackupError extends Error {}

export function makeBackup(world: SavedWorld, prefs: Record<string, string>, now: number): string {
  const backup: Backup = { kind: BACKUP_KIND, version: BACKUP_VERSION, savedAt: now, world, prefs };
  return JSON.stringify(backup);
}

export function backupFileName(today: string): string {
  return `unrot-backup-${today}.json`;
}

const NOT_A_BACKUP = "That file isn't an Unrot backup. Pick the file you saved from Unrot's Backup screen.";
const DAMAGED = 'That backup is damaged, so nothing was changed.';

/** Parse and check a backup file. Throws a BackupError with a message for people. */
export function readBackup(text: string): { backup: Backup; summary: BackupSummary } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError(NOT_A_BACKUP);
  }
  const b = parsed as Partial<Backup> | null;
  if (!b || typeof b !== 'object' || b.kind !== BACKUP_KIND) throw new BackupError(NOT_A_BACKUP);
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new BackupError('That backup was made by a newer version of Unrot. Update the app, then try again.');
  }
  const world = b.world;
  if (!world || world.version !== 1 || !world.data || typeof world.data !== 'object' || typeof world.token !== 'string') {
    throw new BackupError(DAMAGED);
  }
  // Loading it into a store checks every collection.
  try {
    new Store().load(world.data);
  } catch {
    throw new BackupError(DAMAGED);
  }
  const users = (world.data.users ?? []) as UserDoc[];
  const u = users[0];
  if (users.length !== 1 || !u || typeof u.name !== 'string') throw new BackupError(DAMAGED);
  const prefs: Record<string, string> = {};
  if (b.prefs && typeof b.prefs === 'object') {
    for (const k of BACKUP_PREFS) {
      const v = (b.prefs as Record<string, unknown>)[k];
      if (typeof v === 'string') prefs[k] = v;
    }
  }
  const logs = (world.data.logs ?? []) as LogDoc[];
  const lastDay = logs.reduce<string | null>((m, l) => (m === null || l.date > m ? l.date : m), null);
  const savedAt = typeof b.savedAt === 'number' ? b.savedAt : 0;
  return {
    backup: { kind: BACKUP_KIND, version: BACKUP_VERSION, savedAt, world, prefs },
    summary: { name: u.name, avatar: u.avatar, color: u.color, savedAt, days: logs.length, lastDay, cutoff: u.cutoff },
  };
}
