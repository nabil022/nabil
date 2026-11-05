import { useState } from 'react';
import type { GroupSummary } from '../../engine/ops/groups';
import type { LogDoc } from '../../shared/types';
import type { DayView } from '../../engine/ops/logs';
import type { PlannerView } from '../../engine/ops/planner';
import type { SleepResetSummary, SleepResetView } from '../../engine/ops/sleep';
import { CHECKIN } from '../../shared/balance';
import { addDays, datesBetween, dayName, formatHM, parseHM, shortDate } from '../../shared/dates';
import { fmtHours, fmtMin } from '../../shared/format';
import type { SleepMetrics } from '../../shared/sleep';
import { useApp, useQuery } from '../lib/app';
import { useRouter } from '../lib/router';
import { Timeline } from '../ui/charts';
import { Icon } from '../ui/icons';
import { Button, Card, Chip, Confirm, ErrorNote, Field, Loading, Pill, Screen, Section, Toggle, cx } from '../ui/kit';

function delta(a: number | null, b: number | null, fmt: (m: number) => string): string {
  if (a === null || b === null) return '-';
  const d = b - a;
  if (Math.round(d) === 0) return 'same';
  return `${d > 0 ? '+' : '-'}${fmt(Math.abs(d))}`;
}

export function Comparison({ before, after }: { before: SleepMetrics; after: SleepMetrics }) {
  const rows: [string, string, string, string][] = [
    ['Sleep', before.avgSleepMin === null ? '-' : fmtHours(before.avgSleepMin), after.avgSleepMin === null ? '-' : fmtHours(after.avgSleepMin), delta(before.avgSleepMin, after.avgSleepMin, fmtMin)],
    [
      'Phone after cut-off',
      before.avgLateMin === null ? '-' : fmtMin(before.avgLateMin),
      after.avgLateMin === null ? '-' : fmtMin(after.avgLateMin),
      delta(before.avgLateMin, after.avgLateMin, fmtMin),
    ],
    ['Bedtime', before.avgBedtimeMin === null ? '-' : formatHM(before.avgBedtimeMin), after.avgBedtimeMin === null ? '-' : formatHM(after.avgBedtimeMin), ''],
    [
      'Brain rot',
      before.avgBrainRotMin === null ? '-' : fmtMin(before.avgBrainRotMin),
      after.avgBrainRotMin === null ? '-' : fmtMin(after.avgBrainRotMin),
      delta(before.avgBrainRotMin, after.avgBrainRotMin, fmtMin),
    ],
    ['Nights cut-off kept', `${before.keptNights}`, `${after.keptNights}`, ''],
    ['Late homework nights', `${before.lateHomeworkNights}`, `${after.lateHomeworkNights}`, ''],
  ];
  return (
    <div className="compare">
      <span className="h">Average</span>
      <span className="h" style={{ textAlign: 'right' }}>
        Before
      </span>
      <span className="h" style={{ textAlign: 'right' }}>
        After
      </span>
      <span className="h" style={{ textAlign: 'right' }}>
        Change
      </span>
      {rows.map(([k, b, a, d]) => (
        <div key={k} style={{ display: 'contents' }}>
          <span>{k}</span>
          <span className="v">{b}</span>
          <span className="v">{a}</span>
          <span className="v muted">{d}</span>
        </div>
      ))}
    </div>
  );
}

function Nights({ s, logs }: { s: SleepResetSummary; logs: Map<string, LogDoc | null> }) {
  const dates = datesBetween(s.afterStart, s.afterEnd);
  return (
    <div className="nights">
      {dates.map((d) => {
        const log = logs.get(d);
        const kept = log && log.lateNightMin !== null && log.lateNightMin <= CHECKIN.CUTOFF_KEPT_MAX_MIN;
        const missed = log && log.lateNightMin !== null && !kept;
        return (
          <div className="night" key={d}>
            <span className={cx('night-dot', kept && 'night-kept', missed && 'night-missed')} aria-label={`${shortDate(d)}: ${kept ? 'cut-off kept' : missed ? `${log!.lateNightMin} minutes after cut-off` : 'not logged'}`}>
              {kept ? <Icon name="check" size={16} /> : missed ? <Icon name="close" size={14} /> : null}
            </span>
            {dayName(d).slice(0, 2)}
          </div>
        );
      })}
    </div>
  );
}

export function SleepReset() {
  const { me, mutate } = useApp();
  const { go } = useRouter();
  const q = useQuery<SleepResetView>('/api/sleep-reset');
  const groups = useQuery<GroupSummary[]>('/api/groups');
  const v = q.data;
  const cur = v?.current ?? null;
  const logsQ = useQuery<{ days: DayView[] }>(cur ? `/api/logs?from=${cur.beforeStart}&to=${cur.afterEnd}` : null);
  const [cutoff, setCutoff] = useState(me?.cutoff ?? '22:30');
  const [useRecent, setUseRecent] = useState(true);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [cancel, setCancel] = useState(false);
  if (!v) return <Screen title="Sleep Reset" back="/">{q.error ? <ErrorNote error={q.error} retry={q.reload} /> : <Loading />}</Screen>;
  const logs = new Map((logsQ.data?.days ?? []).map((d) => [d.date, d.log]));

  return (
    <Screen title="Sleep Reset" back="/">
      {cur ? (
        <>
          <Card tone="night">
            <div className="eyebrow">{cur.status === 'before' ? 'Week 1: your normal' : 'Week 2: the cut-off week'}</div>
            <div className="big-number" style={{ marginTop: 4 }}>
              Day {cur.day} of 7
            </div>
            <p className="card-sub" style={{ marginTop: 4 }}>
              {cur.status === 'before'
                ? 'Live as usual and check in every morning. This week is the "before" measurement.'
                : `Phone down at ${cur.cutoff} every night. Homework finishes an hour before. Check in every morning.`}
            </p>
            <div className="phase" style={{ marginTop: 12 }}>
              <div className={cx('phase-step', cur.status === 'before' && 'phase-now')}>
                <strong>Before</strong>
                {shortDate(cur.beforeStart)}
              </div>
              <div className={cx('phase-step', cur.status === 'challenge' && 'phase-now')}>
                <strong>Cut-off week</strong>
                {shortDate(cur.afterStart)}
              </div>
              <div className="phase-step">
                <strong>Results</strong>
                {shortDate(addDays(cur.afterEnd, 2))}
              </div>
            </div>
          </Card>

          {cur.status === 'challenge' ? (
            <Section title="Nights so far">
              <Card>
                <Nights s={cur} logs={logs} />
                <p className="tiny" style={{ marginTop: 10 }}>
                  A night counts as kept with {CHECKIN.CUTOFF_KEPT_MAX_MIN} minutes or less on the phone after {cur.cutoff}.
                </p>
              </Card>
            </Section>
          ) : null}

          <Section title="So far">
            <Card>
              <Comparison before={cur.comparison.before} after={cur.comparison.after} />
              <p className="tiny" style={{ marginTop: 10 }}>
                {cur.beforeLogged} of 7 "before" days and {cur.afterLogged} of 7 cut-off days logged.
              </p>
            </Card>
          </Section>

          <Section title="Make the cut-off stick">
            <Card>
              <div className="prose">
                <p>
                  <strong>iPhone:</strong> Settings › Screen Time › Downtime › Scheduled, from {cur.cutoff}.
                </p>
                <p>
                  <strong>Android:</strong> Settings › Digital Wellbeing › Bedtime mode, from {cur.cutoff}.
                </p>
                <p>Charge the phone outside your room and use a separate alarm.</p>
              </div>
            </Card>
            <Button variant="secondary" icon="book" onClick={() => go('/planner')}>
              Plan homework before the cut-off
            </Button>
          </Section>

          <Button variant="quiet" onClick={() => setCancel(true)}>
            Stop this Sleep Reset
          </Button>
          <Confirm open={cancel} title="Stop the Sleep Reset?" confirmLabel="Stop it" danger onClose={() => setCancel(false)} onConfirm={() => mutate('POST', '/api/sleep-reset/cancel', {}, 'Sleep Reset stopped')}>
            <p>Your check-ins stay. You can start a new one any time.</p>
          </Confirm>
        </>
      ) : (
        <>
          <Card tone="night">
            <Icon name="moon" size={30} />
            <h2 className="card-title" style={{ marginTop: 8 }}>
              One week to fix your nights
            </h2>
            <p className="card-sub" style={{ marginTop: 6 }}>
              A nightly screen cut-off, a study plan that keeps homework out of the late evening, and a short morning check-in. At the end you see your sleep and late-night
              screen time before and after.
            </p>
          </Card>
          <Card>
            <div className="stack" style={{ gap: 16 }}>
              <Field label="Nightly cut-off" htmlFor="sr-cutoff" hint="Teens need 8-10 hours. Count back from when you have to get up.">
                <input id="sr-cutoff" className="input" type="time" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
              </Field>
              {v.canUseRecentWeek ? (
                <Toggle
                  id="sr-recent"
                  checked={useRecent}
                  onChange={setUseRecent}
                  label="Use my last 7 days as the 'before' week"
                  detail={`You logged ${v.recentLogged} of them, so the cut-off week can start tonight.`}
                />
              ) : (
                <p className="small muted">First you track one normal week (the "before"), then the cut-off week starts. Log at least 5 days a week to skip ahead next time.</p>
              )}
              {groups.data?.length ? (
                <Field label="Do it with a group (optional)" hint="The group sees everyone's results together, anonymised as P1, P2…">
                  <div className="wrap">
                    <Chip selected={groupId === null} onClick={() => setGroupId(null)}>
                      Just me
                    </Chip>
                    {groups.data.map((g) => (
                      <Chip key={g.id} selected={groupId === g.id} onClick={() => setGroupId(g.id)}>
                        {g.emoji} {g.name}
                      </Chip>
                    ))}
                  </div>
                </Field>
              ) : null}
            </div>
          </Card>
          <Button
            size="lg"
            block
            onClick={() => mutate('POST', '/api/sleep-reset', { cutoff, useRecentWeek: v.canUseRecentWeek && useRecent, groupId }, 'Sleep Reset started')}
          >
            Start the Sleep Reset
          </Button>
        </>
      )}

      {v.history.length ? (
        <Section title="Finished">
          {v.history.map((h) => (
            <Card key={h.id}>
              <div className="row" style={{ marginBottom: 10 }}>
                <div className="grow">
                  <div className="card-title">
                    {shortDate(h.beforeStart)} to {shortDate(h.afterEnd)}
                  </div>
                  <div className="card-sub">
                    Cut-off {h.cutoff}
                    {h.groupName ? ` · with ${h.groupName}` : ''}
                  </div>
                </div>
                {h.comparison.sleepDeltaMin !== null && h.comparison.sleepDeltaMin > 0 ? (
                  <Pill tone="fresh" icon="up">
                    {fmtMin(h.comparison.sleepDeltaMin)} sleep
                  </Pill>
                ) : null}
              </div>
              <Comparison before={h.comparison.before} after={h.comparison.after} />
            </Card>
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

// -- planner --------------------------------------------------------------------------------

export function Planner() {
  const { mutate, me } = useApp();
  const q = useQuery<PlannerView>('/api/planner');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [due, setDue] = useState('');
  const [est, setEst] = useState(45);
  const [editing, setEditing] = useState(false);
  const p = q.data;
  if (!p) return <Screen title="Study planner" back="/sleep">{q.error ? <ErrorNote error={q.error} retry={q.reload} /> : <Loading />}</Screen>;
  const end = p.plan.studyEndMin;
  const tonight = p.plan.days[0];
  const lastBlockEnd = tonight?.blocks.length ? tonight.blocks[tonight.blocks.length - 1]!.endMin : null;
  const cutoffMin = parseHM(p.cutoff)!;
  const upcoming = p.plan.days.slice(1).filter((d) => d.blocks.length);
  const minDue = addDays(p.today, 1);

  return (
    <Screen title="Study planner" back="/sleep">
      <Card tone="night">
        <div className="eyebrow">Tonight</div>
        {tonight && tonight.blocks.length ? (
          <>
            <div className="big-number" style={{ marginTop: 4 }}>
              Done by {formatHM(lastBlockEnd!)}
            </div>
            <p className="card-sub">
              {fmtMin(((cutoffMin < 300 ? cutoffMin + 1440 : cutoffMin) - lastBlockEnd!))} before your {p.cutoff} cut-off.
            </p>
            <div style={{ margin: '12px 0 4px' }}>
              <Timeline blocks={tonight.blocks} fromMin={Math.min(tonight.windowStartMin, parseHM(p.studyStart)!)} toMin={cutoffMin < 300 ? cutoffMin + 1440 : cutoffMin} cutoffMin={cutoffMin < 300 ? cutoffMin + 1440 : cutoffMin} />
            </div>
            {tonight.blocks.map((b, i) => (
              <div className="block" key={i}>
                <span className="block-time">
                  {formatHM(b.startMin)}-{formatHM(b.endMin)}
                </span>
                <span className="grow" style={{ fontWeight: 600 }}>
                  {b.title}
                </span>
              </div>
            ))}
          </>
        ) : (
          <p className="card-title" style={{ marginTop: 4 }}>
            {p.open.length ? 'Nothing needed tonight.' : 'No homework planned.'}
          </p>
        )}
      </Card>

      {p.plan.risks.length ? (
        <Card tone="warn">
          <div className="card-title">Not enough time before it's due</div>
          {p.plan.risks.map((r) => (
            <p className="small" key={r.taskId} style={{ marginTop: 6 }}>
              <strong>{r.title}</strong>: {fmtMin(r.unscheduledMin)} won't fit before {shortDate(r.due)} without studying past {formatHM(end)}. Start earlier, split it, or ask for
              more time.
            </p>
          ))}
        </Card>
      ) : null}

      {upcoming.length ? (
        <Section title="Next days">
          <Card>
            {upcoming.map((d) => (
              <div key={d.date} style={{ padding: '6px 0' }}>
                <div className="eyebrow">{shortDate(d.date)}</div>
                {d.blocks.map((b, i) => (
                  <div className="block" key={i}>
                    <span className="block-time">
                      {formatHM(b.startMin)}-{formatHM(b.endMin)}
                    </span>
                    <span className="grow">{b.title}</span>
                  </div>
                ))}
              </div>
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title="Add homework">
        <Card>
          <div className="stack" style={{ gap: 12 }}>
            <Field label="What" htmlFor="t-title">
              <input id="t-title" className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Physics problem set" />
            </Field>
            <div className="grid-2">
              <Field label="Subject" htmlFor="t-subject">
                <input id="t-subject" className="input" maxLength={30} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Physics" />
              </Field>
              <Field label="Due" htmlFor="t-due">
                <input id="t-due" className="input" type="date" min={minDue} value={due} onChange={(e) => setDue(e.target.value)} />
              </Field>
            </div>
            <Field label="Time it needs">
              <div className="wrap">
                {[15, 30, 45, 60, 90, 120].map((m) => (
                  <Chip key={m} selected={est === m} onClick={() => setEst(m)}>
                    {fmtMin(m)}
                  </Chip>
                ))}
              </div>
            </Field>
            <Button
              disabled={!title.trim() || !due}
              onClick={async () => {
                const r = await mutate('POST', '/api/planner/tasks', { title, subject, due, estMin: est }, 'Added to the plan');
                if (r) {
                  setTitle('');
                  setSubject('');
                }
              }}
            >
              Add to plan
            </Button>
          </div>
        </Card>
      </Section>

      <Section title={`To do · ${p.open.length}`}>
        <Card>
          {p.open.length === 0 ? <p className="muted">All done.</p> : null}
          {[...p.open, ...p.done].map((t) => (
            <div className={cx('task', t.doneAt !== null && 'task-done')} key={t.id}>
              <button
                className="task-check"
                aria-label={t.doneAt !== null ? `Mark ${t.title} not done` : `Mark ${t.title} done`}
                onClick={() => mutate('PATCH', `/api/planner/tasks/${t.id}`, { done: t.doneAt === null })}
              >
                <Icon name="check" size={16} />
              </button>
              <div className="grow" style={{ flex: 1, minWidth: 0 }}>
                <div className="list-title">{t.title}</div>
                <div className="list-sub">
                  {t.subject ? `${t.subject} · ` : ''}due {shortDate(t.due)} · {fmtMin(t.estMin)}
                </div>
              </div>
              <button className="icon-btn" aria-label={`Delete ${t.title}`} onClick={() => mutate('DELETE', `/api/planner/tasks/${t.id}`)}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </Card>
      </Section>

      <Card>
        <div className="row">
          <div className="grow">
            <div className="card-title">Study window</div>
            <div className="card-sub">
              {p.studyStart} to {formatHM(end)} ({p.bufferMin} min before your {p.cutoff} cut-off), up to {fmtMin(p.maxDailyMin)} a day
            </div>
          </div>
          <Button variant="secondary" size="sm" icon="edit" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      </Card>
      {editing ? <WindowSheet p={p} meCutoff={me!.cutoff} onClose={() => setEditing(false)} /> : null}
    </Screen>
  );
}

function WindowSheet({ p, meCutoff, onClose }: { p: PlannerView; meCutoff: string; onClose: () => void }) {
  const { mutate } = useApp();
  const [studyStart, setStudyStart] = useState(p.studyStart);
  const [cutoff, setCutoff] = useState(meCutoff);
  const [buffer, setBuffer] = useState(p.bufferMin);
  const [max, setMax] = useState(p.maxDailyMin);
  return (
    <Confirm
      open
      title="Study window"
      confirmLabel="Save"
      onClose={onClose}
      onConfirm={() => mutate('PATCH', '/api/me', { studyStart, cutoff, studyBufferMin: buffer, studyMaxMin: max }, 'Saved')}
    >
      <div className="stack" style={{ gap: 12 }}>
        <div className="grid-2">
          <Field label="Start studying" htmlFor="w-start">
            <input id="w-start" className="input" type="time" value={studyStart} onChange={(e) => setStudyStart(e.target.value)} />
          </Field>
          <Field label="Screen cut-off" htmlFor="w-cutoff">
            <input id="w-cutoff" className="input" type="time" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
          </Field>
        </div>
        <Field label="Stop studying before the cut-off">
          <div className="wrap">
            {[30, 60, 90].map((m) => (
              <Chip key={m} selected={buffer === m} onClick={() => setBuffer(m)}>
                {fmtMin(m)}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Most study in a day">
          <div className="wrap">
            {[60, 120, 180, 240].map((m) => (
              <Chip key={m} selected={max === m} onClick={() => setMax(m)}>
                {fmtMin(m)}
              </Chip>
            ))}
          </div>
        </Field>
      </div>
    </Confirm>
  );
}
