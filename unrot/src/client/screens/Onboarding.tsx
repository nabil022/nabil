import { useState } from 'react';
import type { Me } from '../../engine/ops/account';
import { APPS, appName } from '../../shared/apps';
import { fmtMin } from '../../shared/format';
import { verdict } from '../../shared/scoring';
import { useApp } from '../lib/app';
import { IS_NATIVE, UsageStats, onResume } from '../lib/native';
import { useRouter } from '../lib/router';
import { storage } from '../lib/storage';
import { measuredBaseline } from '../lib/tracking';
import { BrainMark, Icon } from '../ui/icons';
import { Button, Card, Chip, Field, MinutesInput, Stepper } from '../ui/kit';
import { useEffect } from 'react';

const STEPS = ['Apps', 'Your normal', 'Goals'];

/** `stepOffset`/`totalSteps`: where these steps sit when a setup came before them (Android). */
export function Onboarding({ stepOffset = 0, totalSteps = STEPS.length }: { stepOffset?: number; totalSteps?: number } = {}) {
  const { me, api, setMe, toast, refresh } = useApp();
  const { go } = useRouter();
  const [step, setStep] = useState(0);
  const [apps, setApps] = useState<string[]>(me?.apps ?? ['tiktok', 'instagram', 'youtube', 'snapchat']);
  const [baseline, setBaseline] = useState<Record<string, number>>(() => ({ ...(me?.baseline?.perApp ?? {}) }));
  const [cutoff, setCutoff] = useState(me?.cutoff ?? '22:30');
  const [usualSteps, setUsualSteps] = useState(String(me?.baseline?.usualSteps ?? ''));
  const [goalPct, setGoalPct] = useState(30);
  const [busy, setBusy] = useState(false);
  const [measuredDays, setMeasuredDays] = useState<number | null>(null);
  const [waiting, setWaiting] = useState(false);
  const total = apps.reduce((a, id) => a + (baseline[id] ?? 0), 0);

  // Android: fill "your normal" from the phone's last week.
  const measureNow = async () => {
    if (!me) return;
    const { granted } = await UsageStats.status();
    if (!granted) {
      setWaiting(true);
      await UsageStats.openSettings();
      return;
    }
    try {
      const r = await measuredBaseline({ timezone: me.timezone, cutoff: cutoff, apps, today: me.today });
      if (r.days === 0) {
        toast('Your phone has no usage records yet. Enter your normal by hand for now.', 'bad');
        return;
      }
      setBaseline((b) => ({ ...b, ...Object.fromEntries(apps.map((a) => [a, r.perApp[a] ?? b[a] ?? 0])) }));
      setMeasuredDays(r.days);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not read screen time.', 'bad');
    }
  };
  useEffect(
    () =>
      onResume(() => {
        if (waiting) {
          setWaiting(false);
          void measureNow();
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [waiting, apps],
  );
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);
  const goal = Math.max(15, Math.round((total * (1 - goalPct / 100)) / 5) * 5);

  const finish = async () => {
    setBusy(true);
    try {
      const perApp = Object.fromEntries(apps.map((id) => [id, baseline[id] ?? 0]));
      await api.call<Me>('PUT', '/api/me/baseline', { perApp, usualSteps: usualSteps === '' ? 5000 : Number(usualSteps) });
      const next = await api.call<Me>('PATCH', '/api/me', { apps, cutoff, dailyGoalMin: goal, onboarded: true });
      setMe(next);
      refresh();
      const pending = storage.get('unrot.pendingJoin');
      go(pending ? `/join/${pending}` : '/', { replace: true });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save that.', 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-inner">
          <BrainMark size={26} />
          <h1 className="topbar-title">{STEPS[step]}</h1>
          <span className="tiny">
            {step + 1 + stepOffset} of {totalSteps}
          </span>
        </div>
      </header>
      <main className="content">
        {step === 0 ? (
          <>
            <p className="lead">Which apps eat your time? Pick every one you open without thinking.</p>
            <div className="wrap">
              {APPS.map((a) => (
                <Chip
                  key={a.id}
                  selected={apps.includes(a.id)}
                  onClick={() => setApps(apps.includes(a.id) ? apps.filter((x) => x !== a.id) : [...apps, a.id])}
                >
                  {a.name}
                </Chip>
              ))}
            </div>
            <Button size="lg" block disabled={apps.length === 0} onClick={() => setStep(1)}>
              Next
            </Button>
          </>
        ) : null}

        {step === 1 ? (
          <>
            {IS_NATIVE ? (
              <Card tone="brand">
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <Icon name="phone" size={24} className="ink-brand" />
                  <div className="grow">
                    <div className="card-title">{measuredDays ? `Measured from your last ${measuredDays} days` : 'Let your phone fill this in'}</div>
                    <p className="card-sub" style={{ marginTop: 4 }}>
                      {measuredDays
                        ? 'These are your real daily averages. Adjust them if last week was unusual.'
                        : "Unrot reads last week's app time from Android. Switch on Usage access for Unrot on the next screen."}
                    </p>
                    {!measuredDays ? (
                      <Button style={{ marginTop: 10 }} icon="phone" onClick={() => void measureNow()}>
                        Measure my last week
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            ) : (
              <p className="lead">
                How long do you spend on each, on a normal day? Your phone already knows: <strong>Settings › Screen Time</strong> on iPhone, or{' '}
                <strong>Settings › Digital Wellbeing</strong> on Android. Use last week's daily average.
              </p>
            )}
            <Card>
              {apps.map((id) => (
                <div className="app-row" key={id}>
                  <span className="app-dot" style={{ background: APPS.find((a) => a.id === id)?.color }} aria-hidden />
                  <span className="grow">{appName(id)}</span>
                  <MinutesInput id={`base-${id}`} label={`${appName(id)} on a normal day`} value={baseline[id] ?? 0} onChange={(m) => setBaseline({ ...baseline, [id]: m })} max={16 * 60} />
                </div>
              ))}
              <hr className="divider" />
              <div className="row">
                <span className="grow muted">Total</span>
                <strong>
                  {fmtMin(total)} a day · {verdict(total).label.toLowerCase()}
                </strong>
              </div>
            </Card>
            <Card>
              <Field
                label="Usual steps a day"
                htmlFor="onb-steps"
                hint="From the Health or Fit app, last week's average. Every 1,000 steps above this takes 15 minutes off your brain rot."
              >
                <input
                  id="onb-steps"
                  className="input"
                  inputMode="numeric"
                  placeholder="e.g. 6500"
                  value={usualSteps}
                  onChange={(e) => setUsualSteps(e.target.value.replace(/\D/g, '').slice(0, 5))}
                />
              </Field>
            </Card>
            <p className="tiny">
              This is your baseline. Every cut is measured against it. You can correct it for 3 days, then it locks so nobody can move the goalposts.
            </p>
            <div className="grid-2">
              <Button variant="secondary" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button disabled={total === 0} onClick={() => setStep(2)}>
                Next
              </Button>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Card>
              <div className="stack" style={{ gap: 14 }}>
                <Field label="Daily goal" hint={`Cut ${goalPct}% from your normal ${fmtMin(total)}. Days under it earn XP.`}>
                  <div className="row">
                    <strong className="big-number grow">{fmtMin(goal)}</strong>
                    <Stepper value={goalPct} onChange={setGoalPct} step={5} min={5} max={80} format={(n) => `-${n}%`} label="goal cut" />
                  </div>
                </Field>
                <hr className="divider" />
                <Field
                  label="Nightly screen cut-off"
                  htmlFor="onb-cutoff"
                  hint={
                    me?.bedtime
                      ? `Phone down from this time: an hour before your usual ${me.bedtime} bedtime works well. The check-in asks how it went.`
                      : 'Phone down from this time. The check-in asks how it went.'
                  }
                >
                  <input id="onb-cutoff" className="input" type="time" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
                </Field>
              </div>
            </Card>
            <div className="grid-2">
              <Button variant="secondary" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button busy={busy} onClick={finish}>
                Start
              </Button>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
