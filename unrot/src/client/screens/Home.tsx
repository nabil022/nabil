import type { Dashboard } from '../../engine/ops/logs';
import { appName } from '../../shared/apps';
import { addDays, datesBetween, parseHM, shortDate } from '../../shared/dates';
import { fmtCut, fmtMin, ordinal } from '../../shared/format';
import { formatCents } from '../../shared/money';
import { useApp, useQuery } from '../lib/app';
import { getReminders, applyReminders } from '../lib/reminders';
import { Link, useRouter } from '../lib/router';
import { useTracking } from '../lib/tracking-context';
import { useState } from 'react';
import { RotMeter, WeekBars, type WeekPoint } from '../ui/charts';
import { Icon } from '../ui/icons';
import { Button, Card, ErrorNote, Loading, Meter, Pill, Screen, Section } from '../ui/kit';
import { BackupNudge } from './Backup';

function greeting(nowMin: number): string {
  if (nowMin < 5 * 60) return 'Still up';
  if (nowMin < 12 * 60) return 'Morning';
  if (nowMin < 18 * 60) return 'Afternoon';
  return 'Evening';
}

function CutoffBanner({ nowMin, cutoff }: { nowMin: number; cutoff: string }) {
  const c = parseHM(cutoff) ?? 22 * 60 + 30;
  const past = nowMin >= c || nowMin < 5 * 60;
  const until = (c - nowMin + 1440) % 1440;
  if (past) {
    return (
      <div className="banner banner-night" role="status">
        <Icon name="moon" size={26} />
        <div className="grow">
          <strong>It's past your {cutoff} cut-off.</strong>
          <div className="muted small">Phone down. Tomorrow's check-in will ask how it went.</div>
        </div>
      </div>
    );
  }
  if (until > 180) return null;
  return (
    <Link to="/sleep" className="banner banner-soft">
      <Icon name="clock" size={24} />
      <div className="grow">
        <strong>Cut-off in {fmtMin(until)}</strong>
        <div className="small">Screens off at {cutoff}. Finish homework first.</div>
      </div>
      <Icon name="next" />
    </Link>
  );
}

/** Android: switch tracking on, then show today so far straight from the phone. */
function PhoneCard() {
  const { me, toast } = useApp();
  const { state, enable } = useTracking();
  const [reminders, setReminders] = useState(getReminders());
  if (!state.supported || state.granted === null) return null;
  if (!state.granted) {
    return (
      <Card tone="brand">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Icon name="phone" size={26} className="ink-brand" />
          <div className="grow">
            <div className="card-title">Track screen time automatically</div>
            <p className="card-sub" style={{ marginTop: 4 }}>
              Unrot can read your app time from Android, the same numbers as Digital Wellbeing, so you never type them. On the next screen, find Unrot and switch on
              Usage access.
            </p>
            <Button style={{ marginTop: 10 }} icon="phone" onClick={() => void enable()}>
              Turn on tracking
            </Button>
          </div>
        </div>
      </Card>
    );
  }
  const today = state.today;
  const total = today ? Object.values(today.apps).reduce((a, b) => a + b, 0) : 0;
  const top = today
    ? Object.entries(today.apps)
        .filter(([, m]) => m > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
    : [];
  return (
    <Card>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="eyebrow">Today so far, from your phone</div>
          <div className="big-number" style={{ marginTop: 4 }}>
            {fmtMin(total)}
          </div>
          <div className="card-sub">
            {top.length ? top.map(([a, m]) => `${appName(a)} ${fmtMin(m)}`).join(' · ') : 'Nothing on your tracked apps yet today.'}
          </div>
        </div>
        <Pill tone="fresh" icon="phone">
          Auto
        </Pill>
      </div>
      <p className="tiny" style={{ marginTop: 8 }}>
        {state.lastSync ? `Yesterday saved automatically. ` : ''}Today is saved tomorrow morning, when it's finished.
      </p>
      {!reminders.asked ? (
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <Button
            size="sm"
            variant="secondary"
            icon="bell"
            onClick={async () => {
              const next = { morning: true, morningTime: '08:30', cutoff: true };
              const r = await applyReminders(next, me!.cutoff);
              setReminders({ ...next, asked: true });
              toast(r === 'denied' ? 'Notifications are blocked for Unrot in Android settings.' : `Reminders on: 08:30 and ${me!.cutoff}`, r === 'denied' ? 'bad' : 'good');
            }}
          >
            Remind me at 08:30 and {me!.cutoff}
          </Button>
          <Button
            size="sm"
            variant="quiet"
            onClick={async () => {
              await applyReminders({ morning: false, morningTime: '08:30', cutoff: false }, me!.cutoff);
              setReminders({ ...getReminders(), asked: true });
            }}
          >
            No thanks
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

export function Home() {
  const { me, api } = useApp();
  const { go } = useRouter();
  const q = useQuery<Dashboard>('/api/dashboard');
  const d = q.data;
  if (!d) {
    return (
      <Screen title={`Hi, ${me?.name ?? ''}`}>{q.error ? <ErrorNote error={q.error} retry={q.reload} /> : <Loading />}</Screen>
    );
  }
  const weekDates = datesBetween(d.week.start, d.week.end);
  const byDate = new Map(d.week.points.map((p) => [p.date, p]));
  const days: WeekPoint[] = weekDates.map((date) => {
    const p = byDate.get(date);
    return { date, net: p ? p.net : null, raw: p ? p.raw : null, credit: p?.credit ?? 0, logged: p?.logged ?? false };
  });
  const s = d.week.summary;
  const yesterday = addDays(d.today, -1);
  const cutTone = s.pctCut >= 0 ? 'fresh' : 'rot';

  return (
    <Screen
      title={`${greeting(d.nowMin)}, ${me?.name}`}
      action={
        <>
          <Link to="/wallet" className="balance-chip" ariaLabel={`Wallet: ${formatCents(me?.balanceCents ?? 0)}`}>
            <Icon name="coin" size={16} />
            {formatCents(me?.balanceCents ?? 0)}
          </Link>
        </>
      }
    >
      <CutoffBanner nowMin={d.nowMin} cutoff={d.cutoff} />

      <PhoneCard />

      {d.checkin.yesterday && d.checkin.yesterdayMeasured && !d.checkin.yesterdayAnswered ? (
        <Link to={`/checkin/${yesterday}`} className="banner banner-brand">
          <Icon name="plus" size={26} />
          <div className="grow">
            <strong>Finish yesterday ({shortDate(yesterday)})</strong>
            <div className="muted small">Screen time is in from your phone. Add sleep and mood: 20 seconds.</div>
          </div>
          <Icon name="next" />
        </Link>
      ) : !d.checkin.yesterday ? (
        <Link to={`/checkin/${yesterday}`} className="banner banner-brand">
          <Icon name="plus" size={26} />
          <div className="grow">
            <strong>Log yesterday ({shortDate(yesterday)})</strong>
            <div className="muted small">
              {d.checkin.keepStreak > 1 ? `Keeps your streak going: ${d.checkin.keepStreak} days.` : 'Takes 30 seconds. Unlogged days count as your normal.'}
            </div>
          </div>
          <Icon name="next" />
        </Link>
      ) : d.checkin.streak > 1 ? (
        <div className="row small muted" style={{ paddingLeft: 2 }}>
          <Icon name="flame" size={18} className="ink-brand" />
          <span>
            <strong className="ink-brand">{d.checkin.streak}-day streak.</strong> Yesterday is logged.
          </span>
        </div>
      ) : null}

      <Card>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <div className="eyebrow">This week</div>
            <div className="card-sub">
              {s.days > 0 ? `${s.loggedDays} of ${s.days} days logged` : 'Nothing counted yet this week'}
            </div>
          </div>
          {s.days > 0 && d.baselineDailyMin > 0 ? (
            <Pill tone={cutTone} icon={s.pctCut >= 0 ? 'down' : 'up'}>
              {fmtCut(s.pctCut)} vs normal
            </Pill>
          ) : null}
        </div>
        <RotMeter value={s.days > 0 ? s.avgNet : 0} goal={d.dailyGoalMin} normal={d.baselineDailyMin} caption="a day, after bonuses" />
        <WeekBars days={days} normal={d.baselineDailyMin} today={d.today} />
      </Card>

      {d.groups.length ? (
        <Section title="Your groups" action={<Link to="/groups">All</Link>}>
          <div className="stack" style={{ gap: 10 }}>
            {d.groups.map((g) => (
              <Card key={g.id} onClick={() => go(`/groups/${g.id}`)}>
                <div className="row">
                  <span className="avatar" style={{ width: 42, height: 42, background: 'var(--surface-2)', fontSize: 22 }} aria-hidden>
                    {g.emoji}
                  </span>
                  <div className="grow">
                    <div className="card-title">{g.name}</div>
                    <div className="card-sub">
                      {g.rank ? `You're ${ordinal(g.rank)} of ${g.of}` : 'Check in to get on the board'}
                      {g.myPctCut !== null && g.scoring === 'percent' ? ` · ${fmtCut(g.myPctCut)}` : ''}
                      {g.myAvgNetMin !== null && g.scoring === 'hours' ? ` · ${fmtMin(g.myAvgNetMin)}/day` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="ink-gold" style={{ fontWeight: 800 }}>
                      {formatCents(g.potCents)}
                    </div>
                    <div className="tiny">{g.daysLeft === 0 ? 'last day' : `${g.daysLeft}d left`}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      ) : api.mode === 'phone' ? (
        me ? <BackupNudge me={me} /> : null
      ) : (
        <Card tone="brand" onClick={() => go('/groups')}>
          <div className="row">
            <Icon name="groups" size={26} />
            <div className="grow">
              <div className="card-title">Challenge your friends</div>
              <div className="card-sub">Make a group, share the code, biggest cut wins the pot.</div>
            </div>
            <Icon name="next" />
          </div>
        </Card>
      )}

      {d.deposits.length ? (
        <Section title="Money on the line" action={<Link to="/wallet">Wallet</Link>}>
          {d.deposits.map((dep) => (
            <Card key={dep.id} onClick={() => go('/wallet')}>
              <div className="row" style={{ marginBottom: 10 }}>
                <div className="grow">
                  <div className="card-title">
                    {formatCents(dep.amountCents)}: cut {fmtMin(dep.cutTargetMin)}
                  </div>
                  <div className="card-sub">
                    {dep.status === 'scheduled'
                      ? `Starts ${shortDate(dep.start)}`
                      : `${fmtMin(Math.max(0, dep.cutSoFarMin))} cut so far · ${dep.daysLeft} ${dep.daysLeft === 1 ? 'day' : 'days'} left`}
                  </div>
                </div>
                {dep.status === 'active' ? <Pill tone={dep.onTrack ? 'fresh' : 'warn'}>{dep.onTrack ? 'On track' : 'Behind'}</Pill> : <Pill>Starts soon</Pill>}
              </div>
              <Meter value={Math.max(0, dep.cutSoFarMin)} max={dep.cutTargetMin} tone={dep.onTrack ? 'fresh' : 'warn'} label="Deposit progress" />
            </Card>
          ))}
        </Section>
      ) : null}

      <div className="grid-2">
        <Card onClick={() => go('/health')}>
          <div className="eyebrow">Health</div>
          <div className="big-number" style={{ marginTop: 6 }}>
            {d.health.overall === null ? '-' : `${d.health.overall}%`}
          </div>
          <div className="card-sub">
            {d.health.percentile === null ? 'Needs 3 check-ins' : `Above ${d.health.percentile}% of ${d.health.ageGroup.replace('-', '\u2011')}s`}
          </div>
        </Card>
        <Card onClick={() => go('/challenges')}>
          <div className="eyebrow">Challenges</div>
          <div className="big-number" style={{ marginTop: 6 }}>
            {d.challenges.done}/{d.challenges.total}
          </div>
          <div className="card-sub">{d.challenges.minutesThisWeek > 0 ? `${fmtMin(d.challenges.minutesThisWeek)} earned` : 'This week'}</div>
        </Card>
      </div>

      {d.sleepReset ? (
        <Card tone="night" onClick={() => go('/sleep')}>
          <div className="row">
            <Icon name="moon" size={26} className="ink-night" />
            <div className="grow">
              <div className="card-title">
                Sleep Reset: {d.sleepReset.status === 'before' ? 'normal week' : 'cut-off week'}, day {d.sleepReset.day} of 7
              </div>
              <div className="card-sub">Cut-off tonight at {d.sleepReset.cutoff}</div>
            </div>
            <Icon name="next" />
          </div>
        </Card>
      ) : (
        <Card onClick={() => go('/sleep')}>
          <div className="row">
            <Icon name="moon" size={26} className="ink-night" />
            <div className="grow">
              <div className="card-title">Try a Sleep Reset week</div>
              <div className="card-sub">A nightly cut-off and a homework plan, with before/after results.</div>
            </div>
            <Icon name="next" />
          </div>
        </Card>
      )}

      <Card onClick={() => go('/me')}>
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="level-num" style={{ minWidth: 34, height: 34, fontSize: 15 }}>
            {d.level.level}
          </span>
          <div className="grow">
            <div className="card-title">{d.level.title}</div>
            <div className="card-sub">
              {d.level.span - d.level.into} XP to {d.level.nextTitle}
            </div>
          </div>
        </div>
        <Meter value={d.level.into} max={d.level.span} label="Progress to next level" />
      </Card>
    </Screen>
  );
}
