import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { HaloIslandHost, capabilities, requestPermissions, useIsland } from 'halo-island';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Ctx, HALF, renderCard } from './cards';
import { Release, Saved, activeProfile, setStepsToday, addSteps, fresh, logFood, migrate, protein, proteinDue, proteinPick, roll } from './day';
import { decide, parsePair, saveDrop, sendClipboard, sendShared, useDesk } from './desk';
import { latestReleases, locate, npmStats, topStories, weather } from './feeds';
import { fetchUsage, finish, parseCode, signIn, signingIn } from './claude';
import { limitsOf, modeOf, template, toIsland } from './island';
import { native } from './modules/halo-native';
import { canShareIn, copy, ios, keepAlive, load as loadKey, paste, save, sha256, toast, watchSteps } from './platform';
import { FoodSheet, KiteLogin, SettingsSheet } from './sheets';
import { KiteExpired, Portfolio, addPoint, exchange, livePortfolio, marketOpen, portfolio, pulse } from './kite';
import { C, F } from './theme';
import { Card, Pill, Press, T } from './ui';

const MIN = 60_000;

/** OTA: when the app opens or comes back, fetch a newer JS bundle and switch to it right away. */
async function applyUpdate() {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    if (!(await Updates.checkForUpdateAsync()).isAvailable) return;
    if ((await Updates.fetchUpdateAsync()).isNew) await Updates.reloadAsync();
  } catch {}
}

function load(): Saved {
  try {
    const raw = loadKey('daily');
    // New fields and cards added later fall back to their defaults.
    if (raw) return roll(migrate(JSON.parse(raw)));
  } catch {}
  return fresh();
}

export default function App() {
  const [saved, setSaved] = useState(load);
  const update = useCallback((fn: (s: Saved) => Saved) => setSaved((s) => fn(roll(s))), []);
  const [now, setNow] = useState(Date.now());
  const [newsTurn, setNewsTurn] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const [savedUri, setSavedUri] = useState('');
  const [nudge, setNudge] = useState<{ slot: string; at: number } | null>(null);
  const [alertSeq, setAlertSeq] = useState(0);
  const [release, setRelease] = useState<Release | null>(null);
  const [ask, setAsk] = useState({ id: '', qi: 0, picks: [] as number[], answers: {} as Record<string, string> });
  const [foodOpen, setFoodOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [kiteOpen, setKiteOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [caps, setCaps] = useState(capabilities);
  const { status, desk } = useDesk(saved.desk);
  const live = status === 'live' ? desk : null;

  useEffect(() => { save('daily', JSON.stringify(saved)); }, [saved]);

  // One slow clock: rollover, reminders, feed refresh. Kept alive in the background (index.ts).
  useEffect(() => {
    keepAlive();
    const id = setInterval(() => setNow(Date.now()), saved.kiteDemo ? 3_000 : 30_000);
    return () => clearInterval(id);
  }, [saved.kiteDemo]);
  useEffect(() => { update((s) => s); }, [Math.floor(now / MIN)]);

  // Permissions, then the step counter.
  useEffect(() => {
    requestPermissions().then(setCaps).catch(() => {});
    let stop = () => {};
    let gone = false;
    watchSteps((r) => update((s) => (r.kind === 'counter' ? addSteps(s, r.total) : setStepsToday(s, r.steps)))).then((f) => { if (gone) f(); else stop = f; });
    return () => { gone = true; stop(); };
  }, []);
  // Back from system settings: the overlay permission may have changed.
  // Back from system settings or the Claude sign-in page: re-read permissions, pick up the copied code.
  useEffect(() => {
    applyUpdate();
    const sub = AppState.addEventListener('change', (a) => {
      if (a !== 'active') return;
      // A reload would lose a Claude sign-in that's waiting for its code.
      if (!signingIn()) applyUpdate();
      setCaps(capabilities());
      if (signingIn()) paste().then((text) => { if (text && parseCode(text)) finishClaude(text); });
    });
    return () => sub.remove();
  }, []);

  // Zerodha: every 5 minutes while the market is open, every half hour otherwise. Kite ends the
  // session at 6 AM; then the card asks for today's login.
  useEffect(() => {
    const k = saved.kite;
    if (!k?.token) return;
    if (now >= k.expiresAt) return update((s) => ({ ...s, kite: s.kite && { ...s.kite, token: '' }, kitePf: null }));
    const every = marketOpen(now) ? 5 * MIN : 30 * MIN;
    if (saved.kitePf && now - saved.kitePf.at < every) return;
    portfolio(k).then((kitePf) => update((s) => withReading(s, kitePf)))
      .catch((e) => { if (e instanceof KiteExpired) update((s) => ({ ...s, kite: s.kite && { ...s.kite, token: '' }, kitePf: null })); });
  }, [now, saved.kite?.token]);

  async function finishKite(request: string) {
    setKiteOpen(false);
    const k = saved.kite;
    if (!k) return;
    try {
      const auth = await exchange(k.apiKey, k.apiSecret, request, sha256);
      const kitePf = await portfolio(auth);
      update((s) => withReading({ ...s, kite: auth }, kitePf));
      toast(`Logged in to Kite as ${auth.user}`);
    } catch (e) {
      toast(String((e as Error).message ?? e));
    }
  }
  const loginLatest = useRef(() => {});
  const loginKite = () => {
    if (!saved.kite?.apiKey || !saved.kite.apiSecret) { setSettingsOpen(true); return toast('Add your Kite API key and secret first'); }
    setSettingsOpen(false);
    setKiteOpen(true);
  };
  loginLatest.current = loginKite;

  // Claude account usage: every 3 minutes (the endpoint is rate limited), refreshing the token as needed.
  useEffect(() => {
    const a = saved.claude;
    if (!a || (saved.claudeUsage && now - saved.claudeUsage.at < 3 * MIN)) return;
    fetchUsage(a).then(({ auth, usage }) => update((s) => ({ ...s, claude: auth, claudeUsage: usage }))).catch(() => {});
  }, [now, !!saved.claude]);

  // Feeds, refreshed every half hour.
  const refresh = useCallback(async (force = false) => {
    const s = saved;
    const jobs: Promise<unknown>[] = [];
    if (force || Date.now() - s.newsAt > 30 * MIN) jobs.push(topStories().then((news) => update((x) => ({ ...x, news, newsAt: Date.now() }))));
    if (force || Date.now() - s.wxAt > 30 * MIN) {
      jobs.push((s.place ? Promise.resolve(s.place) : locate()).then(async (place) => {
        const wx = await weather(place);
        update((x) => ({ ...x, place, wx, wxAt: Date.now() }));
      }));
    }
    const p = s.prefs;
    if (p.npm.length && (force || Date.now() - s.npmAt > 6 * 60 * MIN)) jobs.push(npmStats(p.npm).then((npmStats) => update((x) => ({ ...x, npmStats, npmAt: Date.now() }))));
    if (p.repos.length && (force || Date.now() - s.releasesAt > 3 * 60 * MIN)) {
      jobs.push(latestReleases(p.repos).then((releases) => {
        // A tag that changed since the last check is news; the first check only learns what's current.
        const changed = releases.find((r) => { const old = s.releases.find((o) => o.repo === r.repo); return old && old.tag !== r.tag; });
        if (changed) { setRelease(changed); setAlertSeq((n) => n + 1); }
        update((x) => ({ ...x, releases, releasesAt: Date.now() }));
      }));
    }
    await Promise.allSettled(jobs);
  }, [saved.newsAt, saved.wxAt, saved.place, saved.npmAt, saved.releasesAt, saved.prefs.npm.join(), saved.prefs.repos.join()]);
  useEffect(() => { refresh(); }, [Math.floor(now / (10 * MIN))]);

  // Protein reminder: once per slot, when behind pace. It gives up on its own after 45 min.
  useEffect(() => {
    const slot = proteinDue(saved, now);
    if (slot) {
      setNudge({ slot, at: now });
      setAlertSeq((n) => n + 1);
      update((s) => ({ ...s, nudged: [...s.nudged, slot] }));
    } else if (nudge && now - nudge.at > 45 * MIN) setNudge(null);
  }, [now, protein(saved)]);

  // Market pulse: what the trading day wants from you right now, and a pop when it's new.
  const kitePfToday = livePortfolio(saved, now);
  const market = pulse(kitePfToday, saved.kiteSeen, now);
  const marketKey = useRef<string | null>(null);
  useEffect(() => {
    if (market?.key && market.key !== marketKey.current) setAlertSeq((n) => n + 1);
    marketKey.current = market?.key ?? null;
  }, [market?.key]);
  const seeMarket = () => market && update((s) => ({ ...s, kiteSeen: [...s.kiteSeen, market.key].slice(-30) }));

  // Moments that need you pop the island open.
  const pendingId = live?.pending?.id;
  const dropId = live?.drop && Date.now() - live.drop.at < 5 * MIN ? live.drop.id : undefined;
  const ciDone = live?.gh?.ci?.status === 'completed' ? live.gh.ci.url : '';
  const seen = useRef({ pendingId, dropId, ciDone });
  useEffect(() => {
    // Only something new pops it open: an answered request or a cleared CI never does.
    const prev = seen.current;
    seen.current = { pendingId, dropId, ciDone };
    if ((pendingId && pendingId !== prev.pendingId) || (dropId && dropId !== prev.dropId) || (ciDone && ciDone !== prev.ciDone)) setAlertSeq((n) => n + 1);
  }, [pendingId, dropId, ciDone]);
  useEffect(() => { setSavedUri(''); }, [dropId]);
  // A new request starts its questions from the first one.
  const asking = ask.id === pendingId ? ask : { id: pendingId ?? '', qi: 0, picks: [], answers: {} };
  const questions = live?.pending?.questions;
  function answer(label: string) {
    if (!pendingId || !questions) return;
    const answers = { ...asking.answers, [questions[asking.qi].question]: label };
    if (asking.qi + 1 < questions.length) return setAsk({ id: pendingId, qi: asking.qi + 1, picks: [], answers });
    decide(saved.desk, pendingId, 'allow', answers);
  }

  // Pairing links, "Food" from the island, and things shared to Halo.
  useEffect(() => {
    const handle = (url?: string | null) => {
      if (!url) return;
      const pair = parsePair(url);
      if (pair) { update((s) => ({ ...s, desk: pair })); toast('Paired with your PC'); }
      if (url.startsWith('halodaily://food')) setFoodOpen(true);
      if (url.startsWith('halodaily://kite')) loginLatest.current();
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);
  const link = useRef(saved.desk);
  link.current = saved.desk;
  useEffect(() => {
    const share = (s: Parameters<typeof sendShared>[1]) => sendShared(link.current, s).then(toast);
    if (!canShareIn) return;
    const initial = native?.takeShared();
    if (initial) share(initial);
    const sub = native?.addListener('onShare', share);
    return () => sub?.remove();
  }, []);

  const news = saved.news.filter((n) => n.points >= saved.prefs.newsMin);
  const story = news.length ? news[(Math.floor(now / (10 * MIN)) + newsTurn) % news.length] : undefined;
  const overlay = saved.overlay && caps.overlay;
  const view = { saved, desk, status, now, story, dismissed, savedUri, nudge: nudge?.slot ?? null, release: release && now - release.at < 3 * 864e5 ? release : null, alertSeq, asking, pulse: market };
  const state = useMemo(
    () => toIsland(view),
    [saved, desk, status, now, story, dismissed, savedUri, nudge, release, alertSeq, asking.qi, asking.picks.join()],
  );

  // Quiet (swiped away): only a moment that needs you brings the island back, and only while it lasts.
  const hidden = saved.quiet && modeOf(view) === 'day';

  useIsland(template, hidden ? null : state, {
    // A new id restarts the island on the other surface when the overlay is switched.
    id: overlay ? 'halo-over' : 'halo',
    overlay,
    alertOn: ['alertSeq'],
    onAction: (action) => {
      const drop = live?.drop;
      const q = questions?.[asking.qi];
      const pick = action.match(/^q:(\d)$/);
      if (pick && q) {
        const i = Number(pick[1]);
        if (!q.multiSelect) return answer(q.options[i]);
        return setAsk({ ...asking, picks: asking.picks.includes(i) ? asking.picks.filter((p) => p !== i) : [...asking.picks, i].sort() });
      }
      switch (action) {
        case 'q:done':
          if (q && asking.picks.length) answer(asking.picks.map((i) => q.options[i]).join(', '));
          return;
        case 'q:pc':
          if (pendingId) decide(saved.desk, pendingId, 'ask');
          return;
        case 'allow':
        case 'deny':
          if (live?.pending) decide(saved.desk, live.pending.id, action);
          return;
        case 'drop:save':
          if (drop) saveDrop(saved.desk, drop).then((uri) => { setSavedUri(uri); toast(`Saved ${drop.name} to Downloads/Halo`); }).catch((e) => toast(String(e.message ?? e)));
          return;
        case 'drop:open': native?.open(savedUri, drop?.mime); return setDismissed(drop?.id ?? '');
        case 'drop:copy': if (drop) copy(drop.text).then(() => toast('Copied')); return setDismissed(drop?.id ?? '');
        case 'drop:link': if (drop) Linking.openURL(drop.text.trim()); return setDismissed(drop?.id ?? '');
        case 'drop:dismiss': return setDismissed(drop?.id ?? '');
        case 'ci:open': if (live?.gh?.ci) Linking.openURL(live.gh.ci.url); return;
        case 'water:add': return update((s) => ({ ...s, water: s.water + 1 }));
        case 'food:log': Linking.openURL('halodaily://food'); return;
        case 'news:read': if (story) Linking.openURL(story.url); return setNewsTurn((n) => n + 1);
        case 'protein:log': {
          const pick = proteinPick(saved);
          if (pick) update((s) => logFood(s, pick.name, pick.kcal, pick.protein));
          return setNudge(null);
        }
        case 'protein:later': return setNudge(null);
        case 'release:open': if (release) Linking.openURL(release.url); return setRelease(null);
        case 'release:dismiss': return setRelease(null);
        case 'market:login': seeMarket(); Linking.openURL('halodaily://kite'); return;
        case 'market:holdings': seeMarket(); Linking.openURL('https://kite.zerodha.com/holdings'); return;
        case 'market:dismiss': return seeMarket();
        case 'profile:next': return update((x) => ({ ...x, prefs: { ...x.prefs, profile: (x.prefs.profile + 1) % x.prefs.profiles.length } }));
        case 'dismiss':
          toast('Island tucked away. It’s back when something needs you.');
          return update((s) => ({ ...s, quiet: true }));
      }
    },
  });

  function startClaude() {
    signIn().then(() => toast('Approve, tap Copy code, then come back')).catch((e) => toast(String(e.message ?? e)));
  }
  async function finishClaude(text: string) {
    try {
      const auth = await finish(text);
      const { usage } = await fetchUsage(auth);
      update((s) => ({ ...s, claude: auth, claudeUsage: usage }));
      toast('Signed in with Claude');
    } catch (e) {
      toast(String((e as Error).message ?? e));
    }
  }

  async function setOverlay(on: boolean) {
    if (on && !caps.overlay) setCaps(await requestPermissions({ overlay: true }));
    update((s) => ({ ...s, overlay: on }));
  }

  const hour = new Date(now).getHours();
  const limits = limitsOf(saved, live, now);
  const ctx: Ctx = {
    saved, live, status, now, limits, update,
    openFood: () => setFoodOpen(true),
    openSettings: () => setSettingsOpen(true),
    signInClaude: startClaude,
    refresh: () => refresh(true),
    sendClipboard: () => sendClipboard(saved.desk).then(toast),
    loginKite,
  };
  // Cards in your order; two half-width cards next to each other share a row.
  const prof = activeProfile(saved);
  const shown = saved.prefs.cards.filter((c) => c.on && prof.cards.includes(c.id)).map((c) => ({ id: c.id, el: renderCard(c.id, ctx) })).filter((c) => c.el);
  const rows: (typeof shown)[] = [];
  for (const c of shown) {
    const last = rows[rows.length - 1];
    if (HALF.has(c.id) && last?.length === 1 && HALF.has(last[0].id)) last.push(c);
    else rows.push([c]);
  }

  return (
    <View style={s.screen}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.ink2} progressBackgroundColor={C.card} colors={[C.steps]} onRefresh={async () => { setRefreshing(true); await refresh(true); setRefreshing(false); }} />}
      >
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <T style={s.date}>{new Date(now).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</T>
            <Text style={s.hello}>{greeting(hour)}</Text>
          </View>
          {saved.quiet ? (
            <Press onPress={() => update((x) => ({ ...x, quiet: false }))} style={[s.status, { marginRight: 8 }]} label="Show the island">
              <Text style={s.statusText}>Show island</Text>
            </Press>
          ) : null}
          <Press onPress={() => setSettingsOpen(true)} style={s.status} label="Settings">
            <View style={[s.dot, { backgroundColor: status === 'live' ? C.steps : status === 'error' ? C.fail : C.ink3 }]} />
            <Text style={s.statusText}>{status === 'live' ? 'Desk' : status === 'connecting' ? '…' : 'Pair'}</Text>
          </Press>
        </View>

        {saved.prefs.profiles.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 6, paddingBottom: 6 }}>
            {saved.prefs.profiles.map((pr, i) => (
              <Pill key={i} label={pr.name || 'Untitled'} onPress={() => update((x) => ({ ...x, prefs: { ...x.prefs, profile: i } }))} color={C.ink} filled={saved.prefs.profile === i} />
            ))}
          </ScrollView>
        ) : null}

        {!ios && !caps.overlay ? (
          <Card style={{ gap: 10 }}>
            <Text style={s.title}>Float Halo over every app</Text>
            <T>Claude asking, CI finishing, a file from your PC, your protein: it shows up wherever you are.</T>
            <View style={{ flexDirection: 'row' }}><Pill label="Allow" onPress={() => setOverlay(true)} color={C.steps} filled /></View>
          </Card>
        ) : null}

        {rows.map((r) => (
          <View key={r.map((c) => c.id).join()} style={s.row}>
            {r.map((c) => <Fragment key={c.id}>{c.el}</Fragment>)}
            {r.length === 1 && HALF.has(r[0].id) ? <View style={{ flex: 1 }} /> : null}
          </View>
        ))}

        <Press onPress={() => setSettingsOpen(true)} style={s.settings} label="Settings"><T>Settings</T></Press>
      </ScrollView>

      <FoodSheet open={foodOpen} onClose={() => setFoodOpen(false)} saved={saved} update={update} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} saved={saved} update={update} status={status} overlayOk={caps.overlay} onOverlay={setOverlay} onClaude={startClaude} onClaudeCode={finishClaude} onKite={loginKite} />
      {kiteOpen && saved.kite ? <KiteLogin apiKey={saved.kite.apiKey} onToken={finishKite} onClose={() => setKiteOpen(false)} /> : null}
      <HaloIslandHost placement={ios ? 'auto' : 'cutout'} motion="minimal" />
    </View>
  );
}

const greeting = (h: number) => (h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Up late');

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 14, paddingTop: 104, paddingBottom: 48, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 6, marginBottom: 10 },
  date: { fontSize: 13, color: C.ink3 },
  hello: { fontFamily: F.light, fontSize: 34, letterSpacing: -1.2, color: C.ink, marginTop: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardEdge },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: F.medium, fontSize: 13, color: C.ink2 },
  row: { flexDirection: 'row', gap: 10 },
  title: { fontFamily: F.medium, fontSize: 16, color: C.ink, letterSpacing: -0.2 },
  settings: { alignSelf: 'center', padding: 14 },
});

/** A portfolio read, recorded on today's day-P&L curve as well. */
function withReading(s: Saved, kitePf: Portfolio): Saved {
  return { ...s, kitePf, kiteCurve: addPoint(s.kiteCurve, s.day, kitePf.dayPnl) };
}
