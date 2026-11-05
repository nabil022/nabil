// Daily local notifications on Android: a morning check-in nudge and an alert
// at the nightly cut-off. Scheduled on the phone; nothing goes through a server.

import { parseHM } from '../../shared/dates';
import { IS_REAL_NATIVE } from './native';
import { storage } from './storage';

const KEY = 'unrot.reminders';
const MORNING_ID = 101;
const CUTOFF_ID = 102;

export interface ReminderPrefs {
  morning: boolean;
  morningTime: string;
  cutoff: boolean;
}

export const DEFAULT_REMINDERS: ReminderPrefs = { morning: false, morningTime: '08:30', cutoff: false };

export function getReminders(): ReminderPrefs & { asked: boolean } {
  const saved = storage.getJSON<ReminderPrefs>(KEY);
  return { ...DEFAULT_REMINDERS, ...saved, asked: saved !== null };
}

/** Save the choice and (re)schedule. Returns 'denied' if the phone blocks notifications. */
export async function applyReminders(prefs: ReminderPrefs, cutoff: string): Promise<'ok' | 'denied' | 'unsupported'> {
  storage.setJSON(KEY, prefs);
  if (!IS_REAL_NATIVE) return 'unsupported';
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: [{ id: MORNING_ID }, { id: CUTOFF_ID }] }).catch(() => undefined);
  if (!prefs.morning && !prefs.cutoff) return 'ok';
  let perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
  if (perm.display !== 'granted') return 'denied';
  const at = (hm: string) => {
    const m = parseHM(hm) ?? 0;
    return { hour: Math.floor(m / 60), minute: m % 60 };
  };
  const notifications = [];
  if (prefs.morning) {
    notifications.push({
      id: MORNING_ID,
      title: 'Morning check-in',
      body: "Yesterday's screen time is in. Add how you slept and felt: 20 seconds.",
      schedule: { on: at(prefs.morningTime), allowWhileIdle: true },
      isExactNotification: false,
      smallIcon: 'ic_stat_unrot',
    });
  }
  if (prefs.cutoff) {
    notifications.push({
      id: CUTOFF_ID,
      title: `${cutoff}: screens off`,
      body: 'Your cut-off starts now. Phone down, and charge it outside your room.',
      schedule: { on: at(cutoff), allowWhileIdle: true },
      isExactNotification: false,
      smallIcon: 'ic_stat_unrot',
    });
  }
  await LocalNotifications.schedule({ notifications });
  return 'ok';
}
