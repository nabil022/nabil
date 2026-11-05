import { useEffect, useMemo, useState } from 'react';
import type { DayView, SaveLogResult } from '../../engine/ops/logs';
import { APPS, appName } from '../../shared/apps';
import { CREDIT } from '../../shared/balance';
import { addDays, shortDate } from '../../shared/dates';
import { fmtMin } from '../../shared/format';
import { creditFor, stepCredit, usualStepsOf } from '../../shared/scoring';
import { sleepMinutes } from '../../shared/sleep';
import type { LogDoc } from '../../shared/types';
import { useApp, useQuery } from '../lib/app';
import { useRouter } from '../lib/router';
import { Button, Card, Chip, ErrorNote, Field, Likert, Loading, MinutesInput, Screen, Section, Segmented } from '../ui/kit';

const LATE_OPTIONS = [0, 15, 30, 60, 90, 120];

interface Form {
  apps: Record<string, number>;
  lateNightMin: number | null;
  bedtime: string;
  wakeTime: string;
  steps: string;
  activeMin: string;
  mood: number | null;
  energy: number | null;
  focus: number | null;
  stress: number | null;
  lateHomework: boolean | null;
}

function fromLog(log: LogDoc | null, fallback: LogDoc | null, apps: string[]): Form {
  const src = log ?? null;
  return {
    apps: Object.fromEntries(apps.map((a) => [a, src?.apps[a] ?? 0])),
    lateNightMin: src?.lateNightMin ?? null,
    bedtime: src?.bedtime ?? fallback?.bedtime ?? '',
    wakeTime: src?.wakeTime ?? fallback?.wakeTime ?? '',
    steps: src?.steps != null ? String(src.steps) : '',
    activeMin: src?.activeMin != null ? String(src.activeMin) : '',
    mood: src?.mood ?? null,
    energy: src?.energy ?? null,
    focus: src?.focus ?? null,
    stress: src?.stress ?? null,
    lateHomework: src?.lateHomework ?? null,
  };
}

export function CheckIn({ date: dateParam }: { date?: string }) {
  const { me, mutate, toast } = useApp();
  const { go } = useRouter();
  const today = me!.today;
  const yesterday = addDays(today, -1);
  const q = useQuery<{ days: DayView[] }>(`/api/logs?from=${addDays(today, -3)}&to=${today}`);
  const days = q.data?.days;
  const logged = (d: string) => !!days?.find((x) => x.date === d)?.log;
  const [date, setDate] = useState<string | null>(dateParam === today || dateParam === yesterday ? dateParam : null);
  const chosen = date ?? (days ? (logged(yesterday) ? today : yesterday) : null);
  const apps = useMemo(() => {
    const set = new Set(me!.apps);
    const log = days?.find((x) => x.date === chosen)?.log;
    for (const a of Object.keys(log?.apps ?? {})) set.add(a);
    return APPS.map((a) => a.id).filter((id) => set.has(id));
  }, [me, days, chosen]);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!days || !chosen) return;
    const log = days.find((x) => x.date === chosen)?.log ?? null;
    const latest = [...days].reverse().find((x) => x.log && x.date !== chosen)?.log ?? null;
    setForm(fromLog(log, latest, apps));
    // Only reset when the day or the loaded data changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, chosen]);

  if (!days || !form || !chosen) {
    return <Screen title="Check in" back="/">{q.error ? <ErrorNote error={q.error} retry={q.reload} /> : <Loading />}</Screen>;
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const raw = Object.values(form.apps).reduce((a, b) => a + b, 0);
  const steps = form.steps === '' ? null : Number(form.steps);
  const challengeMin = days.find((x) => x.date === chosen)?.challengeCredit ?? 0;
  const usual = me!.baseline?.usualSteps ?? usualStepsOf(null);
  const credit = creditFor(raw, steps, usual, challengeMin);
  const sleep = sleepMinutes(form.bedtime || null, form.wakeTime || null);
  const base = me!.baseline?.perApp ?? {};

  const save = async () => {
    setBusy(true);
    const out = await mutate<SaveLogResult>('PUT', `/api/logs/${chosen}`, {
      apps: form.apps,
      lateNightMin: form.lateNightMin,
      bedtime: form.bedtime || null,
      wakeTime: form.wakeTime || null,
      steps,
      activeMin: form.activeMin === '' ? null : Number(form.activeMin),
      mood: form.mood,
      energy: form.energy,
      focus: form.focus,
      stress: form.stress,
      lateHomework: form.lateHomework,
    }, undefined);
    setBusy(false);
    if (out) {
      toast(out.xpGained > 0 ? `Saved. +${out.xpGained} XP` : 'Check-in updated', 'good');
      go('/', { replace: true });
    }
  };

  return (
    <Screen title="Check in" back="/">
      <Segmented
        label="Which day"
        value={chosen}
        onChange={(v) => setDate(v)}
        options={[
          { value: yesterday, label: `Yesterday${logged(yesterday) ? ' ✓' : ''}` },
          { value: today, label: `Today${logged(today) ? ' ✓' : ''}` },
        ]}
      />

      <Section title={`Screen time · ${shortDate(chosen)}`}>
        <Card>
          <p className="tiny" style={{ marginBottom: 6 }}>
            Copy each app's time from Screen Time (iPhone) or Digital Wellbeing (Android) for {chosen === today ? 'today so far' : 'yesterday'}.
          </p>
          {apps.map((id) => (
            <div className="app-row" key={id}>
              <span className="app-dot" style={{ background: APPS.find((a) => a.id === id)?.color }} aria-hidden />
              <span className="grow app-label">
                <span>{appName(id)}</span>
                {base[id] !== undefined ? <span className="tiny">normal {fmtMin(base[id]!)}</span> : null}
              </span>
              <MinutesInput id={`ci-${id}`} label={appName(id)} value={form.apps[id] ?? 0} onChange={(m) => set('apps', { ...form.apps, [id]: m })} />
            </div>
          ))}
          <hr className="divider" />
          <div className="kv">
            <span className="kv-k">Brain rot</span>
            <span className="kv-v">{fmtMin(raw)}</span>
          </div>
          {credit > 0 ? (
            <div className="kv">
              <span className="kv-k">Steps and challenges</span>
              <span className="kv-v ink-fresh">-{fmtMin(credit)}</span>
            </div>
          ) : null}
          <div className="kv">
            <span className="kv-k">
              <strong>Counts as</strong>
            </span>
            <span className="kv-v">{fmtMin(raw - credit)}</span>
          </div>
        </Card>
      </Section>

      <Section title={chosen === today ? 'Tonight' : 'Last night'}>
        <Card>
          <div className="stack" style={{ gap: 14 }}>
            <div className="grid-2">
              <Field label="Went to sleep" htmlFor="ci-bed">
                <input id="ci-bed" className="input" type="time" value={form.bedtime} onChange={(e) => set('bedtime', e.target.value)} />
              </Field>
              <Field label="Woke up" htmlFor="ci-wake">
                <input id="ci-wake" className="input" type="time" value={form.wakeTime} onChange={(e) => set('wakeTime', e.target.value)} />
              </Field>
            </div>
            {sleep !== null ? <p className="small muted">That's {fmtMin(sleep)} of sleep.</p> : null}
            <Field label={`Phone time after your ${me!.cutoff} cut-off`}>
              <div className="wrap">
                {LATE_OPTIONS.map((m) => (
                  <Chip key={m} selected={form.lateNightMin === m} onClick={() => set('lateNightMin', form.lateNightMin === m ? null : m)}>
                    {m === 0 ? 'None' : m >= 120 ? '2h+' : fmtMin(m)}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label="Homework after the cut-off?">
              <Segmented
                label="Homework after the cut-off"
                value={form.lateHomework === null ? '' : form.lateHomework ? 'yes' : 'no'}
                onChange={(v) => set('lateHomework', v === 'yes')}
                options={[
                  { value: 'no', label: 'No' },
                  { value: 'yes', label: 'Yes' },
                ]}
              />
            </Field>
          </div>
        </Card>
      </Section>

      <Section title="Body">
        <Card>
          <div className="grid-2">
            <Field
              label="Steps"
              htmlFor="ci-steps"
              hint={
                steps && stepCredit(steps, usual) > 0
                  ? `${fmtMin(stepCredit(steps, usual))} off for the steps above your usual ${usual.toLocaleString()}`
                  : `${CREDIT.STEP_MINUTES_PER_1000} min off per 1,000 above your usual ${usual.toLocaleString()}`
              }
            >
              <input id="ci-steps" className="input" inputMode="numeric" placeholder="e.g. 8200" value={form.steps} onChange={(e) => set('steps', e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </Field>
            <Field label="Active minutes" htmlFor="ci-active" hint="Sport, walking fast, training">
              <input id="ci-active" className="input" inputMode="numeric" placeholder="e.g. 40" value={form.activeMin} onChange={(e) => set('activeMin', e.target.value.replace(/\D/g, '').slice(0, 3))} />
            </Field>
          </div>
        </Card>
      </Section>

      <Section title="Mind">
        <Card>
          <div className="stack" style={{ gap: 16 }}>
            <Field label="Mood">
              <Likert label="Mood" value={form.mood} onChange={(v) => set('mood', v)} low="Awful" high="Great" />
            </Field>
            <Field label="Energy">
              <Likert label="Energy" value={form.energy} onChange={(v) => set('energy', v)} low="Drained" high="Full" />
            </Field>
            <Field label="Focus">
              <Likert label="Focus" value={form.focus} onChange={(v) => set('focus', v)} low="Scattered" high="Locked in" />
            </Field>
            <Field label="Stress">
              <Likert label="Stress" value={form.stress} onChange={(v) => set('stress', v)} low="Calm" high="Very stressed" />
            </Field>
          </div>
        </Card>
      </Section>

      <Button size="lg" block busy={busy} onClick={save}>
        Save check-in
      </Button>
    </Screen>
  );
}
