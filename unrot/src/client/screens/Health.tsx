import { useState } from 'react';
import type { HealthView } from '../../engine/ops/health';
import { dayMonth } from '../../shared/dates';
import { useApp, useQuery } from '../lib/app';
import { Histogram, Ring, Spark } from '../ui/charts';
import { Button, Card, ErrorNote, Loading, Meter, Pill, Screen, Section, Segmented, type Tone } from '../ui/kit';

function toneOf(score: number | null): Tone {
  if (score === null) return 'neutral';
  if (score >= 75) return 'fresh';
  if (score >= 50) return 'warn';
  return 'rot';
}

/** '13-17' with a non-breaking hyphen so it never splits across lines. */
export function ageLabel(g: string): string {
  return g.replace('-', '\u2011');
}

function statusWord(score: number): string {
  return score >= 75 ? 'Good' : score >= 50 ? 'OK' : 'Low';
}

export function Health() {
  const { mutate } = useApp();
  const q = useQuery<HealthView>('/api/health');
  const [side, setSide] = useState<'physical' | 'mental'>('physical');
  const h = q.data;
  if (!h) return <Screen title="Health" back="/">{q.error ? <ErrorNote error={q.error} retry={q.reload} /> : <Loading />}</Screen>;
  const r = h.result;
  const pct = h.percentile;
  const sideScore = side === 'physical' ? r.physical : r.mental;
  const sidePct = side === 'physical' ? pct.physical : pct.mental;

  return (
    <Screen title="Health" back="/">
      {r.overall === null ? (
        <Card tone="brand">
          <div className="card-title">Log 3 days to get your scores</div>
          <p className="card-sub" style={{ marginTop: 4 }}>
            You have {r.days} {r.days === 1 ? 'check-in' : 'check-ins'} in the last 7 days. Sleep, steps and the mood questions make the scores.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="row" style={{ gap: 16 }}>
            <Ring value={r.overall} size={104} tone={toneOf(r.overall)} label={`Overall health ${r.overall}%`}>
              <span style={{ fontSize: 26 }}>{r.overall}%</span>
            </Ring>
            <div className="grow">
              <div className="eyebrow">Overall, last 7 days</div>
              <div className="card-title" style={{ marginTop: 4 }}>
                Healthier than {pct.overall}% of {ageLabel(h.ageGroup)} year-olds
              </div>
              <p className="tiny" style={{ marginTop: 4 }}>
                Compared with {h.cohortSize} Unrot {h.cohortSize === 1 ? 'user' : 'users'} your age
                {h.cohortSize < 25 ? ', topped up with published averages until more people join' : ''}.
              </p>
            </div>
          </div>
          <div className="grid-2" style={{ marginTop: 14 }}>
            <div className="stat">
              <div className="stat-label">Physical</div>
              <div className="stat-value">{r.physical === null ? '-' : `${r.physical}%`}</div>
              <div className="stat-sub">{pct.physical === null ? '' : `above ${pct.physical}% of your age`}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Mental</div>
              <div className="stat-value">{r.mental === null ? '-' : `${r.mental}%`}</div>
              <div className="stat-sub">{pct.mental === null ? '' : `above ${pct.mental}% of your age`}</div>
            </div>
          </div>
        </Card>
      )}

      <Segmented
        label="Physical or mental"
        value={side}
        onChange={setSide}
        options={[
          { value: 'physical', label: 'Physical' },
          { value: 'mental', label: 'Mental' },
        ]}
      />

      <Card>
        <div className="stack" style={{ gap: 14 }}>
          {r.components
            .filter((c) => c.side === side)
            .map((c) => (
              <div key={c.key} className="stack" style={{ gap: 6 }}>
                <div className="row">
                  <span className="grow" style={{ fontWeight: 700 }}>
                    {c.label}
                  </span>
                  {c.score !== null ? <Pill tone={toneOf(c.score)}>{statusWord(c.score)}</Pill> : null}
                  <strong className="tabular" style={{ minWidth: 40, textAlign: 'right' }}>
                    {c.score === null ? '-' : c.score}
                  </strong>
                </div>
                <Meter value={c.score ?? 0} max={100} tone={toneOf(c.score)} label={`${c.label} score`} />
                <div className="tiny">
                  {c.value} · target {c.target}
                </div>
              </div>
            ))}
        </div>
      </Card>

      {sideScore !== null && sidePct !== null ? (
        <Section title={`${side === 'physical' ? 'Physical' : 'Mental'} scores, ages ${ageLabel(h.ageGroup)}`}>
          <Card>
            <Histogram bins={side === 'physical' ? h.histograms.physical : h.histograms.mental} you={sideScore} label={`How ${h.ageGroup} year-olds score`} />
            <p className="small muted" style={{ marginTop: 6 }}>
              Your {side} score of {sideScore}% is higher than {sidePct}% of people your age.
            </p>
          </Card>
        </Section>
      ) : null}

      <Section title="Last 6 weeks">
        <Card>
          <div className="stack" style={{ gap: 14 }}>
            {(['physical', 'mental'] as const).map((k) => (
              <div key={k}>
                <div className="eyebrow">{k === 'physical' ? 'Physical' : 'Mental'}</div>
                <Spark
                  values={h.trend.map((t) => t[k])}
                  labels={h.trend.map((t, i) => (i === h.trend.length - 1 ? 'Now' : `Week of ${dayMonth(t.weekStart)}`))}
                  format={(v) => `${Math.round(v)}%`}
                />
              </div>
            ))}
          </div>
        </Card>
      </Section>

      {h.focus.length ? (
        <Section title="Raise your score">
          {h.focus.map((f) => (
            <Card key={f.key}>
              <div className="row" style={{ marginBottom: 8 }}>
                <span className="grow card-title">{f.label}</span>
                <Pill tone={toneOf(f.score)}>{f.score}</Pill>
              </div>
              <ul className="prose" style={{ paddingLeft: 18, margin: 0, gap: 6, display: 'flex', flexDirection: 'column' }}>
                {f.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </Card>
          ))}
        </Section>
      ) : null}

      <Section title="Challenges for this">
        {h.recommended.map((w) => (
          <Card key={w.id}>
            <div className="challenge">
              <div className="grow">
                <div className="card-title">{w.title}</div>
                <div className="card-sub">
                  {w.detail} +{w.xp} XP
                </div>
              </div>
              {w.done ? (
                <Pill tone="fresh" icon="check">
                  Done
                </Pill>
              ) : (
                <Button size="sm" onClick={() => mutate('POST', '/api/challenges/complete', { challengeId: w.id }, 'Logged')}>
                  Done
                </Button>
              )}
            </div>
          </Card>
        ))}
      </Section>

      <Card>
        <details className="disclose">
          <summary>How these scores work</summary>
          <div className="prose" style={{ marginTop: 10 }}>
            <p>
              Each score averages your last 7 check-ins against the guideline for {h.ageGroup} year-olds: sleep {h.norms.sleepH[0]}-{h.norms.sleepH[1]} hours (AASM/CDC),{' '}
              {h.norms.steps.toLocaleString()} steps a day, {h.norms.activeMin} active minutes (WHO 2020), and at most 2 hours of recreational screens (Canadian 24-Hour
              Movement Guidelines). Mood, energy, focus and stress come from your own answers.
            </p>
            <p>
              Physical is sleep 35%, steps 30%, activity 20%, phone after cut-off 15%. Mental is brain rot time 35%, mood 20%, energy, focus and calm 15% each.
            </p>
            <p>
              <strong>This is a self-check, not a medical assessment.</strong> If you have felt low or stressed for weeks, talk to someone you trust or a doctor.
            </p>
          </div>
        </details>
      </Card>
    </Screen>
  );
}
