import { useEffect, useState } from 'react';
import type { Me } from '../../engine/ops/account';
import type { LeaderboardView } from '../../engine/ops/leaderboard';
import type { Stats as StatsView } from '../../engine/ops/logs';
import { APPS, appName } from '../../shared/apps';
import { BASELINE, CREDIT, GROUP_LEVELS, SETTLE_AFTER_DAYS } from '../../shared/balance';
import { dayMonth, shortDate } from '../../shared/dates';
import { fmtMin, fmtNumber } from '../../shared/format';
import { AGE_GROUPS, type AgeGroup } from '../../shared/health';
import { formatCents } from '../../shared/money';
import { AVATARS, AVATAR_COLORS } from '../../shared/profile';
import { STANDALONE, useApp, useQuery, type Theme } from '../lib/app';
import { downloadText } from '../lib/download';
import { IS_NATIVE } from '../lib/native';
import { applyReminders, getReminders } from '../lib/reminders';
import { getExtras, setExtras, topApps, type AppUse } from '../lib/tracking';
import { useTracking } from '../lib/tracking-context';
import { Link, useRouter } from '../lib/router';
import { DayBars, HBars } from '../ui/charts';
import { BrainMark, Icon, type IconName } from '../ui/icons';
import {
  Avatar,
  Button,
  Card,
  Chip,
  Confirm,
  CopyButton,
  ErrorNote,
  Field,
  Loading,
  Meter,
  MinutesInput,
  Pill,
  Screen,
  Section,
  Segmented,
  Toggle,
  cx,
} from '../ui/kit';
import { Calculator } from './Welcome';

const MENU: { to: string; icon: IconName; title: string; sub: string }[] = [
  { to: '/wallet', icon: 'wallet', title: 'Wallet', sub: 'Balance and deposits' },
  { to: '/health', icon: 'heart', title: 'Health', sub: 'Physical and mental %' },
  { to: '/sleep', icon: 'moon', title: 'Sleep Reset', sub: 'The one-week challenge' },
  { to: '/planner', icon: 'book', title: 'Study planner', sub: 'Homework before cut-off' },
  { to: '/stats', icon: 'chart', title: 'Stats', sub: 'History and badges' },
  { to: '/leaderboard', icon: 'globe', title: 'Leaderboard', sub: 'Everyone, by age' },
  { to: '/calculator', icon: 'calculator', title: 'Calculator', sub: 'What it adds up to' },
  { to: '/about', icon: 'info', title: 'How it works', sub: 'Rules and scoring' },
];

export function MeScreen() {
  const { me, api } = useApp();
  // On the phone alone there is nobody else to rank against.
  const menu = api.mode === 'phone' ? MENU.filter((m) => m.to !== '/leaderboard') : MENU;
  const { go } = useRouter();
  if (!me) return null;
  return (
    <Screen title="You" action={<Button variant="secondary" size="sm" icon="sliders" onClick={() => go('/settings')}>Settings</Button>}>
      <Card>
        <div className="row">
          <Avatar emoji={me.avatar} color={me.color} size={58} />
          <div className="grow">
            <div className="card-title" style={{ fontSize: 20 }}>
              {me.name}
            </div>
            <div className="card-sub">
              Level {me.level.level} · {me.level.title}
            </div>
          </div>
          <Link to="/wallet" className="balance-chip">
            {formatCents(me.balanceCents)}
          </Link>
        </div>
        <div style={{ marginTop: 14 }}>
          <Meter value={me.level.into} max={me.level.span} label="XP to next level" />
          <div className="row tiny" style={{ marginTop: 6, justifyContent: 'space-between' }}>
            <span>{fmtNumber(me.xp)} XP</span>
            <span>
              {me.level.span - me.level.into} to {me.level.nextTitle}
            </span>
          </div>
        </div>
      </Card>
      <div className="menu-grid">
        {menu.map((m) => (
          <Link key={m.to} to={m.to} className="menu-item">
            <span className="feature-icon">
              <Icon name={m.icon} size={20} />
            </span>
            <div>
              <strong>{m.title}</strong>
              <br />
              <span>{m.sub}</span>
            </div>
          </Link>
        ))}
      </div>
    </Screen>
  );
}

// -- settings -----------------------------------------------------------------------------

export function Settings() {
  const { me, mutate, signOut, theme, setTheme, api, resetLocal, exitDemo, toast } = useApp();
  const { go } = useRouter();
  const [name, setName] = useState(me?.name ?? '');
  const [deleting, setDeleting] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [password, setPassword] = useState('');
  const [exportText, setExportText] = useState<string | null>(null);
  if (!me) return null;
  const patch = (body: Partial<Me> & Record<string, unknown>, ok = 'Saved') => mutate('PATCH', '/api/me', body, ok);

  const exportCsv = async () => {
    try {
      const data = await api.call<{ logs: import('../../shared/types').LogDoc[] }>('GET', '/api/me/export');
      const apps = APPS.map((a) => a.id).filter((id) => data.logs.some((l) => l.apps[id] !== undefined));
      const head = ['date', ...apps.map((a) => `${a}_min`), 'steps', 'active_min', 'bedtime', 'wake_time', 'sleep_min', 'late_night_min', 'mood', 'energy', 'focus', 'stress', 'late_homework'];
      const rows = data.logs.map((l) =>
        [l.date, ...apps.map((a) => l.apps[a] ?? ''), l.steps ?? '', l.activeMin ?? '', l.bedtime ?? '', l.wakeTime ?? '', l.sleepMin ?? '', l.lateNightMin ?? '', l.mood ?? '', l.energy ?? '', l.focus ?? '', l.stress ?? '', l.lateHomework === null ? '' : l.lateHomework ? 'yes' : 'no'].join(','),
      );
      const csv = [head.join(','), ...rows].join('\n');
      if (STANDALONE || !downloadText(`unrot-${me.today}.csv`, csv)) setExportText(csv);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed.', 'bad');
    }
  };

  return (
    <Screen title="Settings" back="/me">
      <Section title="Profile">
        <Card>
          <div className="stack" style={{ gap: 14 }}>
            <Field label="Name" htmlFor="s-name">
              <div className="row">
                <input id="s-name" className="input grow" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
                <Button variant="secondary" disabled={!name.trim() || name === me.name} onClick={() => patch({ name })}>
                  Save
                </Button>
              </div>
            </Field>
            <Field label="Avatar">
              <div className="emoji-grid">
                {AVATARS.map((a) => (
                  <button key={a} type="button" className={cx('emoji-btn', me.avatar === a && 'emoji-on')} onClick={() => patch({ avatar: a }, 'Avatar updated')} aria-pressed={me.avatar === a} aria-label={`Avatar ${a}`}>
                    {a}
                  </button>
                ))}
              </div>
              <div className="wrap" style={{ marginTop: 8 }}>
                {AVATAR_COLORS.map((c, i) => (
                  <button key={c} type="button" className={cx('color-dot', me.color === i && 'color-on')} style={{ background: c }} onClick={() => patch({ color: i }, 'Colour updated')} aria-pressed={me.color === i} aria-label={`Colour ${i + 1}`} />
                ))}
              </div>
            </Field>
            <div className="kv">
              <span className="kv-k">Born</span>
              <span className="kv-v">
                {me.birthYear} · age group {me.ageGroup}
              </span>
            </div>
            <div className="kv">
              <span className="kv-k">Time zone</span>
              <span className="kv-v">{me.timezone}</span>
            </div>
          </div>
        </Card>
      </Section>

      <Section title="Your routine">
        <Card>
          <div className="stack" style={{ gap: 14 }}>
            <div className="grid-2">
              <TimeSetting id="s-bed" label="Usual bedtime" value={me.bedtime} onSave={(v) => patch({ bedtime: v }, 'Bedtime saved')} />
              <TimeSetting id="s-wake" label="Usual wake-up" value={me.wakeTime} onSave={(v) => patch({ wakeTime: v }, 'Wake-up saved')} />
            </div>
            <TimeSetting
              id="s-study"
              label="Homework usually starts"
              value={me.studyStart}
              required
              onSave={(v) => v && patch({ studyStart: v }, 'Homework start saved')}
              hint="Check-ins start from your usual times; the study planner from this one."
            />
          </div>
        </Card>
      </Section>

      <Section title="Tracking">
        <Card>
          <div className="stack" style={{ gap: 14 }}>
            <Field label="Apps you track">
              <div className="wrap">
                {APPS.map((a) => (
                  <Chip
                    key={a.id}
                    selected={me.apps.includes(a.id)}
                    onClick={() => {
                      const next = me.apps.includes(a.id) ? me.apps.filter((x) => x !== a.id) : [...me.apps, a.id];
                      if (next.length) void patch({ apps: next }, 'Apps updated');
                    }}
                  >
                    {a.name}
                  </Chip>
                ))}
              </div>
            </Field>
            <Link to="/settings/baseline" className="btn btn-secondary btn-md">
              Your normal (baseline): {fmtMin(me.baseline?.dailyMin ?? 0)} a day
            </Link>
            <Field label="Daily goal" hint="Days under it earn XP.">
              <MinutesInput id="s-goal" label="Daily goal" value={me.dailyGoalMin} onChange={(v) => void patch({ dailyGoalMin: v }, 'Goal saved')} step={15} />
            </Field>
            <Field label="Nightly cut-off" htmlFor="s-cutoff">
              <input
                id="s-cutoff"
                className="input"
                type="time"
                defaultValue={me.cutoff}
                onBlur={(e) => {
                  const v = e.target.value;
                  if (!v || v === me.cutoff) return;
                  void patch({ cutoff: v }, 'Cut-off saved').then(() => {
                    const r = getReminders();
                    if (r.cutoff || r.morning) void applyReminders(r, v);
                  });
                }}
              />
            </Field>
          </div>
        </Card>
      </Section>

      {IS_NATIVE ? <PhoneTracking /> : null}

      <Section title="Privacy and look">
        <Card>
          <div className="stack" style={{ gap: 14 }}>
            {api.mode !== 'phone' ? (
              <Toggle
                id="s-public"
                checked={me.publicProfile}
                onChange={(v) => void patch({ publicProfile: v }, v ? 'You show on public boards' : 'Hidden from public boards')}
                label="Show me on the public leaderboard"
                detail="Your name, avatar and daily average. Groups always see you."
              />
            ) : null}
            <Field label="Theme">
              <Segmented<Theme>
                label="Theme"
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'system', label: 'Auto' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </Field>
          </div>
        </Card>
      </Section>

      <Section title="Your data">
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <Button variant="secondary" icon="download" onClick={exportCsv}>
              Export check-ins (CSV)
            </Button>
            {exportText ? (
              <>
                <textarea className="input" readOnly rows={6} value={exportText} style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace' }} />
                <CopyButton text={exportText} label="Copy CSV" />
              </>
            ) : null}
            {api.mode === 'phone' ? (
              <>
                <p className="small muted">Everything you enter is saved on this phone, and only here.</p>
                <Button variant="quiet" icon="trash" onClick={() => setErasing(true)}>
                  Erase everything on this phone
                </Button>
              </>
            ) : null}
            {api.mode === 'demo' ? (
              <>
                <Button variant="secondary" icon="refresh" onClick={() => resetLocal().then(() => toast('Demo reset', 'good'))}>
                  Reset the demo data
                </Button>
                {!STANDALONE ? (
                  <Button variant="secondary" onClick={exitDemo}>
                    Leave the demo
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </Card>
      </Section>

      {api.mode === 'server' ? (
        <Section title="Account">
          <Card>
            <div className="stack" style={{ gap: 10 }}>
              <div className="kv">
                <span className="kv-k">Email</span>
                <span className="kv-v">{me.email}</span>
              </div>
              <Button variant="secondary" icon="logout" onClick={() => signOut().then(() => go('/', { replace: true }))}>
                Log out
              </Button>
              <Button variant="quiet" icon="trash" onClick={() => setDeleting(true)}>
                Delete my account
              </Button>
            </div>
          </Card>
        </Section>
      ) : null}
      <Confirm
        open={erasing}
        title="Erase everything?"
        confirmLabel="Erase for good"
        danger
        onClose={() => setErasing(false)}
        onConfirm={async () => {
          await resetLocal();
          go('/', { replace: true });
        }}
      >
        <p>Your profile, check-ins, challenges, wallet and reminders are deleted from this phone. Unrot starts again from the setup. This cannot be undone.</p>
      </Confirm>
      <Confirm
        open={deleting}
        title="Delete your account?"
        confirmLabel="Delete for good"
        danger
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          const r = await mutate('DELETE', '/api/me', { password }, 'Account deleted');
          if (r) {
            await signOut();
            go('/', { replace: true });
          }
        }}
      >
        <p>Your check-ins, deposits and wallet are deleted. Groups you own pass to another member. Past results keep your numbers without your name.</p>
        <Field label="Password" htmlFor="del-pw">
          <input id="del-pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </Confirm>
    </Screen>
  );
}

/**
 * A time that saves as soon as it is picked (Android's time picker fires
 * `change` once, on OK). Clearing it saves null unless it is `required`.
 */
function TimeSetting({ id, label, value, onSave, hint, required }: { id: string; label: string; value: string | null; onSave: (v: string | null) => unknown; hint?: string; required?: boolean }) {
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <input
        id={id}
        className="input"
        type="time"
        defaultValue={value ?? ''}
        onChange={(e) => {
          const v = e.target.value || null;
          if (v === value || (v === null && required)) return;
          void onSave(v);
        }}
      />
    </Field>
  );
}

/** Android only: tracking status, which apps count, and reminders. */
function PhoneTracking() {
  const { me, mutate, toast } = useApp();
  const { state, refresh, enable } = useTracking();
  const [apps, setApps] = useState<AppUse[] | null>(null);
  const [extras, setExtrasState] = useState(getExtras());
  const [rem, setRem] = useState(getReminders());
  const [loading, setLoading] = useState(false);
  if (!me) return null;

  const loadApps = async () => {
    setLoading(true);
    try {
      setApps(await topApps(me));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not read your apps.', 'bad');
    } finally {
      setLoading(false);
    }
  };

  const toggleExtra = async (a: AppUse) => {
    const next = { ...extras };
    if (next[a.pkg]) delete next[a.pkg];
    else next[a.pkg] = 'other';
    setExtras(next);
    setExtrasState(next);
    // Counting an app as "Other apps" means tracking that category too.
    if (Object.values(next).includes('other') && !me.apps.includes('other')) {
      await mutate('PATCH', '/api/me', { apps: [...me.apps, 'other'] });
    }
    setApps((list) => list?.map((x) => (x.pkg === a.pkg ? { ...x, picked: !x.picked, app: x.picked ? null : 'other' } : x)) ?? null);
    void refresh(true);
  };

  const setReminder = async (patch: Partial<typeof rem>) => {
    const next = { ...rem, ...patch };
    const r = await applyReminders(next, me.cutoff);
    setRem({ ...next, asked: true });
    if (r === 'denied') toast('Notifications are blocked for Unrot. Allow them in Android settings.', 'bad');
  };

  return (
    <Section title="Phone tracking">
      <Card>
        <div className="stack" style={{ gap: 12 }}>
          <div className="row">
            <Icon name="phone" size={22} className={state.granted ? 'ink-fresh' : 'ink-brand'} />
            <div className="grow">
              <div style={{ fontWeight: 700 }}>{state.granted ? 'Screen time is measured automatically' : 'Automatic tracking is off'}</div>
              <div className="tiny">
                {state.granted
                  ? `Read from Android's usage records. ${state.lastSync ? `Last saved: ${shortDate(state.lastSync.date)}.` : ''}`
                  : 'Switch on Usage access for Unrot to stop typing minutes in.'}
              </div>
            </div>
          </div>
          <div className="wrap">
            {state.granted ? (
              <Button variant="secondary" size="sm" icon="refresh" busy={state.syncing} onClick={() => refresh(true).then(() => toast('Synced', 'good'))}>
                Sync now
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" icon="sliders" onClick={() => void enable()}>
              {state.granted ? 'Usage access settings' : 'Turn on tracking'}
            </Button>
          </div>
          {state.error ? <p className="small ink-danger">{state.error}</p> : null}
        </div>
      </Card>
      {state.granted ? (
        <Card>
          <div className="card-title">Apps that count</div>
          <p className="card-sub" style={{ marginTop: 4 }}>
            TikTok, Instagram, YouTube and the rest are recognised automatically, and games by their Play Store category. Pick anything else you want counted as "Other apps".
          </p>
          {apps === null ? (
            <Button variant="secondary" size="sm" busy={loading} style={{ marginTop: 10 }} onClick={() => void loadApps()}>
              Show my most-used apps
            </Button>
          ) : (
            <div className="list" style={{ marginTop: 6 }}>
              {apps.map((a) => (
                <div className="list-item" key={a.pkg}>
                  <div className="grow">
                    <div className="list-title">{a.label}</div>
                    <div className="list-sub">{fmtMin(a.minPerDay)} a day</div>
                  </div>
                  {a.app && !a.picked ? (
                    me.apps.includes(a.app) ? (
                      <Pill tone="fresh" icon="check">
                        {appName(a.app)}
                      </Pill>
                    ) : (
                      <Pill>{appName(a.app)}: not tracked</Pill>
                    )
                  ) : (
                    <Chip selected={a.picked} onClick={() => void toggleExtra(a)}>
                      {a.picked ? 'Counts as Other' : 'Count it'}
                    </Chip>
                  )}
                </div>
              ))}
              {apps.length === 0 ? <p className="muted small">No app use recorded in the last week yet.</p> : null}
            </div>
          )}
          {Object.values(extras).includes('other') && me.baseline?.perApp.other === undefined ? (
            <p className="small" style={{ marginTop: 10 }}>
              Now add your normal for Other apps, so cuts are measured fairly: <Link to="/settings/baseline">set it</Link>.
            </p>
          ) : null}
          <p className="tiny" style={{ marginTop: 10 }}>
            Apps marked "not tracked" don't count. Add them under Apps you track if you want them to.
          </p>
        </Card>
      ) : null}
      <Card>
        <div className="stack" style={{ gap: 12 }}>
          <Toggle
            id="rem-morning"
            checked={rem.morning}
            onChange={(v) => void setReminder({ morning: v })}
            label={`Morning check-in reminder (${rem.morningTime})`}
            detail="Screen time fills itself in; this reminds you to add sleep and mood."
          />
          <Toggle
            id="rem-cutoff"
            checked={rem.cutoff}
            onChange={(v) => void setReminder({ cutoff: v })}
            label={`Cut-off alert (${me.cutoff})`}
            detail="A nudge to put the phone down when your cut-off starts."
          />
        </div>
      </Card>
    </Section>
  );
}

export function BaselineScreen({ then }: { then?: string }) {
  const { me, mutate } = useApp();
  const { go } = useRouter();
  const [values, setValues] = useState<Record<string, number>>(() => ({ ...(me?.baseline?.perApp ?? {}) }));
  const [steps, setSteps] = useState(String(me?.baseline?.usualSteps ?? ''));
  const [now] = useState(() => Date.now());
  useEffect(() => {
    if (me?.baseline) setValues((v) => ({ ...me.baseline!.perApp, ...v }));
  }, [me]);
  if (!me) return null;
  const locked = (id: string) => me.baseline?.lockAt[id] !== undefined && now > me.baseline.lockAt[id]!;
  const total = me.apps.reduce((a, id) => a + (values[id] ?? 0), 0);
  return (
    <Screen title="Your normal" back={then ?? '/settings'}>
      {then && me.apps.some((id) => me.baseline?.perApp[id] === undefined) ? (
        <Card tone="brand">
          <p className="small">
            <strong>Your group counts some apps you haven't tracked yet.</strong> Add your normal daily time for each one marked new. If you never use one, leave it at 0.
          </p>
        </Card>
      ) : null}
      <p className="lead">Minutes per day on a normal day, from your phone's last-week average. Every cut is measured against this.</p>
      <Card>
        {me.apps.map((id) => (
          <div className="app-row" key={id}>
            <span className="app-dot" style={{ background: APPS.find((a) => a.id === id)?.color }} aria-hidden />
            <span className="grow">
              {appName(id)}
              {locked(id) ? (
                <>
                  {' '}
                  <Pill icon="lock">Locked</Pill>
                </>
              ) : me.baseline?.lockAt[id] ? (
                <span className="tiny"> · editable until {dayMonth(new Date(me.baseline.lockAt[id]!).toISOString().slice(0, 10))}</span>
              ) : (
                <span className="tiny"> · new</span>
              )}
            </span>
            {locked(id) ? (
              <strong>{fmtMin(values[id] ?? 0)}</strong>
            ) : (
              <MinutesInput id={`bl-${id}`} label={appName(id)} value={values[id] ?? 0} onChange={(m) => setValues({ ...values, [id]: m })} max={16 * 60} />
            )}
          </div>
        ))}
        <hr className="divider" />
        <div className="kv">
          <span className="kv-k">Total</span>
          <span className="kv-v">{fmtMin(total)} a day</span>
        </div>
      </Card>
      <Card>
        <Field
          label={
            <>
              Usual steps a day {locked('steps') ? <Pill icon="lock">Locked</Pill> : null}
            </>
          }
          htmlFor="bl-steps"
          hint="Every 1,000 steps above this takes 15 minutes off your brain rot."
        >
          {locked('steps') ? (
            <strong>{Number(steps || 0).toLocaleString()}</strong>
          ) : (
            <input id="bl-steps" className="input" inputMode="numeric" value={steps} placeholder="e.g. 6500" onChange={(e) => setSteps(e.target.value.replace(/\D/g, '').slice(0, 5))} />
          )}
        </Field>
      </Card>
      <p className="tiny">Each value can be corrected for {BASELINE.EDIT_DAYS} days after you first enter it, then it locks, so nobody can raise their normal later to fake a bigger cut. Your groups can see it.</p>
      <Button
        size="lg"
        block
        onClick={async () => {
          const perApp = Object.fromEntries(me.apps.filter((id) => !locked(id)).map((id) => [id, values[id] ?? 0]));
          const body: Record<string, unknown> = { perApp };
          if (!locked('steps') && steps !== '') body.usualSteps = Number(steps);
          const r = await mutate('PUT', '/api/me/baseline', body, 'Saved');
          if (r && then) go(then, { replace: true });
        }}
      >
        Save
      </Button>
    </Screen>
  );
}

// -- stats -----------------------------------------------------------------------------------

export function Stats() {
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [table, setTable] = useState(false);
  const { me } = useApp();
  const q = useQuery<StatsView>(`/api/stats?days=${days}`);
  const s = q.data;
  return (
    <Screen title="Stats" back="/me">
      <Segmented
        label="Range"
        value={days}
        onChange={setDays}
        options={[
          { value: '7', label: '7 days' },
          { value: '30', label: '30 days' },
          { value: '90', label: '90 days' },
        ]}
      />
      {!s ? (
        q.error ? <ErrorNote error={q.error} retry={q.reload} /> : <Loading />
      ) : (
        <div className="stack" style={{ gap: 18, opacity: q.loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <div className="grid-3">
            <Card>
              <div className="stat">
                <div className="stat-label">Average</div>
                <div className="stat-value">{s.avgNetMin === null ? '-' : fmtMin(s.avgNetMin)}</div>
                <div className="stat-sub">a day, counted</div>
              </div>
            </Card>
            <Card>
              <div className="stat">
                <div className="stat-label">Bonus earned</div>
                <div className="stat-value ink-fresh">{s.totalCreditMin >= 600 ? `${Math.round(s.totalCreditMin / 60)}h` : fmtMin(s.totalCreditMin)}</div>
                <div className="stat-sub">steps + challenges</div>
              </div>
            </Card>
            <Card>
              <div className="stat">
                <div className="stat-label">Best streak</div>
                <div className="stat-value">{s.longestStreak}</div>
                <div className="stat-sub">days in a row</div>
              </div>
            </Card>
          </div>

          <Section
            title="Brain rot per day"
            action={
              <button className="link" onClick={() => setTable(!table)}>
                {table ? 'Chart' : 'Table'}
              </button>
            }
          >
            <Card>
              {table ? (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Screen</th>
                        <th>Bonus</th>
                        <th>Counted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...s.days].reverse().map((d) => (
                        <tr key={d.date}>
                          <td>{shortDate(d.date)}</td>
                          <td>{d.raw === null ? '-' : fmtMin(d.raw)}</td>
                          <td>{d.credit ? `-${fmtMin(d.credit)}` : ''}</td>
                          <td>{d.net === null ? 'not logged' : fmtMin(d.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <DayBars days={s.days} normal={me?.baseline?.dailyMin ?? 0} />
              )}
              <p className="tiny" style={{ marginTop: 8 }}>
                {s.loggedDays} of {s.days.length} days logged.
                {s.bestDay ? ` Best day: ${shortDate(s.bestDay.date)}, ${fmtMin(s.bestDay.net ?? 0)}.` : ''}
              </p>
            </Card>
          </Section>

          {s.perApp.length ? (
            <Section title="Average per app, on logged days">
              <Card>
                <HBars items={s.perApp.map((p) => ({ label: appName(p.app), value: p.avgMin }))} format={fmtMin} />
              </Card>
            </Section>
          ) : null}

          {s.projection ? (
            <Section title="At this week's pace">
              <Card tone="brand">
                <div className="projection">
                  <div className="stat">
                    <div className="stat-label">A year</div>
                    <div className="big-number">{fmtNumber(s.projection.yearlyHours)} h</div>
                    <div className="stat-sub">{s.projection.yearlyDays} full days</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Waking hours</div>
                    <div className="big-number">{Math.round(s.projection.wakingPct)}%</div>
                    <div className="stat-sub">{s.projection.verdict.label}</div>
                  </div>
                </div>
              </Card>
            </Section>
          ) : null}

          <Section title="Badges">
            <div className="badge-grid">
              {s.achievements.map((a) => (
                <div key={a.id} className={cx('badge', !a.earned && 'badge-off')}>
                  <span className="badge-icon">
                    <Icon name={a.earned ? 'trophy' : 'lock'} size={18} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <strong>{a.title}</strong>
                    <span>{a.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </Screen>
  );
}

// -- public leaderboard -----------------------------------------------------------------------

export function Leaderboard() {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [age, setAge] = useState<AgeGroup | 'all'>('all');
  const q = useQuery<LeaderboardView>(`/api/leaderboard?period=${period}${age === 'all' ? '' : `&age=${age}`}`);
  const b = q.data;
  return (
    <Screen title="Leaderboard" back="/groups">
      <Segmented
        label="Period"
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'week', label: 'This week' },
          { value: 'month', label: 'This month' },
        ]}
      />
      <div className="wrap">
        <Chip selected={age === 'all'} onClick={() => setAge('all')}>
          All ages
        </Chip>
        {AGE_GROUPS.map((g) => (
          <Chip key={g} selected={age === g} onClick={() => setAge(g)}>
            {g}
          </Chip>
        ))}
      </div>
      {!b ? (
        q.error ? <ErrorNote error={q.error} retry={q.reload} /> : <Loading />
      ) : (
        <>
          <p className="small muted">
            Fewest hours of brain rot a day, after bonuses. {b.label}. Unlogged days count as each person's normal.
          </p>
          {!b.publicProfile ? (
            <Card tone="warn">
              <p className="small">You're hidden from this board. Turn it on in Settings to appear.</p>
            </Card>
          ) : null}
          <Card>
            {b.rows.length === 0 ? (
              <p className="muted">Nobody has logged yet this {period}.</p>
            ) : (
              b.rows.map((r) => (
                <div key={r.userId} className={cx('lb-row', r.isMe && 'lb-me')}>
                  <span className="lb-rank">{r.rank}</span>
                  <Avatar emoji={r.avatar} color={r.color} />
                  <div style={{ minWidth: 0 }}>
                    <div className="lb-name">
                      {r.name}
                      {r.isMe ? ' (you)' : ''}
                    </div>
                    <div className="tiny">
                      {r.ageGroup} · {r.loggedDays} of {r.days} days logged
                    </div>
                  </div>
                  <div className="lb-score">
                    {fmtMin(r.avgNetMin)}
                    <small>a day</small>
                  </div>
                </div>
              ))
            )}
            {b.me && !b.rows.some((r) => r.isMe) ? <p className="small" style={{ marginTop: 8 }}>You're {b.me.rank} of {b.total}.</p> : null}
          </Card>
          {b.hall.some((h) => h.winners.length) ? (
            <Section title={`Past ${period === 'week' ? 'weekly' : 'monthly'} winners`}>
              <Card>
                {b.hall
                  .filter((h) => h.winners.length)
                  .map((h) => (
                    <div className="list-item" key={h.id}>
                      <Avatar emoji={h.winners[0]!.avatar} color={h.winners[0]!.color} size={32} />
                      <div className="grow">
                        <div className="list-title">{h.winners[0]!.name}</div>
                        <div className="list-sub">
                          {period === 'week' ? `Week of ${dayMonth(h.start)}` : h.start.slice(0, 7)} · {fmtMin(h.winners[0]!.avgNetMin)} a day
                        </div>
                      </div>
                      <Icon name="trophy" className="ink-gold" />
                    </div>
                  ))}
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}

// -- about ---------------------------------------------------------------------------------

export function About() {
  return (
    <Screen title="How it works" back="/me">
      <Card>
        <div className="prose">
          <div className="brand">
            <BrainMark size={30} />
            <span className="wordmark">Unrot</span>
          </div>
          <h3>Brain rot time</h3>
          <p>
            Each morning you log yesterday's minutes on the apps you track, copied from your phone's Screen Time or Digital Wellbeing page, plus sleep, steps and four quick mood
            questions.
          </p>
          <ul>
            <li>
              Every 1,000 steps <strong>above your usual</strong> takes <strong>{CREDIT.STEP_MINUTES_PER_1000} minutes</strong> off that day. Your usual walking is already
              part of a normal day, so only the extra counts. Physical challenges take off a set amount by difficulty.
            </li>
            <li>
              Together they can cancel at most <strong>half</strong> of a day's brain rot, and never more than {fmtMin(CREDIT.DAILY_CAP_MIN)}. Otherwise a long walk would
              erase a whole day of scrolling, and the person who walks most would always win.
            </li>
            <li>A day you don't log counts as your normal. Skipping the bad days doesn't help.</li>
            <li>You can log today and yesterday. After that the day is final.</li>
          </ul>
          <h3>Groups</h3>
          <ul>
            <li>Rank by biggest % cut against each person's own normal, or by fewest hours a day.</li>
            <li>
              The level sets the target to win money:{' '}
              {GROUP_LEVELS.map((l) => `${l.name} ${l.pctTarget}%`).join(', ')}.
            </li>
            <li>The weekly buy-in is charged on Monday to everyone who joined by then. Join on a Monday and you're still in.</li>
            <li>
              Weeks settle on Tuesday ({SETTLE_AFTER_DAYS} days after Sunday) so everyone can log Sunday on Monday. Winners split the pot; part of every pot goes to a monthly
              jackpot. If nobody hits the target, the pot rolls over.
            </li>
          </ul>
          <h3>Deposits</h3>
          <p>
            Lock some money and promise to cut at least a number of hours against your normal over the next 7 or 30 days, starting tomorrow. Hit it and the money comes back.
            Miss it and it goes into your group's pot for the winners.
          </p>
          <h3>Money</h3>
          <p>
            <strong>All money in Unrot is simulated.</strong> Nothing is charged and nothing is paid out. The code has marked places where a real payment provider could plug in,
            which would need age checks, the right licences and app store approval first.
          </p>
          <h3>Health %</h3>
          <p>
            Physical and mental scores from your last 7 check-ins, against guidelines for your age, and a percentile against other users your age. A self-check, not a medical
            assessment.
          </p>
        </div>
      </Card>
    </Screen>
  );
}

export function CalculatorScreen() {
  return (
    <Screen title="Calculator" back="/me">
      <Calculator compact />
    </Screen>
  );
}
