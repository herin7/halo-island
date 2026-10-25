import { StatusBar } from 'expo-status-bar';
import { HaloIslandHost, capabilities, requestPermissions, useIsland } from 'halo-island';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, PermissionsAndroid, RefreshControl, ScrollView, StyleSheet, Text, ToastAndroid, View } from 'react-native';

import { Ctx, HALF, renderCard } from './cards';
import { Release, Saved, addSteps, fresh, logFood, migrate, protein, proteinDue, proteinPick, roll } from './day';
import { decide, parsePair, saveDrop, sendClipboard, sendShared, useDesk } from './desk';
import { latestReleases, locate, npmStats, topStories, weather } from './feeds';
import { fetchUsage, finish, parseCode, signIn, signingIn } from './claude';
import { limitsOf, modeOf, template, toIsland } from './island';
import { native } from './modules/halo-native';
import { FoodSheet, SettingsSheet } from './sheets';
import { C, F } from './theme';
import { Card, Pill, Press, T } from './ui';

const MIN = 60_000;
const toast = (m: string) => ToastAndroid.show(m, ToastAndroid.SHORT);

function load(): Saved {
  try {
    const raw = native?.load('daily');
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
  const [foodOpen, setFoodOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [caps, setCaps] = useState(capabilities);
  const { status, desk } = useDesk(saved.desk);
  const live = status === 'live' ? desk : null;

  useEffect(() => { native?.save('daily', JSON.stringify(saved)); }, [saved]);

  // One slow clock: rollover, reminders, feed refresh. Kept alive in the background (index.ts).
  useEffect(() => {
    native?.keepAlive();
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { update((s) => s); }, [Math.floor(now / MIN)]);

  // Permissions, then the step counter.
  useEffect(() => {
    requestPermissions().then(setCaps).catch(() => {});
    if (!native?.hasStepSensor()) return;
    let sub: { remove(): void } | undefined;
    PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION).then((r) => {
      if (r !== 'granted') return;
      sub = native!.addListener('onSteps', (e) => update((s) => addSteps(s, e.total)));
      native!.watchSteps(true);
    });
    return () => { sub?.remove(); native?.watchSteps(false); };
  }, []);
  // Back from system settings: the overlay permission may have changed.
  // Back from system settings or the Claude sign-in page: re-read permissions, pick up the copied code.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (a) => {
      if (a !== 'active') return;
      setCaps(capabilities());
      if (signingIn()) native?.paste().then((text) => { if (text && parseCode(text)) finishClaude(text); });
    });
    return () => sub.remove();
  }, []);

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

  // Pairing links, "Food" from the island, and things shared to Halo.
  useEffect(() => {
    const handle = (url?: string | null) => {
      if (!url) return;
      const pair = parsePair(url);
      if (pair) { update((s) => ({ ...s, desk: pair })); toast('Paired with your PC'); }
      if (url.startsWith('halodaily://food')) setFoodOpen(true);
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);
  const link = useRef(saved.desk);
  link.current = saved.desk;
  useEffect(() => {
    const share = (s: Parameters<typeof sendShared>[1]) => sendShared(link.current, s).then(toast);
    const initial = native?.takeShared();
    if (initial) share(initial);
    const sub = native?.addListener('onShare', share);
    return () => sub?.remove();
  }, []);

  const news = saved.news.filter((n) => n.points >= saved.prefs.newsMin);
  const story = news.length ? news[(Math.floor(now / (10 * MIN)) + newsTurn) % news.length] : undefined;
  const overlay = saved.overlay && caps.overlay;
  const view = { saved, desk, status, now, story, dismissed, savedUri, nudge: nudge?.slot ?? null, release: release && now - release.at < 3 * 864e5 ? release : null, alertSeq };
  const state = useMemo(
    () => toIsland(view),
    [saved, desk, status, now, story, dismissed, savedUri, nudge, release, alertSeq],
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
      switch (action) {
        case 'allow':
        case 'deny':
          if (live?.pending) decide(saved.desk, live.pending.id, action);
          return;
        case 'drop:save':
          if (drop) saveDrop(saved.desk, drop).then((uri) => { setSavedUri(uri); toast(`Saved ${drop.name} to Downloads/Halo`); }).catch((e) => toast(String(e.message ?? e)));
          return;
        case 'drop:open': native?.open(savedUri, drop?.mime); return setDismissed(drop?.id ?? '');
        case 'drop:copy': if (drop) native?.copy(drop.text).then(() => toast('Copied')); return setDismissed(drop?.id ?? '');
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
  };
  // Cards in your order; two half-width cards next to each other share a row.
  const shown = saved.prefs.cards.filter((c) => c.on).map((c) => ({ id: c.id, el: renderCard(c.id, ctx) })).filter((c) => c.el);
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

        {!caps.overlay ? (
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
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} saved={saved} update={update} status={status} overlayOk={caps.overlay} onOverlay={setOverlay} onClaude={startClaude} onClaudeCode={finishClaude} />
      <HaloIslandHost placement="cutout" motion="minimal" />
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
