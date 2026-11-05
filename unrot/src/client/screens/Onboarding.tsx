import { useState } from 'react';
import type { Me } from '../../engine/ops/account';
import { APPS, appName } from '../../shared/apps';
import { fmtMin } from '../../shared/format';
import { verdict } from '../../shared/scoring';
import { useApp } from '../lib/app';
import { useRouter } from '../lib/router';
import { storage } from '../lib/storage';
import { BrainMark } from '../ui/icons';
import { Button, Card, Chip, Field, MinutesInput, Stepper } from '../ui/kit';

const STEPS = ['Apps', 'Your normal', 'Goals'];

export function Onboarding() {
  const { me, api, setMe, toast, refresh } = useApp();
  const { go } = useRouter();
  const [step, setStep] = useState(0);
  const [apps, setApps] = useState<string[]>(me?.apps ?? ['tiktok', 'instagram', 'youtube', 'snapchat']);
  const [baseline, setBaseline] = useState<Record<string, number>>(() => ({ ...(me?.baseline?.perApp ?? {}) }));
  const [cutoff, setCutoff] = useState(me?.cutoff ?? '22:30');
  const [usualSteps, setUsualSteps] = useState(String(me?.baseline?.usualSteps ?? ''));
  const [goalPct, setGoalPct] = useState(30);
  const [busy, setBusy] = useState(false);
  const total = apps.reduce((a, id) => a + (baseline[id] ?? 0), 0);
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
            {step + 1} of {STEPS.length}
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
            <p className="lead">
              How long do you spend on each, on a normal day? Your phone already knows: <strong>Settings › Screen Time</strong> on iPhone, or{' '}
              <strong>Settings › Digital Wellbeing</strong> on Android. Use last week's daily average.
            </p>
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
                <Field label="Nightly screen cut-off" htmlFor="onb-cutoff" hint="Phone down from this time. The check-in asks how it went.">
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
