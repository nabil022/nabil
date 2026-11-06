import { useEffect, useState } from 'react';
import type { GroupDetail, GroupSummary, JoinResult, PeriodView } from '../../engine/ops/groups';
import { APPS, DEFAULT_GROUP_APPS, appName } from '../../shared/apps';
import { GROUP_LEVELS, MONEY } from '../../shared/balance';
import { fmtCut, fmtHours, fmtMin, ordinal } from '../../shared/format';
import { formatCents } from '../../shared/money';
import { GROUP_EMOJIS } from '../../shared/profile';
import type { FeedDoc, StandingRow } from '../../shared/types';
import { STANDALONE, useApp, useQuery } from '../lib/app';
import { Link, useRouter } from '../lib/router';
import { storage } from '../lib/storage';
import { Icon, type IconName } from '../ui/icons';
import {
  Avatar,
  Button,
  Card,
  Chip,
  Confirm,
  CopyButton,
  Empty,
  ErrorNote,
  Field,
  IconButton,
  Loading,
  Meter,
  Pill,
  Screen,
  Section,
  Segmented,
  Stepper,
  Toggle,
  cx,
} from '../ui/kit';

// -- list ---------------------------------------------------------------------------

/**
 * The Android app keeps everything on the phone for now. Groups need one
 * online server that every friend's phone shares, so this says so instead.
 */
export function PhoneGroups() {
  return (
    <Screen title="Groups">
      <Empty icon="groups" title="Groups need an online server">
        Groups put you and your friends on one leaderboard, with weekly and monthly winners and a pot. Every phone in the group has to share one online server for that, and Unrot doesn't have one yet.
      </Empty>
      <Card>
        <div className="stack" style={{ gap: 6 }}>
          <div className="card-title">Everything else works now</div>
          <p className="card-sub">Tracking, check-ins, challenges, deposits, health and the Sleep Reset all work on your own, and everything is saved on this phone.</p>
        </div>
      </Card>
    </Screen>
  );
}

export function Groups() {
  const { mutate } = useApp();
  const { go } = useRouter();
  const q = useQuery<GroupSummary[]>('/api/groups');
  const [code, setCode] = useState('');
  const join = async () => {
    const r = await mutate<JoinResult>('POST', '/api/groups/join', { code });
    if (r) {
      setCode('');
      go(r.needsBaseline.length ? `/settings/baseline?then=/groups/${r.groupId}` : `/groups/${r.groupId}`);
    }
  };
  return (
    <Screen title="Groups" action={<IconButton icon="plus" label="Create a group" onClick={() => go('/groups/new')} />}>
      {q.error ? <ErrorNote error={q.error} retry={q.reload} /> : null}
      {!q.data ? (
        <Loading />
      ) : q.data.length === 0 ? (
        <Empty icon="groups" title="No groups yet" action={<Button onClick={() => go('/groups/new')}>Create a group</Button>}>
          Make one for your friends or your class, then share the invite code. Each week, the biggest cut wins.
        </Empty>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {q.data.map((g) => (
            <Card key={g.id} onClick={() => go(`/groups/${g.id}`)}>
              <div className="row">
                <span className="avatar" style={{ width: 46, height: 46, background: 'var(--surface-2)', fontSize: 24 }} aria-hidden>
                  {g.emoji}
                </span>
                <div className="grow">
                  <div className="card-title">{g.name}</div>
                  <div className="card-sub">
                    {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'} · {g.level.name} · {g.scoring === 'percent' ? 'biggest % cut' : 'fewest hours'}
                  </div>
                  <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {g.rank ? <Pill tone="brand">You're {ordinal(g.rank)}</Pill> : <Pill>Not ranked yet</Pill>}
                    {g.leader ? <Pill>Leader: {g.leader.name}</Pill> : null}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="ink-gold" style={{ fontWeight: 800, fontSize: 18 }}>
                    {formatCents(g.potCents)}
                  </div>
                  <div className="tiny">pot</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Section title="Join with a code">
        <Card>
          <div className="row">
            <input
              className="input grow"
              aria-label="Invite code"
              placeholder="e.g. K7P2QX"
              value={code}
              maxLength={8}
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              style={{ letterSpacing: '0.12em', fontWeight: 700 }}
            />
            <Button onClick={join} disabled={code.length < 6}>
              Join
            </Button>
          </div>
        </Card>
      </Section>
      <Card onClick={() => go('/leaderboard')}>
        <div className="row">
          <Icon name="globe" size={24} className="ink-night" />
          <div className="grow">
            <div className="card-title">Public leaderboard</div>
            <div className="card-sub">Fewest hours of brain rot, everyone, by age group.</div>
          </div>
          <Icon name="next" />
        </div>
      </Card>
    </Screen>
  );
}

// -- create / edit form ----------------------------------------------------------------

export interface GroupForm {
  name: string;
  emoji: string;
  scoring: 'percent' | 'hours';
  level: 1 | 2 | 3 | 4;
  apps: string[];
  countCredits: boolean;
  buyInCents: number;
  payout: 'winner' | 'top3';
  monthlySharePct: number;
}

export function GroupFormFields({ form, setForm }: { form: GroupForm; setForm: (f: GroupForm) => void }) {
  const set = <K extends keyof GroupForm>(k: K, v: GroupForm[K]) => setForm({ ...form, [k]: v });
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Field label="Name" htmlFor="g-name">
        <input id="g-name" className="input" maxLength={40} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Rot Squad" />
      </Field>
      <Field label="Icon">
        <div className="emoji-grid">
          {GROUP_EMOJIS.map((e) => (
            <button key={e} type="button" className={cx('emoji-btn', form.emoji === e && 'emoji-on')} onClick={() => set('emoji', e)} aria-pressed={form.emoji === e} aria-label={`Icon ${e}`}>
              {e}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Who wins" hint={form.scoring === 'percent' ? 'Ranked by % cut against each person\'s own normal. Fair when people start in different places.' : 'Ranked by fewest hours a day.'}>
        <Segmented
          label="Scoring"
          value={form.scoring}
          onChange={(v) => set('scoring', v)}
          options={[
            { value: 'percent', label: 'Biggest % cut' },
            { value: 'hours', label: 'Fewest hours' },
          ]}
        />
      </Field>
      <Field label="Level" hint="The target you must hit to win money. Missing it means you play for XP only that week.">
        <div className="level-card">
          {GROUP_LEVELS.map((l) => (
            <button key={l.level} type="button" className={cx('level-option', form.level === l.level && 'level-on')} onClick={() => set('level', l.level)} aria-pressed={form.level === l.level}>
              <strong>
                {l.level}. {l.name}
              </strong>
              <span>{form.scoring === 'percent' ? `Cut at least ${l.pctTarget}%` : `Under ${fmtMin(l.dailyCapMin)} a day`}</span>
            </button>
          ))}
        </div>
      </Field>
      <Field label="Apps that count">
        <div className="wrap">
          {APPS.map((a) => (
            <Chip key={a.id} selected={form.apps.includes(a.id)} onClick={() => set('apps', form.apps.includes(a.id) ? form.apps.filter((x) => x !== a.id) : [...form.apps, a.id])}>
              {a.name}
            </Chip>
          ))}
        </div>
      </Field>
      <Toggle
        id="g-credits"
        checked={form.countCredits}
        onChange={(v) => set('countCredits', v)}
        label="Steps and challenges count"
        detail="Minutes earned from steps and challenges come off scores in this group."
      />
      <hr className="divider" />
      <Field label="Weekly buy-in" hint="Charged to everyone in the running each Monday (simulated money). $0 plays for XP and glory.">
        <Stepper value={form.buyInCents} onChange={(v) => set('buyInCents', v)} step={100} min={0} max={MONEY.MAX_BUYIN_CENTS} format={(c) => (c === 0 ? 'Free' : formatCents(c))} label="buy-in" />
      </Field>
      <Field label="Payout">
        <Segmented
          label="Payout"
          value={form.payout}
          onChange={(v) => set('payout', v)}
          options={[
            { value: 'winner', label: 'Winner takes all' },
            { value: 'top3', label: 'Top 3: 60/30/10' },
          ]}
        />
      </Field>
      <Field label="Monthly jackpot" hint="This share of every weekly pot is saved for the month's overall winner.">
        <Stepper value={form.monthlySharePct} onChange={(v) => set('monthlySharePct', v)} step={5} min={0} max={MONEY.MAX_MONTHLY_SHARE_PCT} format={(n) => `${n}%`} label="monthly share" />
      </Field>
    </div>
  );
}

export function GroupNew() {
  const { me, mutate } = useApp();
  const { go } = useRouter();
  const [form, setForm] = useState<GroupForm>({
    name: '',
    emoji: GROUP_EMOJIS[0]!,
    scoring: 'percent',
    level: 2,
    apps: me?.apps.length ? [...me.apps] : [...DEFAULT_GROUP_APPS],
    countCredits: true,
    buyInCents: 500,
    payout: 'winner',
    monthlySharePct: MONEY.DEFAULT_MONTHLY_SHARE_PCT,
  });
  const [busy, setBusy] = useState(false);
  return (
    <Screen title="New group" back="/groups">
      <Card>
        <GroupFormFields form={form} setForm={setForm} />
      </Card>
      <Button
        size="lg"
        block
        busy={busy}
        disabled={!form.name.trim() || form.apps.length === 0}
        onClick={async () => {
          setBusy(true);
          const r = await mutate<JoinResult>('POST', '/api/groups', form, 'Group created');
          setBusy(false);
          if (r) go(r.needsBaseline.length ? `/settings/baseline?then=/groups/${r.groupId}` : `/groups/${r.groupId}`, { replace: true });
        }}
      >
        Create group
      </Button>
    </Screen>
  );
}

// -- detail ----------------------------------------------------------------------------

const FEED_ICON: Record<FeedDoc['type'], IconName> = {
  joined: 'groups',
  left: 'logout',
  removed: 'logout',
  created: 'sparkle',
  challenge: 'bolt',
  deposit_lost: 'coin',
  deposit_kept: 'coin',
  week_result: 'trophy',
  month_result: 'trophy',
  buyin: 'coin',
  nudge: 'bell',
  streak: 'flame',
  level_up: 'sparkle',
  sleep_reset: 'moon',
  settings: 'sliders',
};

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function inviteLink(code: string): string {
  if (STANDALONE) return code;
  return `${window.location.origin}${window.location.pathname}#/join/${code}`;
}

function Board({ g, period, meId }: { g: GroupDetail; period: PeriodView; meId: string }) {
  const { mutate } = useApp();
  const lvl = g.level;
  const target = g.scoring === 'percent' ? lvl.pctTarget : lvl.dailyCapMin;
  return (
    <div className="list">
      {period.rows.map((r) => {
        const member = g.members.find((m) => m.userId === r.userId);
        const noCheckin = member && !member.checkedInYesterday;
        const score = g.scoring === 'percent' ? fmtCut(r.pctCut) : `${fmtMin(r.avgNetMin)}`;
        // Fills up as you approach the level's target; full once it is hit.
        const progress =
          g.scoring === 'percent' ? Math.min(target, Math.max(0, r.pctCut)) : Math.min(target, Math.max(0, target * 2 - r.avgNetMin));
        return (
          <div key={r.userId} className={cx('lb-row', r.userId === meId && 'lb-me')}>
            <span className="lb-rank">{r.days > 0 ? r.rank : '-'}</span>
            <Avatar emoji={r.avatar} color={r.color} />
            <div style={{ minWidth: 0 }}>
              <div className="lb-name">
                {r.name}
                {r.userId === meId ? ' (you)' : ''}
              </div>
              <div className="lb-meta">
                {r.metTarget ? (
                  <Pill tone="fresh" icon="check">
                    Target hit
                  </Pill>
                ) : null}
                {!r.entered && period.kind === 'week' ? <Pill>Not in the pot</Pill> : null}
                {r.measuredDays ? (
                  <Pill tone="night" icon="phone">
                    {r.measuredDays >= r.loggedDays ? 'Auto-tracked' : `${r.measuredDays}/${r.loggedDays} auto`}
                  </Pill>
                ) : null}
                {r.days > 0 && r.loggedDays < r.days ? <span className="tiny">{r.days - r.loggedDays} unlogged</span> : null}
                {noCheckin && r.userId !== meId ? (
                  <button className="pill pill-night" style={{ border: 0, cursor: 'pointer' }} onClick={() => mutate('POST', `/api/groups/${g.id}/nudge/${r.userId}`, {}, `Nudged ${r.name}`)}>
                    <Icon name="bell" size={13} /> Nudge
                  </button>
                ) : null}
              </div>
              <div style={{ marginTop: 6, maxWidth: 220 }}>
                <Meter value={progress} max={target} tone={r.metTarget ? 'fresh' : 'brand'} label={`${r.name}: progress to the target`} />
              </div>
            </div>
            <div className="lb-score">
              {r.days > 0 ? score : '-'}
              <small>{g.scoring === 'percent' ? `${fmtMin(r.avgNetMin)}/day` : 'a day'}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Tab = 'week' | 'month' | 'history' | 'feed' | 'study';

export function GroupDetailScreen({ id }: { id: string }) {
  const { me, mutate } = useApp();
  const { go } = useRouter();
  const q = useQuery<GroupDetail>(`/api/groups/${id}`);
  const [tab, setTab] = useState<Tab>('week');
  const [leaving, setLeaving] = useState(false);
  const g = q.data;
  if (!g) {
    return (
      <Screen title="Group" back="/groups">
        {q.error ? <ErrorNote error={q.error} retry={q.reload} /> : <Loading />}
      </Screen>
    );
  }
  const admin = g.myRole !== 'member';
  const period = tab === 'month' ? g.month : g.week;
  const study = g.study;
  const tabs: { value: Tab; label: string }[] = [
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'history', label: 'Winners' },
    { value: 'feed', label: 'Feed' },
  ];
  if (study.participants > 0) tabs.push({ value: 'study', label: 'Study' });

  return (
    <Screen
      title={`${g.emoji} ${g.name}`}
      back="/groups"
      action={admin ? <IconButton icon="sliders" label="Group settings" onClick={() => go(`/groups/${g.id}/settings`)} /> : null}
    >
      <Segmented label="Group view" value={tab} onChange={setTab} options={tabs} />

      {tab === 'week' || tab === 'month' ? (
        <>
          <Card tone="gold">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="eyebrow">{period.label}</div>
                <div className="big-number" style={{ marginTop: 4 }}>
                  {formatCents(period.potCents)}
                </div>
                <div className="card-sub">
                  {tab === 'week'
                    ? `${g.buyInCents > 0 ? `${formatCents(g.buyInCents)} buy-in · ` : ''}${g.payout === 'top3' ? 'top 3 paid' : 'winner takes all'}`
                    : 'Monthly jackpot · winner takes all'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, fontSize: 20 }}>{period.daysLeft === 0 ? 'Last day' : `${period.daysLeft}d`}</div>
                <div className="tiny">{period.daysLeft === 0 ? 'results soon' : 'left'}</div>
              </div>
            </div>
            <hr className="divider" style={{ margin: '12px 0 8px' }} />
            <p className="small">
              <strong>Level {g.level.level}, {g.level.name}:</strong>{' '}
              {g.scoring === 'percent' ? `cut at least ${g.level.pctTarget}% against your normal to win.` : `average under ${fmtMin(g.level.dailyCapMin)} a day to win.`} Unlogged days count as your normal.
            </p>
          </Card>
          <Card>
            <Board g={g} period={period} meId={me!.id} />
          </Card>
        </>
      ) : null}

      {tab === 'history' ? (
        g.history.length === 0 ? (
          <Empty icon="trophy" title="No results yet">
            The first week settles on Tuesday, once everyone has had Monday to log Sunday.
          </Empty>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {g.history.map((h) => (
              <Card key={`${h.kind}-${h.start}`}>
                <div className="row" style={{ marginBottom: 8 }}>
                  <div className="grow">
                    <div className="card-title">{h.label}</div>
                    <div className="card-sub">
                      {h.kind === 'month' ? 'Monthly jackpot' : 'Week'} · pot {formatCents(h.potCents)}
                      {h.monthShareCents ? ` · ${formatCents(h.monthShareCents)} to the jackpot` : ''}
                    </div>
                  </div>
                  <Icon name="trophy" className="ink-gold" />
                </div>
                {h.winners.length ? (
                  h.winners.map((w: StandingRow) => (
                    <div className="row" key={w.userId} style={{ padding: '6px 0' }}>
                      <span className="lb-rank">{ordinal(w.place ?? w.rank)}</span>
                      <Avatar emoji={w.avatar} color={w.color} size={30} />
                      <span className="grow" style={{ fontWeight: 700 }}>
                        {w.name}
                      </span>
                      <span className="muted small">{g.scoring === 'percent' ? fmtCut(w.pctCut) : `${fmtMin(w.avgNetMin)}/day`}</span>
                      <strong className="ink-gold">{w.prizeCents ? formatCents(w.prizeCents) : ''}</strong>
                    </div>
                  ))
                ) : (
                  <p className="small muted">Nobody hit the target{h.rolloverCents ? `, so ${formatCents(h.rolloverCents)} rolled over` : ''}.</p>
                )}
              </Card>
            ))}
          </div>
        )
      ) : null}

      {tab === 'feed' ? (
        <Card>
          {g.feed.length === 0 ? (
            <p className="muted">Nothing yet.</p>
          ) : (
            g.feed.map((f) => (
              <div className="feed-item" key={f.id}>
                <span className="feed-icon">
                  <Icon name={FEED_ICON[f.type]} size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div>{f.text}</div>
                  <div className="feed-time">{ago(f.createdAt)}</div>
                </div>
              </div>
            ))
          )}
        </Card>
      ) : null}

      {tab === 'study' ? <StudyPanel g={g} /> : null}

      <Section title="Invite friends">
        <Card>
          <p className="small muted" style={{ marginBottom: 10 }}>
            {STANDALONE ? 'Share this code. Friends enter it under Groups › Join with a code.' : 'Share the code or the link. Anyone with it can join.'}
          </p>
          <div className="code-box">
            <span className="code">{g.inviteCode}</span>
            <CopyButton text={inviteLink(g.inviteCode)} label={STANDALONE ? 'Copy code' : 'Copy link'} />
          </div>
        </Card>
      </Section>

      <Section title={`Members · ${g.members.length}`}>
        <Card>
          <div className="list">
            {g.members.map((m) => (
              <div className="list-item" key={m.userId}>
                <Avatar emoji={m.avatar} color={m.color} />
                <div className="grow">
                  <div className="list-title">
                    {m.name} {m.role !== 'member' ? <Pill tone={m.role === 'owner' ? 'brand' : 'night'}>{m.role}</Pill> : null}
                  </div>
                  <div className="list-sub">Normal: {fmtMin(m.baselineDailyMin)} a day on these apps</div>
                </div>
                {m.checkedInYesterday ? <Icon name="check" className="ink-fresh" label="Checked in yesterday" /> : null}
              </div>
            ))}
          </div>
          <p className="tiny" style={{ marginTop: 8 }}>
            Everyone's normal is visible so nobody can pad theirs. Counted apps: {g.apps.map(appName).join(', ')}.
          </p>
        </Card>
      </Section>

      <Button variant="quiet" icon="logout" onClick={() => setLeaving(true)}>
        Leave group
      </Button>
      <Confirm
        open={leaving}
        title={`Leave ${g.name}?`}
        confirmLabel="Leave"
        danger
        onClose={() => setLeaving(false)}
        onConfirm={async () => {
          const r = await mutate<{ deleted: boolean }>('POST', `/api/groups/${g.id}/leave`, {}, 'You left the group');
          if (r) go('/groups', { replace: true });
        }}
      >
        <p>Your buy-in for this week stays in the pot.{g.myRole === 'owner' ? ' The group passes to an admin, or the longest-standing member.' : ''}</p>
      </Confirm>
    </Screen>
  );
}

function StudyPanel({ g }: { g: GroupDetail }) {
  const s = g.study;
  const signed = (m: number | null, unit: 'min' | 'hours') =>
    m === null ? '-' : `${m >= 0 ? '+' : '-'}${unit === 'hours' ? fmtHours(Math.abs(m)) : fmtMin(Math.abs(m))}`;
  const csv = [
    'participant,status,before_sleep_h,after_sleep_h,before_late_min,after_late_min,before_brainrot_min,after_brainrot_min,before_kept_nights,after_kept_nights',
    ...s.rows.map((r) =>
      [
        r.participant,
        r.status,
        r.before.avgSleepMin === null ? '' : (r.before.avgSleepMin / 60).toFixed(2),
        r.after.avgSleepMin === null ? '' : (r.after.avgSleepMin / 60).toFixed(2),
        r.before.avgLateMin?.toFixed(0) ?? '',
        r.after.avgLateMin?.toFixed(0) ?? '',
        r.before.avgBrainRotMin?.toFixed(0) ?? '',
        r.after.avgBrainRotMin?.toFixed(0) ?? '',
        r.before.keptNights,
        r.after.keptNights,
      ].join(','),
    ),
  ].join('\n');
  return (
    <>
      <Card tone="night">
        <div className="eyebrow">Sleep Reset study</div>
        <div className="card-title" style={{ marginTop: 4 }}>
          {s.completed} of {s.participants} finished both weeks
        </div>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <div className="stat">
            <div className="stat-label">Sleep, average change</div>
            <div className="stat-value">{signed(s.avgSleepDeltaMin, 'min')}</div>
            <div className="stat-sub">a night</div>
          </div>
          <div className="stat">
            <div className="stat-label">Phone after cut-off</div>
            <div className="stat-value">{signed(s.avgLateDeltaMin, 'min')}</div>
            <div className="stat-sub">a night</div>
          </div>
          <div className="stat">
            <div className="stat-label">Brain rot</div>
            <div className="stat-value">{signed(s.avgBrainRotDeltaMin, 'min')}</div>
            <div className="stat-sub">a day</div>
          </div>
          <div className="stat">
            <div className="stat-label">Slept more after</div>
            <div className="stat-value">{s.improvedSleepPct === null ? '-' : `${s.improvedSleepPct}%`}</div>
            <div className="stat-sub">of finishers</div>
          </div>
        </div>
      </Card>
      <Card>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Who</th>
                <th>Sleep before</th>
                <th>After</th>
                <th>Late before</th>
                <th>After</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.participant}>
                  <td>
                    {r.participant}
                    {r.isMe ? ' (you)' : ''}
                  </td>
                  <td>{r.before.avgSleepMin === null ? '-' : fmtHours(r.before.avgSleepMin)}</td>
                  <td>{r.after.avgSleepMin === null ? '-' : fmtHours(r.after.avgSleepMin)}</td>
                  <td>{r.before.avgLateMin === null ? '-' : fmtMin(r.before.avgLateMin)}</td>
                  <td>{r.after.avgLateMin === null ? '-' : fmtMin(r.after.avgLateMin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny" style={{ margin: '10px 0' }}>
          Participants are numbered, not named. Before = a normal week, after = the cut-off week.
        </p>
        <CopyButton text={csv} label="Copy results as CSV" />
      </Card>
    </>
  );
}

// -- settings ----------------------------------------------------------------------------

export function GroupSettings({ id }: { id: string }) {
  const { me, mutate } = useApp();
  const { go } = useRouter();
  const q = useQuery<GroupDetail>(`/api/groups/${id}`);
  const [form, setForm] = useState<GroupForm | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const g = q.data;
  useEffect(() => {
    if (g && !form) {
      setForm({
        name: g.name,
        emoji: g.emoji,
        scoring: g.scoring,
        level: g.level.level,
        apps: g.apps,
        countCredits: g.countCredits,
        buyInCents: g.buyInCents,
        payout: g.payout,
        monthlySharePct: g.monthlySharePct,
      });
    }
  }, [g, form]);
  if (!g || !form) return <Screen title="Group settings" back={`/groups/${id}`}>{q.error ? <ErrorNote error={q.error} /> : <Loading />}</Screen>;
  const owner = g.myRole === 'owner';
  return (
    <Screen title="Group settings" back={`/groups/${id}`}>
      <Card>
        <GroupFormFields form={form} setForm={setForm} />
      </Card>
      <p className="tiny">Changes show up in the group feed. A new buy-in applies from next Monday.</p>
      <Button
        size="lg"
        block
        busy={busy}
        onClick={async () => {
          setBusy(true);
          const r = await mutate('PATCH', `/api/groups/${id}`, form, 'Saved');
          setBusy(false);
          if (r) go(`/groups/${id}`, { replace: true });
        }}
      >
        Save changes
      </Button>

      <Section title="Invite code">
        <Card>
          <div className="code-box">
            <span className="code">{g.inviteCode}</span>
            <Button variant="secondary" size="sm" icon="refresh" onClick={() => mutate('POST', `/api/groups/${id}/invite`, {}, 'New code made. The old one stops working.')}>
              New code
            </Button>
          </div>
        </Card>
      </Section>

      <Section title="Members">
        <Card>
          <div className="list">
            {g.members.map((m) => (
              <div className="list-item" key={m.userId}>
                <Avatar emoji={m.avatar} color={m.color} />
                <div className="grow">
                  <div className="list-title">{m.name}</div>
                  <div className="list-sub">{m.role}</div>
                </div>
                {owner && m.userId !== me!.id ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => mutate('POST', `/api/groups/${id}/members/${m.userId}/role`, { role: m.role === 'admin' ? 'member' : 'admin' }, 'Role changed')}
                  >
                    {m.role === 'admin' ? 'Make member' : 'Make admin'}
                  </Button>
                ) : null}
                {m.role !== 'owner' && m.userId !== me!.id && (owner || m.role === 'member') ? (
                  <IconButton icon="trash" label={`Remove ${m.name}`} onClick={() => mutate('DELETE', `/api/groups/${id}/members/${m.userId}`, undefined, `${m.name} removed`)} />
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      </Section>

      {owner ? (
        <>
          <Button variant="quiet" icon="trash" onClick={() => setDeleting(true)}>
            Delete group
          </Button>
          <Confirm
            open={deleting}
            title={`Delete ${g.name}?`}
            confirmLabel="Delete for everyone"
            danger
            onClose={() => setDeleting(false)}
            onConfirm={async () => {
              const r = await mutate('DELETE', `/api/groups/${id}`, undefined, 'Group deleted');
              if (r) go('/groups', { replace: true });
            }}
          >
            <p>Money in this week's pot and the monthly jackpot is shared equally among the members. History and the feed are deleted.</p>
          </Confirm>
        </>
      ) : null}
    </Screen>
  );
}

// -- join link --------------------------------------------------------------------------------

export function Join({ code }: { code: string }) {
  const { me, mutate } = useApp();
  const { go } = useRouter();
  const [state, setState] = useState<'idle' | 'joining' | 'failed'>('idle');
  useEffect(() => {
    if (!me) {
      storage.set('unrot.pendingJoin', code);
      go('/register', { replace: true });
      return;
    }
    if (state !== 'idle') return;
    setState('joining');
    void mutate<JoinResult>('POST', '/api/groups/join', { code }).then((r) => {
      storage.set('unrot.pendingJoin', null);
      if (r) go(r.needsBaseline.length ? `/settings/baseline?then=/groups/${r.groupId}` : `/groups/${r.groupId}`, { replace: true });
      else setState('failed');
    });
  }, [me, code, go, mutate, state]);
  return (
    <Screen title="Joining group" back="/groups">
      {state === 'failed' ? (
        <Empty icon="groups" title="Could not join" action={<Link to="/groups" className="btn btn-primary btn-md">Go to groups</Link>}>
          Check the code with whoever sent it.
        </Empty>
      ) : (
        <Loading label={`Joining ${code}`} />
      )}
    </Screen>
  );
}
