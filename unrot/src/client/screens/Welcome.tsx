import { useState, type FormEvent } from 'react';
import type { Me } from '../../engine/ops/account';
import { APPS, appName } from '../../shared/apps';
import { project } from '../../shared/calculator';
import { fmtMin, fmtNumber } from '../../shared/format';
import { verdict } from '../../shared/scoring';
import { STANDALONE, useApp } from '../lib/app';
import { ApiError } from '../lib/api';
import { Link, useRouter } from '../lib/router';
import { storage } from '../lib/storage';
import { BrainMark, Icon, type IconName } from '../ui/icons';
import { Button, Card, Chip, Field, MinutesInput, Section, Stepper, cx } from '../ui/kit';

const SCALE = ['Fresh brain', 'Lightly toasted', 'Medium rot', 'Well-done rot', 'Fully cooked'];

/** The rot scale: five bands, today's in colour. */
function RotScale({ minutes }: { minutes: number }) {
  const v = verdict(minutes);
  const idx = SCALE.indexOf(v.label);
  const tone = idx <= 1 ? 'fresh' : idx === 2 ? 'warn' : 'rot';
  return (
    <div className="rot-scale" role="meter" aria-label={`Verdict: ${v.label}`} aria-valuemin={1} aria-valuemax={5} aria-valuenow={idx + 1}>
      <div className="rot-scale-bands">
        {SCALE.map((s, i) => (
          <span key={s} className={cx('rot-band', i <= idx && `rot-band-${tone}`)} />
        ))}
      </div>
      <div className="rot-scale-labels" aria-hidden>
        <span>Fresh</span>
        <span>Fully cooked</span>
      </div>
    </div>
  );
}

export function Calculator({ compact }: { compact?: boolean }) {
  const [apps, setApps] = useState<Record<string, number>>({ tiktok: 95, instagram: 60, youtube: 55, snapchat: 30 });
  const [age, setAge] = useState(16);
  const total = Object.values(apps).reduce((a, b) => a + b, 0);
  const p = project(total, age);
  const v = verdict(total);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <Card>
        <div className="stack" style={{ gap: 4 }}>
          {Object.entries(apps).map(([id, min]) => (
            <div className="app-row" key={id}>
              <span className="app-dot" style={{ background: APPS.find((a) => a.id === id)?.color }} aria-hidden />
              <span className="grow">{appName(id)}</span>
              <MinutesInput id={`calc-${id}`} label={`${appName(id)} per day`} value={min} onChange={(m) => setApps({ ...apps, [id]: m })} step={5} max={16 * 60} />
            </div>
          ))}
        </div>
        <div className="wrap" style={{ marginTop: 10 }}>
          {APPS.filter((a) => !(a.id in apps)).slice(0, compact ? 4 : 8).map((a) => (
            <Chip key={a.id} onClick={() => setApps({ ...apps, [a.id]: 30 })}>
              + {a.name}
            </Chip>
          ))}
        </div>
        <hr className="divider" style={{ margin: '14px 0 10px' }} />
        <div className="row">
          <span className="grow muted">Your age</span>
          <Stepper value={age} onChange={setAge} step={1} min={13} max={79} format={(n) => `${n}`} label="age" />
        </div>
      </Card>

      <Card>
        <div className="stack" style={{ gap: 12 }}>
          <div>
            <div className="eyebrow">Your brain rot</div>
            <div className="row" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 12px' }}>
              <span className="hero-number">{fmtMin(total)}</span>
              <span className="muted">a day · {v.label.toLowerCase()}</span>
            </div>
          </div>
          <RotScale minutes={total} />
          <div className="projection">
            <Stat2 label="Every year" value={`${fmtNumber(p.yearlyHours)} h`} sub={`${p.yearlyDays} full days`} />
            <Stat2 label="Of your waking hours" value={`${Math.round(p.wakingPct)}%`} sub="based on 16 awake a day" />
            <Stat2
              label="Until you are 80"
              value={p.lifetimeYears === null ? '-' : `${p.lifetimeYears.toFixed(1)} years`}
              sub="of waking life, at this rate"
            />
            <Stat2 label="Instead, you could read" value={`${fmtNumber(p.books)} books`} sub="a year, at ~6 h each" />
          </div>
        </div>
      </Card>
    </div>
  );
}

function Stat2({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="big-number">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'groups', title: 'Friend groups', body: 'Weekly and monthly leaderboards. Biggest % cut wins the pot.' },
  { icon: 'bolt', title: 'Challenges by difficulty', body: 'Workouts take minutes off your brain rot, and so does every 1,000 steps above your usual: 15 minutes each.' },
  { icon: 'coin', title: 'Money on the line', body: 'Lock a deposit, cut the hours you promised, get it back. Simulated money only.' },
  { icon: 'moon', title: 'Sleep Reset week', body: 'A nightly cut-off, a homework planner and before/after sleep results.' },
  { icon: 'heart', title: 'Health %', body: 'Physical and mental scores compared with people your age.' },
];

export function Welcome() {
  const { startDemo } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand grow" style={{ flex: 1 }}>
            <BrainMark size={30} />
            <span className="wordmark">Unrot</span>
          </div>
          <Link to="/login" className="btn btn-quiet btn-sm">
            Log in
          </Link>
        </div>
      </header>
      <main className="content">
        <div className="welcome-hero">
          <h1 className="welcome-title">
            How <em>cooked</em> is your brain?
          </h1>
          <p className="lead">Add up your daily scrolling, see what it costs you in a year, then cut it down with your friends.</p>
        </div>
        <Calculator />
        <Card tone="brand">
          <div className="stack" style={{ gap: 10 }}>
            <h2 className="card-title">Unrot it with your friends</h2>
            <p className="card-sub">Log your screen time in 30 seconds a day, take on challenges and compete for the weekly pot.</p>
            <Link to="/register" className="btn btn-primary btn-lg btn-block">
              Create an account
            </Link>
            {!STANDALONE ? (
              <Button
                variant="secondary"
                block
                busy={busy}
                onClick={async () => {
                  setBusy(true);
                  await startDemo();
                }}
              >
                Try the demo first
              </Button>
            ) : null}
          </div>
        </Card>
        <Section title="What's inside">
          <Card>
            <div className="stack" style={{ gap: 16 }}>
              {FEATURES.map((f) => (
                <div className="feature" key={f.title}>
                  <span className="feature-icon">
                    <Icon name={f.icon} />
                  </span>
                  <div>
                    <h3>{f.title}</h3>
                    <p>{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Section>
        <p className="tiny">Money in Unrot is simulated: nothing is charged and nothing is paid out.</p>
      </main>
    </div>
  );
}

function errorText(err: unknown): string {
  return err instanceof ApiError || err instanceof Error ? err.message : 'Something went wrong.';
}

function afterSignIn(go: (p: string) => void, me: Me): void {
  const pending = storage.get('unrot.pendingJoin');
  if (!me.onboarded) go('/onboarding');
  else if (pending) go(`/join/${pending}`);
  else go('/');
}

export function Login() {
  const { api, signIn } = useApp();
  const { go } = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.call<{ token: string; me: Me }>('POST', '/api/auth/login', { email, password });
      signIn(r.token, r.me);
      afterSignIn(go, r.me);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="screen">
      <AuthHeader title="Log in" />
      <main className="content">
        <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
          <Field label="Email" htmlFor="login-email">
            <input id="login-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password" htmlFor="login-password" error={error}>
            <input id="login-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Button type="submit" size="lg" block busy={busy}>
            Log in
          </Button>
          <p className="small muted">
            New here? <Link to="/register">Create an account</Link>
          </p>
        </form>
      </main>
    </div>
  );
}

function AuthHeader({ title }: { title: string }) {
  const { back } = useRouter();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button className="icon-btn" onClick={() => back('/')} aria-label="Back">
          <Icon name="back" />
        </button>
        <h1 className="topbar-title">{title}</h1>
        <BrainMark size={26} />
      </div>
    </header>
  );
}

export function Register() {
  const { api, signIn } = useApp();
  const { go } = useRouter();
  const year = new Date().getFullYear();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timezone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  })();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.call<{ token: string; me: Me }>('POST', '/api/auth/register', {
        name,
        email,
        password,
        birthYear: Number(birthYear),
        timezone,
      });
      signIn(r.token, r.me);
      afterSignIn(go, r.me);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="screen">
      <AuthHeader title="Create account" />
      <main className="content">
        <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
          <Field label="First name" htmlFor="reg-name" hint="Friends see this on leaderboards.">
            <input id="reg-name" className="input" autoComplete="given-name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Email" htmlFor="reg-email">
            <input id="reg-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password" htmlFor="reg-password" hint="At least 8 characters.">
            <input
              id="reg-password"
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="Year you were born" htmlFor="reg-year" hint="Used to compare you with people your age. You must be 13 or older." error={error}>
            <input
              id="reg-year"
              className="input"
              inputMode="numeric"
              placeholder={`e.g. ${year - 16}`}
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
              required
            />
          </Field>
          <p className="tiny">Time zone: {timezone}. You start with $20 of simulated money.</p>
          <Button type="submit" size="lg" block busy={busy}>
            Create account
          </Button>
          <p className="small muted">
            Already have one? <Link to="/login">Log in</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
