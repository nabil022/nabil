import { useState } from 'react';
import type { Me } from '../../engine/ops/account';
import type { GroupSummary } from '../../engine/ops/groups';
import type { DepositView, Wallet as WalletView } from '../../engine/ops/wallet';
import { DEPOSIT, MONEY } from '../../shared/balance';
import { addDays, shortDate } from '../../shared/dates';
import { fmtMin } from '../../shared/format';
import { formatCents } from '../../shared/money';
import type { LedgerDoc } from '../../shared/types';
import { useApp, useQuery } from '../lib/app';
import { useRouter } from '../lib/router';
import { Icon } from '../ui/icons';
import { Button, Card, Chip, Confirm, ErrorNote, Field, Loading, Meter, Pill, Screen, Section, Segmented, Sheet, Stepper } from '../ui/kit';

const LEDGER_LABEL: Record<LedgerDoc['type'], string> = {
  welcome: 'Welcome money',
  topup: 'Added',
  withdraw: 'Cashed out',
  deposit: 'Deposit locked',
  deposit_return: 'Deposit returned',
  deposit_refund: 'Deposit cancelled',
  buyin: 'Buy-in',
  prize: 'Prize',
  month_prize: 'Monthly jackpot',
};

function DepositCard({ d }: { d: DepositView }) {
  const { mutate } = useApp();
  const [cancel, setCancel] = useState(false);
  const status =
    d.status === 'kept' ? (
      <Pill tone="fresh" icon="check">
        Returned
      </Pill>
    ) : d.status === 'lost' ? (
      <Pill tone="rot">Lost</Pill>
    ) : d.status === 'cancelled' ? (
      <Pill>Cancelled</Pill>
    ) : d.status === 'scheduled' ? (
      <Pill tone="night">Starts {shortDate(d.start)}</Pill>
    ) : (
      <Pill tone={d.onTrack ? 'fresh' : 'warn'}>{d.onTrack ? 'On track' : 'Behind'}</Pill>
    );
  const open = d.status === 'active' || d.status === 'scheduled';
  return (
    <Card>
      <div className="row" style={{ alignItems: 'flex-start', marginBottom: open ? 10 : 0 }}>
        <div className="grow">
          <div className="card-title">
            {formatCents(d.amountCents)} to cut {fmtMin(d.cutTargetMin)} in {d.days} days
          </div>
          <div className="card-sub">
            {shortDate(d.start)} to {shortDate(d.end)}
            {d.groupName ? ` · if missed, goes to ${d.groupName}` : ' · if missed, goes to the community jar'}
          </div>
        </div>
        {status}
      </div>
      {open ? (
        <>
          <Meter value={Math.max(0, d.cutSoFarMin)} max={d.cutTargetMin} tone={d.onTrack ? 'fresh' : 'warn'} label="Cut so far" />
          <p className="small muted" style={{ marginTop: 8 }}>
            {d.status === 'scheduled'
              ? 'Starts tomorrow, so nobody can bet on a day they already know.'
              : d.cutSoFarMin >= d.cutTargetMin
                ? `Goal reached: ${fmtMin(d.cutSoFarMin)} cut. Keep it there until ${shortDate(d.end)}.`
                : `${fmtMin(Math.max(0, d.cutSoFarMin))} cut so far. Cut about ${fmtMin(d.neededPerDayMin)} a day for the next ${d.daysLeft} ${d.daysLeft === 1 ? 'day' : 'days'}.`}
          </p>
          {d.status === 'scheduled' ? (
            <>
              <Button variant="quiet" size="sm" onClick={() => setCancel(true)}>
                Cancel deposit
              </Button>
              <Confirm open={cancel} title="Cancel this deposit?" confirmLabel="Cancel deposit" onClose={() => setCancel(false)} onConfirm={() => mutate('POST', `/api/deposits/${d.id}/cancel`, {}, 'Deposit cancelled and refunded')}>
                <p>You get {formatCents(d.amountCents)} back. Deposits can only be cancelled before they start.</p>
              </Confirm>
            </>
          ) : null}
        </>
      ) : d.status === 'kept' || d.status === 'lost' ? (
        <p className="small muted" style={{ marginTop: 6 }}>
          Cut {fmtMin(Math.max(0, d.cutSoFarMin))} of {fmtMin(d.cutTargetMin)}.
        </p>
      ) : null}
    </Card>
  );
}

function MoneySheet({ kind, open, onClose, balance }: { kind: 'topup' | 'withdraw'; open: boolean; onClose: () => void; balance: number }) {
  const { mutate } = useApp();
  const [amount, setAmount] = useState(1000);
  const presets = kind === 'topup' ? [500, 1000, 2000, 5000] : [500, 1000, balance].filter((v, i, a) => v > 0 && v <= balance && a.indexOf(v) === i);
  return (
    <Sheet open={open} onClose={onClose} title={kind === 'topup' ? 'Add money' : 'Cash out'}>
      <p className="muted">This is simulated money. {kind === 'topup' ? 'Nothing is charged.' : 'Nothing is paid out.'}</p>
      <div className="wrap">
        {presets.map((p) => (
          <Chip key={p} selected={amount === p} onClick={() => setAmount(p)}>
            {p === balance && kind === 'withdraw' ? `All (${formatCents(p)})` : formatCents(p)}
          </Chip>
        ))}
      </div>
      <Button
        size="lg"
        block
        disabled={kind === 'withdraw' && amount > balance}
        onClick={async () => {
          const r = await mutate(
            'POST',
            kind === 'topup' ? '/api/wallet/topup' : '/api/wallet/withdraw',
            { amountCents: amount },
            kind === 'topup' ? `${formatCents(amount)} added` : `${formatCents(amount)} cashed out`,
          );
          if (r) onClose();
        }}
      >
        {kind === 'topup' ? `Add ${formatCents(amount)}` : `Cash out ${formatCents(amount)}`}
      </Button>
    </Sheet>
  );
}

export function Wallet() {
  const { go } = useRouter();
  const q = useQuery<WalletView>('/api/wallet');
  const [sheet, setSheet] = useState<'topup' | 'withdraw' | null>(null);
  const w = q.data;
  if (!w) return <Screen title="Wallet" back="/me">{q.error ? <ErrorNote error={q.error} retry={q.reload} /> : <Loading />}</Screen>;
  const open = w.deposits.filter((d) => d.status === 'active' || d.status === 'scheduled');
  const past = w.deposits.filter((d) => !(d.status === 'active' || d.status === 'scheduled'));
  const net = w.totals.wonCents - w.totals.buyInsCents - w.totals.lostDepositsCents;
  return (
    <Screen title="Wallet" back="/me">
      <Card tone="gold">
        <div className="eyebrow">Balance</div>
        <div className="hero-number" style={{ margin: '4px 0' }}>
          {formatCents(w.balanceCents)}
        </div>
        <div className="card-sub">
          {w.totals.lockedCents > 0 ? `${formatCents(w.totals.lockedCents)} locked in deposits · ` : ''}Simulated money, nothing real is charged or paid.
        </div>
        <div className="grid-2" style={{ marginTop: 14 }}>
          <Button variant="secondary" icon="plus" onClick={() => setSheet('topup')}>
            Add
          </Button>
          <Button variant="secondary" icon="download" onClick={() => setSheet('withdraw')}>
            Cash out
          </Button>
        </div>
      </Card>

      <div className="grid-3">
        <Card>
          <div className="stat">
            <div className="stat-label">Won</div>
            <div className="stat-value ink-fresh">{formatCents(w.totals.wonCents)}</div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="stat-label">Paid in</div>
            <div className="stat-value">{formatCents(w.totals.buyInsCents + w.totals.lostDepositsCents)}</div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="stat-label">Net</div>
            <div className={`stat-value ${net >= 0 ? 'ink-fresh' : 'ink-rot'}`}>{formatCents(net, { sign: true })}</div>
          </div>
        </Card>
      </div>

      <Section title="Deposits" action={<button className="link" onClick={() => go('/deposit/new')}>New deposit</button>}>
        {open.length === 0 ? (
          <Card tone="brand" onClick={() => go('/deposit/new')}>
            <div className="row">
              <Icon name="lock" size={26} className="ink-brand" />
              <div className="grow">
                <div className="card-title">Put money on your goal</div>
                <div className="card-sub">Lock a deposit, cut the hours you promise, get it back. Miss it and it goes to your group's pot.</div>
              </div>
              <Icon name="next" />
            </div>
          </Card>
        ) : (
          open.map((d) => <DepositCard key={d.id} d={d} />)
        )}
        {past.slice(0, 6).map((d) => (
          <DepositCard key={d.id} d={d} />
        ))}
      </Section>

      <Section title="History">
        <Card>
          <div className="list">
            {w.ledger.map((l) => (
              <div className="list-item" key={l.id}>
                <div className="grow">
                  <div className="list-title">{LEDGER_LABEL[l.type]}</div>
                  <div className="list-sub">{l.note}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong className={l.amountCents >= 0 ? 'ink-fresh' : undefined}>{formatCents(l.amountCents, { sign: true })}</strong>
                  <div className="tiny">{new Date(l.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        {w.communityJarCents > 0 ? <p className="tiny">Community jar (deposits lost without a group): {formatCents(w.communityJarCents)}</p> : null}
      </Section>

      <MoneySheet kind="topup" open={sheet === 'topup'} onClose={() => setSheet(null)} balance={w.balanceCents} />
      <MoneySheet kind="withdraw" open={sheet === 'withdraw'} onClose={() => setSheet(null)} balance={w.balanceCents} />
    </Screen>
  );
}

export function DepositNew() {
  const { me, mutate } = useApp();
  const { go } = useRouter();
  const groups = useQuery<GroupSummary[]>('/api/groups');
  const [amount, setAmount] = useState(1000);
  const [days, setDays] = useState<7 | 30>(7);
  const [cutPct, setCutPct] = useState(20);
  const [groupId, setGroupId] = useState<string | null | undefined>(undefined);
  const [confirm, setConfirm] = useState(false);
  const u = me as Me;
  const base = u.baseline?.dailyMin ?? 0;
  if (base <= 0) {
    return (
      <Screen title="New deposit" back="/wallet">
        <ErrorNote error={{ message: 'Set your normal screen time first, so there is something to cut from.' }} />
        <Button onClick={() => go('/settings/baseline')}>Set my normal</Button>
      </Screen>
    );
  }
  const windowMin = base * days;
  const cut = Math.min(windowMin, Math.max(DEPOSIT.MIN_CUT_MIN, Math.round((windowMin * cutPct) / 100 / 15) * 15));
  const target = (windowMin - cut) / days;
  const start = addDays(u.today, 1);
  const end = addDays(start, days - 1);
  const dest = groupId === undefined ? (groups.data?.[0]?.id ?? null) : groupId;
  const destName = dest ? (groups.data?.find((g) => g.id === dest)?.name ?? 'your group') : 'the community jar';
  const amounts = [200, 500, 1000, 2000].filter((a) => a <= Math.max(u.balanceCents, MONEY.MIN_DEPOSIT_CENTS));

  return (
    <Screen title="New deposit" back="/wallet">
      <p className="lead">Promise to cut at least some hours of brain rot against your normal. Do it and you get the money back.</p>
      <Card>
        <div className="stack" style={{ gap: 16 }}>
          <Field label="Deposit" hint={`Balance: ${formatCents(u.balanceCents)}`}>
            <div className="wrap">
              {amounts.map((a) => (
                <Chip key={a} selected={amount === a} onClick={() => setAmount(a)}>
                  {formatCents(a)}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="How long">
            <Segmented
              label="Length"
              value={String(days) as '7' | '30'}
              onChange={(v) => setDays(Number(v) as 7 | 30)}
              options={[
                { value: '7', label: '7 days' },
                { value: '30', label: '30 days' },
              ]}
            />
          </Field>
          <Field label="Hours to cut" hint={`Your normal is ${fmtMin(base)} a day, ${fmtMin(windowMin)} over ${days} days.`}>
            <div className="row">
              <strong className="big-number grow">{fmtMin(cut)}</strong>
              <Stepper value={cutPct} onChange={setCutPct} step={5} min={5} max={90} format={(n) => `${n}%`} label="cut" />
            </div>
          </Field>
          <p className="small">
            That means averaging <strong>{fmtMin(target)} a day</strong> or less, after step and challenge bonuses. Days you don't log count as your normal.
          </p>
          <Field label="If you miss it, the money goes to">
            <div className="wrap">
              {(groups.data ?? []).map((g) => (
                <Chip key={g.id} selected={dest === g.id} onClick={() => setGroupId(g.id)}>
                  {g.emoji} {g.name}
                </Chip>
              ))}
              <Chip selected={dest === null} onClick={() => setGroupId(null)}>
                Community jar
              </Chip>
            </div>
          </Field>
        </div>
      </Card>
      <Card tone="night">
        <div className="kv">
          <span className="kv-k">Runs</span>
          <span className="kv-v">
            {shortDate(start)} to {shortDate(end)}
          </span>
        </div>
        <div className="kv">
          <span className="kv-k">Settles</span>
          <span className="kv-v">{shortDate(addDays(end, 2))}</span>
        </div>
      </Card>
      <Button size="lg" block disabled={amount > u.balanceCents} onClick={() => setConfirm(true)}>
        Lock {formatCents(amount)}
      </Button>
      <Confirm
        open={confirm}
        title={`Lock ${formatCents(amount)}?`}
        confirmLabel="Lock it"
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          const r = await mutate('POST', '/api/deposits', { amountCents: amount, days, cutMin: cut, groupId: dest }, 'Deposit locked. Good luck.');
          if (r) go('/wallet', { replace: true });
        }}
      >
        <p>
          Cut at least <strong>{fmtMin(cut)}</strong> between {shortDate(start)} and {shortDate(end)}. If you miss, {formatCents(amount)} goes to {destName}. You can cancel until it starts tomorrow.
        </p>
      </Confirm>
    </Screen>
  );
}
