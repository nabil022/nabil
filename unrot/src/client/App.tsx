import { useEffect, type ReactNode } from 'react';
import { STANDALONE, useApp } from './lib/app';
import { Link, match, useRouter } from './lib/router';
import { Challenges } from './screens/Challenges';
import { CheckIn } from './screens/CheckIn';
import { DepositNew, Wallet } from './screens/Wallet';
import { GroupDetailScreen, GroupNew, GroupSettings, Groups, Join, PhoneGroups } from './screens/Groups';
import { Health } from './screens/Health';
import { Home } from './screens/Home';
import { About, BaselineScreen, CalculatorScreen, Leaderboard, MeScreen, Settings, Stats } from './screens/Me';
import { Onboarding } from './screens/Onboarding';
import { ALL_STEPS, SETUP_STEPS, Setup } from './screens/Setup';
import { Planner, SleepReset } from './screens/Sleep';
import { Login, Register, Welcome } from './screens/Welcome';
import { BrainMark, Icon, type IconName } from './ui/icons';
import { Loading, Toasts, cx } from './ui/kit';

type Params = Record<string, string>;
type View = (p: Params, query: URLSearchParams) => ReactNode;

const ROUTES: [string, View][] = [
  ['/', () => <Home />],
  ['/checkin', () => <CheckIn />],
  ['/checkin/:date', (p) => <CheckIn date={p.date} />],
  ['/challenges', () => <Challenges />],
  ['/groups', () => <Groups />],
  ['/groups/new', () => <GroupNew />],
  ['/groups/:id', (p) => <GroupDetailScreen id={p.id!} />],
  ['/groups/:id/settings', (p) => <GroupSettings id={p.id!} />],
  ['/join/:code', (p) => <Join code={p.code!} />],
  ['/wallet', () => <Wallet />],
  ['/deposit/new', () => <DepositNew />],
  ['/health', () => <Health />],
  ['/sleep', () => <SleepReset />],
  ['/planner', () => <Planner />],
  ['/stats', () => <Stats />],
  ['/leaderboard', () => <Leaderboard />],
  ['/me', () => <MeScreen />],
  ['/settings', () => <Settings />],
  ['/settings/baseline', (_p, q) => <BaselineScreen then={q.get('then') ?? undefined} />],
  ['/about', () => <About />],
  ['/calculator', () => <CalculatorScreen />],
];

const PUBLIC_ROUTES: [string, View][] = [
  ['/', () => <Welcome />],
  ['/login', () => <Login />],
  ['/register', () => <Register />],
  ['/join/:code', (p) => <Join code={p.code!} />],
];

/** Phone mode has no server for friends to share, so group screens explain that instead. */
const needsServer = (p: string) => p.startsWith('/groups') || p.startsWith('/join') || p.startsWith('/leaderboard');

function resolve(routes: [string, View][], path: string): ReactNode | null {
  const [p, qs] = path.split('?');
  for (const [pattern, view] of routes) {
    const params = match(pattern, p!);
    if (params) return view(params, new URLSearchParams(qs ?? ''));
  }
  return null;
}

const TABS: { to: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', match: (p) => p === '/' || p.startsWith('/health') || p.startsWith('/sleep') || p.startsWith('/planner') },
  { to: '/groups', label: 'Groups', icon: 'groups', match: (p) => p.startsWith('/groups') || p.startsWith('/leaderboard') || p.startsWith('/join') },
  { to: '/challenges', label: 'Challenges', icon: 'bolt', match: (p) => p.startsWith('/challenges') },
  { to: '/me', label: 'You', icon: 'user', match: (p) => ['/me', '/settings', '/wallet', '/deposit', '/stats', '/about', '/calculator'].some((x) => p.startsWith(x)) },
];

function TabBar() {
  const { path } = useRouter();
  const tab = (t: (typeof TABS)[number]) => (
    <Link key={t.to} to={t.to} className={cx('tab', t.match(path) && 'tab-on')}>
      <Icon name={t.icon} size={23} />
      <span>{t.label}</span>
    </Link>
  );
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner">
        {tab(TABS[0]!)}
        {tab(TABS[1]!)}
        <Link to="/checkin" className="tab-main-wrap" ariaLabel="Check in">
          <span className="tab-main">
            <Icon name="plus" size={28} />
          </span>
          <span>Check in</span>
        </Link>
        {tab(TABS[2]!)}
        {tab(TABS[3]!)}
      </div>
    </nav>
  );
}

function DemoBar() {
  const { api, exitDemo } = useApp();
  if (api.mode !== 'demo') return null;
  return (
    <div className="demo-bar">
      <div className="demo-bar-inner">
        <Icon name="eye" size={18} />
        <span>Demo: you're Alex, 16. Made-up friends, saved only on this device.</span>
        {!STANDALONE ? <button onClick={exitDemo}>Leave</button> : null}
      </div>
    </div>
  );
}

export function App() {
  const { ready, me, api } = useApp();
  const { path } = useRouter();

  // Signing in, out, or into the demo replaces the whole screen: start at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [me?.id, api]);

  if (!ready) {
    return (
      <div className="app app-bare">
        <div className="screen" style={{ display: 'grid', placeItems: 'center', minHeight: '70vh' }}>
          <div className="stack" style={{ alignItems: 'center', gap: 12 }}>
            <BrainMark size={56} title="Unrot" />
            <Loading label="Loading Unrot" />
          </div>
        </div>
      </div>
    );
  }

  if (!me) {
    const view = api.mode === 'phone' ? <Setup /> : (resolve(PUBLIC_ROUTES, path) ?? <Welcome />);
    return (
      <div className="app app-bare">
        {view}
        <Toasts />
      </div>
    );
  }

  if (!me.onboarded) {
    return (
      <div className="app app-bare">
        {api.mode === 'phone' ? <Onboarding stepOffset={SETUP_STEPS} totalSteps={ALL_STEPS} /> : <Onboarding />}
        <Toasts />
      </div>
    );
  }

  const view = api.mode === 'phone' && needsServer(path.split('?')[0]!) ? <PhoneGroups /> : (resolve(ROUTES, path) ?? <Home />);
  return (
    <div className="app">
      <DemoBar />
      {view}
      <TabBar />
      <Toasts />
    </div>
  );
}
