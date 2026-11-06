// First launch of the Android app: who you are and your usual day, saved on
// this phone only. The onboarding (apps, your normal, goals) follows.

import { useEffect, useState } from 'react';
import type { Me } from '../../engine/ops/account';
import { ACCOUNT, PLANNER } from '../../shared/balance';
import { formatHM, parseHM } from '../../shared/dates';
import { fmtMin } from '../../shared/format';
import { NORMS, ageGroupFor } from '../../shared/health';
import { AVATARS, AVATAR_COLORS } from '../../shared/profile';
import { sleepMinutes } from '../../shared/sleep';
import { useApp } from '../lib/app';
import { BrainMark } from '../ui/icons';
import { RestoreOnSetup } from './Backup';
import { Avatar, Button, Card, Field, cx } from '../ui/kit';

const STEPS = ['About you', 'Your routine'];
/** Setup, then the three onboarding steps. */
export const SETUP_STEPS = STEPS.length;
export const ALL_STEPS = STEPS.length + 3;

function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Screens off an hour before bed, on the quarter hour. */
export function cutoffFor(bedtime: string): string | undefined {
  const b = parseHM(bedtime);
  return b === null ? undefined : formatHM(Math.floor((b - 60) / 15) * 15);
}

function yearProblem(raw: string, thisYear: number): string | null {
  if (raw.length < 4) return 'Enter the year as four digits, like 2010.';
  const y = Number(raw);
  if (y > thisYear || y < thisYear - ACCOUNT.MAX_AGE) return 'That year does not look right.';
  if (thisYear - y < ACCOUNT.MIN_AGE) return `Unrot is for people aged ${ACCOUNT.MIN_AGE} and over.`;
  return null;
}

export function Setup() {
  const { api, signIn } = useApp();
  const thisYear = new Date().getFullYear();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [yearError, setYearError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState(() => AVATARS[Math.floor(Math.random() * AVATARS.length)]!);
  const [color, setColor] = useState(() => Math.floor(Math.random() * AVATAR_COLORS.length));
  const [bedtime, setBedtime] = useState('22:30');
  const [wakeTime, setWakeTime] = useState('07:00');
  const [studyStart, setStudyStart] = useState<string>(PLANNER.DEFAULT_STUDY_START);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  const age = year.length === 4 ? thisYear - Number(year) : null;
  const sleepH = NORMS[ageGroupFor(age ?? 16)].sleepH;
  const sleep = sleepMinutes(bedtime || null, wakeTime || null);

  const next = () => {
    const problem = yearProblem(year, thisYear);
    setYearError(problem);
    if (!problem) setStep(1);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.call<{ token: string; me: Me }>('POST', '/api/auth/local', {
        name: name.trim(),
        birthYear: Number(year),
        timezone: timezone(),
        avatar,
        color,
        bedtime: bedtime || null,
        wakeTime: wakeTime || null,
        ...(studyStart ? { studyStart } : {}),
        ...(bedtime ? { cutoff: cutoffFor(bedtime) } : {}),
      });
      signIn(r.token, r.me);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
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
            {step + 1} of {ALL_STEPS}
          </span>
        </div>
      </header>
      <main className="content">
        {step === 0 ? (
          <form
            className="stack"
            style={{ gap: 18 }}
            onSubmit={(e) => {
              e.preventDefault();
              next();
            }}
          >
            <div className="welcome-hero">
              <h2 className="welcome-title">
                Welcome to <em>Unrot</em>
              </h2>
              <p className="lead">Let's set you up. It takes two minutes, and everything you enter stays on this phone.</p>
            </div>
            <Card>
              <div className="stack" style={{ gap: 14 }}>
                <Field label="First name" htmlFor="setup-name">
                  <input
                    id="setup-name"
                    className="input"
                    autoComplete="given-name"
                    autoCapitalize="words"
                    maxLength={40}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field
                  label="Year you were born"
                  htmlFor="setup-year"
                  hint={`Compares you with people your age. Unrot is for ages ${ACCOUNT.MIN_AGE} and up.`}
                  error={yearError}
                >
                  <input
                    id="setup-year"
                    className="input"
                    inputMode="numeric"
                    placeholder={`e.g. ${thisYear - 16}`}
                    value={year}
                    onChange={(e) => {
                      setYear(e.target.value.replace(/\D/g, '').slice(0, 4));
                      setYearError(null);
                    }}
                  />
                </Field>
              </div>
            </Card>
            <Card>
              <Field label="Your profile emoji">
                <div className="row" style={{ marginBottom: 10 }}>
                  <Avatar emoji={avatar} color={color} size={52} />
                  <strong className="grow" style={{ fontSize: 18 }}>
                    {name.trim() || 'You'}
                  </strong>
                </div>
                <div className="emoji-grid">
                  {AVATARS.map((a) => (
                    <button key={a} type="button" className={cx('emoji-btn', avatar === a && 'emoji-on')} onClick={() => setAvatar(a)} aria-pressed={avatar === a} aria-label={`Emoji ${a}`}>
                      {a}
                    </button>
                  ))}
                </div>
                <div className="wrap" style={{ marginTop: 8 }}>
                  {AVATAR_COLORS.map((c, i) => (
                    <button key={c} type="button" className={cx('color-dot', color === i && 'color-on')} style={{ background: c }} onClick={() => setColor(i)} aria-pressed={color === i} aria-label={`Colour ${i + 1}`} />
                  ))}
                </div>
              </Field>
            </Card>
            <Button type="submit" size="lg" block disabled={!name.trim() || year.length < 4}>
              Next
            </Button>
          </form>
        ) : null}
        {step === 0 ? (
          <RestoreOnSetup />
        ) : null}

        {step === 1 ? (
          <>
            <p className="lead">Your usual school day. Check-ins, your nightly cut-off and the study planner start from these. You can change them in Settings.</p>
            <Card>
              <div className="stack" style={{ gap: 14 }}>
                <div className="grid-2">
                  <Field label="Usual bedtime" htmlFor="setup-bed">
                    <input id="setup-bed" className="input" type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} />
                  </Field>
                  <Field label="Usual wake-up" htmlFor="setup-wake">
                    <input id="setup-wake" className="input" type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} />
                  </Field>
                </div>
                {sleep !== null ? (
                  <p className="small muted">
                    That's {fmtMin(sleep)} of sleep. People your age need {sleepH[0]} to {sleepH[1]} hours.
                  </p>
                ) : null}
                <hr className="divider" />
                <Field label="Homework usually starts" htmlFor="setup-study" hint="The study planner fits homework between this and your cut-off.">
                  <input id="setup-study" className="input" type="time" value={studyStart} onChange={(e) => setStudyStart(e.target.value)} />
                </Field>
              </div>
            </Card>
            {error ? <p className="field-error">{error}</p> : null}
            <div className="grid-2">
              <Button variant="secondary" onClick={() => setStep(0)} disabled={busy}>
                Back
              </Button>
              <Button busy={busy} onClick={() => void create()}>
                Next
              </Button>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
