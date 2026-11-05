import type { ChallengesView } from '../../engine/ops/challenges';
import { CHECKIN, CREDIT } from '../../shared/balance';
import { addDays, dayMonth, dayName } from '../../shared/dates';
import { fmtMin, fmtNumber } from '../../shared/format';
import type { CompletionDoc } from '../../shared/types';
import { physicalById, wellbeingById } from '../../shared/challenges';
import { useApp, useQuery } from '../lib/app';
import { Icon } from '../ui/icons';
import { Button, Card, ErrorNote, Loading, Pill, Screen, Section, cx } from '../ui/kit';

const DIFF_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', extreme: 'Extreme' } as const;

function DoneButton({ completion, id, today }: { completion: CompletionDoc | null; id: string; today: string }) {
  const { mutate } = useApp();
  if (completion) {
    const canUndo = completion.date >= addDays(today, -CHECKIN.EDIT_DAYS_BACK);
    return (
      <div className="stack" style={{ alignItems: 'flex-end', gap: 4 }}>
        <Pill tone="fresh" icon="check">
          Done {completion.date === today ? 'today' : dayName(completion.date)}
        </Pill>
        {canUndo ? (
          <button className="link tiny" style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-3)' }} onClick={() => mutate('DELETE', `/api/challenges/completions/${completion.id}`, undefined, 'Undone')}>
            Undo
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <Button size="sm" onClick={() => mutate('POST', '/api/challenges/complete', { challengeId: id }, 'Nice. Logged for today')}>
      Done
    </Button>
  );
}

export function Challenges() {
  const q = useQuery<ChallengesView>('/api/challenges');
  const v = q.data;
  if (!v) return <Screen title="Challenges">{q.error ? <ErrorNote error={q.error} retry={q.reload} /> : <Loading />}</Screen>;
  const earned = v.physical.filter((c) => c.completion).reduce((a, c) => a + c.minutes, 0);
  const done = v.physical.filter((c) => c.completion).length;
  return (
    <Screen title="Challenges">
      <Card tone="brand">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <div className="eyebrow">
              {dayMonth(v.weekStart)} to {dayMonth(v.weekEnd)}
            </div>
            <div className="big-number" style={{ marginTop: 4 }}>
              {done} of {v.physical.length} done
            </div>
            <div className="card-sub">{earned > 0 ? `${fmtMin(earned)} taken off your brain rot this week` : 'New set every Monday'}</div>
          </div>
          <Icon name="bolt" size={30} className="ink-brand" />
        </div>
      </Card>

      <Card>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <span className="feature-icon">
            <Icon name="steps" />
          </span>
          <div className="grow">
            <div className="card-title">
              Every 1,000 steps above your usual {fmtNumber(v.usualSteps)} = {v.minutesPerThousandSteps} minutes off
            </div>
            <div className="card-sub">
              {v.steps?.steps != null
                ? `${dayName(v.steps.date)}: ${fmtNumber(v.steps.steps)} steps, ${v.steps.creditMin > 0 ? `${fmtMin(v.steps.creditMin)} off` : 'no extra'}.`
                : 'Add your steps in the daily check-in.'}{' '}
              Steps and challenges can take off up to half a day's brain rot, and at most {fmtMin(CREDIT.DAILY_CAP_MIN)}.
            </div>
          </div>
        </div>
      </Card>

      <Section title="This week's physical challenges">
        <div className="stack" style={{ gap: 10 }}>
          {v.physical.map((c) => (
            <Card key={c.id} className={cx(c.completion && 'card-done')}>
              <div className="challenge">
                <div className="grow">
                  <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                    <span className={cx('pill', `diff-${c.difficulty}`)}>{DIFF_LABEL[c.difficulty]}</span>
                    <span className="tiny">+{c.xp} XP</span>
                  </div>
                  <div className="card-title">{c.title}</div>
                  <div className="card-sub">{c.detail}</div>
                </div>
                <div className="stack" style={{ alignItems: 'flex-end', gap: 8 }}>
                  <span className="challenge-mins">-{fmtMin(c.minutes)}</span>
                  <DoneButton completion={c.completion} id={c.id} today={v.today} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="For your health %">
        <p className="small muted" style={{ marginTop: -4 }}>
          Picked from your weakest health scores. They earn XP, not minutes.
        </p>
        <div className="stack" style={{ gap: 10 }}>
          {v.wellbeing.map((w) => (
            <Card key={w.id}>
              <div className="challenge">
                <div className="grow">
                  <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                    <Pill tone="night">{w.component === 'screen' ? 'Brain rot' : w.component[0]!.toUpperCase() + w.component.slice(1)}</Pill>
                    <span className="tiny">+{w.xp} XP</span>
                  </div>
                  <div className="card-title">{w.title}</div>
                  <div className="card-sub">{w.detail}</div>
                </div>
                <DoneButton completion={w.completion} id={w.id} today={v.today} />
              </div>
            </Card>
          ))}
        </div>
      </Section>

      {v.recent.length ? (
        <Section title="Recently finished">
          <Card>
            <div className="list">
              {v.recent.slice(0, 8).map((c) => {
                const def = physicalById(c.challengeId) ?? wellbeingById(c.challengeId);
                return (
                  <div className="list-item" key={c.id}>
                    <div className="grow">
                      <div className="list-title">{def?.title ?? c.challengeId}</div>
                      <div className="list-sub">
                        {dayName(c.date)} {dayMonth(c.date)} · +{c.xp} XP
                      </div>
                    </div>
                    {c.creditMin > 0 ? <strong className="ink-fresh">-{fmtMin(c.creditMin)}</strong> : null}
                  </div>
                );
              })}
            </div>
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}
