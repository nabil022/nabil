// Backup and restore for the Android app, whose data lives only on the phone.

import { useState } from 'react';
import type { Me } from '../../engine/ops/account';
import { shortDate } from '../../shared/dates';
import { useApp } from '../lib/app';
import type { Api } from '../lib/api';
import { BACKUP_PREFS, LAST_BACKUP_KEY, BackupError, backupFileName, makeBackup, readBackup, type Backup as BackupFile, type BackupSummary } from '../lib/backup';
import { Backup } from '../lib/native';
import { applyReminders, getReminders } from '../lib/reminders';
import { useRouter } from '../lib/router';
import { storage } from '../lib/storage';
import { Icon } from '../ui/icons';
import { Avatar, Button, Card, Confirm, Empty, Screen } from '../ui/kit';

const DAY = 86_400_000;
/** Nudge on Home when the last backup (or the profile, if none) is older than this. */
const NUDGE_AFTER_DAYS = 7;

export function lastBackup(): number | null {
  const v = Number(storage.get(LAST_BACKUP_KEY));
  return Number.isFinite(v) && v > 0 ? v : null;
}

function when(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

function ago(ms: number): string {
  const days = Math.floor((Date.now() - ms) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

function errorText(err: unknown): string {
  return err instanceof BackupError || err instanceof Error ? err.message : 'Something went wrong.';
}

/** Put a checked backup on this phone and start the app again from it. */
async function restoreBackup(api: Api, backup: BackupFile, summary: BackupSummary): Promise<void> {
  if (!api.restore) throw new Error('Backups only work in the Android app.');
  api.restore(backup.world);
  storage.clearPrefix('unrot.synced.');
  for (const k of BACKUP_PREFS) storage.set(k, backup.prefs[k] ?? null);
  storage.set(LAST_BACKUP_KEY, String(backup.savedAt || Date.now()));
  // Reminders are scheduled by the phone itself, so a new install needs them again.
  const rem = getReminders();
  if (rem.morning || rem.cutoff) await applyReminders(rem, summary.cutoff).catch(() => undefined);
  window.location.reload();
}

function BackupCard({ summary }: { summary: BackupSummary }) {
  return (
    <div className="row" style={{ alignItems: 'center', marginBottom: 10 }}>
      <Avatar emoji={summary.avatar} color={summary.color} size={44} />
      <div className="grow">
        <strong>{summary.name}</strong>
        <div className="small muted">
          Saved {summary.savedAt ? when(summary.savedAt) : 'at an unknown time'} · {summary.days} {summary.days === 1 ? 'day' : 'days'} of data
          {summary.lastDay ? ` up to ${shortDate(summary.lastDay)}` : ''}
        </div>
      </div>
    </div>
  );
}

/** Pick a backup file, show what is in it, and restore it once confirmed. */
function useRestore(replacing: boolean) {
  const { api, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<{ backup: BackupFile; summary: BackupSummary } | null>(null);
  const pick = async () => {
    setBusy(true);
    try {
      const r = await Backup.open();
      if (r.opened && r.data !== undefined) setPicked(readBackup(r.data));
    } catch (err) {
      toast(errorText(err), 'bad');
    } finally {
      setBusy(false);
    }
  };
  const dialog = (
    <Confirm
      open={picked !== null}
      title="Restore this backup?"
      confirmLabel="Restore it"
      danger={replacing}
      onClose={() => setPicked(null)}
      onConfirm={async () => {
        if (!picked) return;
        try {
          await restoreBackup(api, picked.backup, picked.summary);
        } catch (err) {
          toast(errorText(err), 'bad');
        }
      }}
    >
      {picked ? <BackupCard summary={picked.summary} /> : null}
      <p>
        {replacing
          ? 'This replaces everything on this phone with the backup. Anything added since it was saved is lost.'
          : 'Your profile, check-ins, challenges, wallet and settings come back as they were when you saved it.'}
      </p>
    </Confirm>
  );
  return { pick, busy, dialog };
}

/** The Backup screen (Settings › Your data, or the Home nudge). */
export function BackupScreen() {
  const { api, me, toast } = useApp();
  const [last, setLast] = useState(lastBackup());
  const [saving, setSaving] = useState(false);
  const restore = useRestore(true);
  if (api.mode !== 'phone' || !me) {
    return (
      <Screen title="Backup" back="/settings">
        <Empty icon="download" title="Backups are for the Android app">
          Here your data is kept by your group's server.
        </Empty>
      </Screen>
    );
  }

  const save = async () => {
    const world = api.snapshot?.();
    if (!world) return;
    setSaving(true);
    try {
      const prefs: Record<string, string> = {};
      for (const k of BACKUP_PREFS) {
        const v = storage.get(k);
        if (v !== null) prefs[k] = v;
      }
      const now = Date.now();
      const r = await Backup.save({ name: backupFileName(me.today), data: makeBackup(world, prefs, now) });
      if (r.saved) {
        storage.set(LAST_BACKUP_KEY, String(now));
        setLast(now);
        toast('Backup saved', 'good');
      }
    } catch (err) {
      toast(errorText(err), 'bad');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title="Backup" back="/settings">
      <Card>
        <div className="stack" style={{ gap: 12 }}>
          <div className="card-title">Keep a copy of your data</div>
          <p className="card-sub">
            Everything Unrot knows about you is saved on this phone only. A backup is one small file with all of it. Save it to Google Drive or your phone, and if you
            change phones or reinstall Unrot, restore it.
          </p>
          <p className="small">
            <strong>{last ? `Last backup: ${when(last)} (${ago(last)})` : 'No backup yet'}</strong>
          </p>
          <Button icon="download" busy={saving} onClick={() => void save()}>
            Save a backup
          </Button>
          <Button variant="secondary" icon="refresh" busy={restore.busy} onClick={() => void restore.pick()}>
            Restore from a backup
          </Button>
        </div>
      </Card>
      <p className="tiny">Saving opens Android's save screen: pick Drive to keep it in your Google account, or Downloads to keep it on the phone.</p>
      {restore.dialog}
    </Screen>
  );
}

/** First launch: bring a profile back instead of starting a new one. */
export function RestoreOnSetup() {
  const restore = useRestore(false);
  return (
    <div className="stack" style={{ gap: 8, alignItems: 'center' }}>
      <p className="small muted">Had Unrot before?</p>
      <Button variant="secondary" icon="refresh" busy={restore.busy} onClick={() => void restore.pick()}>
        Restore from a backup
      </Button>
      {restore.dialog}
    </div>
  );
}

/** Home: a reminder when there is no recent backup. */
export function BackupNudge({ me }: { me: Me }) {
  const { go } = useRouter();
  const last = lastBackup();
  if (Date.now() - (last ?? me.createdAt) < NUDGE_AFTER_DAYS * DAY) return null;
  return (
    <Card onClick={() => go('/backup')}>
      <div className="row">
        <Icon name="download" size={24} className="ink-brand" />
        <div className="grow">
          <div className="card-title">Back up your data</div>
          <div className="card-sub">{last ? `Last backup ${ago(last)}.` : 'No backup yet.'} It's only on this phone until you do.</div>
        </div>
        <Icon name="next" />
      </div>
    </Card>
  );
}
