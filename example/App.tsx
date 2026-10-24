import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif/400Regular';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif/400Regular_Italic';
import { InterTight_400Regular } from '@expo-google-fonts/inter-tight/400Regular';
import { InterTight_500Medium } from '@expo-google-fonts/inter-tight/500Medium';
import { InterTight_600SemiBold } from '@expo-google-fonts/inter-tight/600SemiBold';
import { InterTight_700Bold } from '@expo-google-fonts/inter-tight/700Bold';
import { InterTight_800ExtraBold } from '@expo-google-fonts/inter-tight/800ExtraBold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import './media';

import { BlurTargetView } from 'expo-blur';
import { HaloIslandHost, IslandPreview, IslandTemplate, IslandTheme, LiveIsland, MotionPreset, capabilities, endAll, focus, island, lookAt, onAction, pet, requestPermissions, row, spacer } from 'halo-island';
import { ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, GestureResponderEvent, Platform, ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { APPS, initialOS, osTemplate } from './os';
import { InSync, ScenarioCard } from './cards';
import { useClaudeBridge } from './useClaudeBridge';
import { Group, Scenario, groups, scenarios } from './catalog';
import { C, F, ISLAND_FONTS, R } from './theme';
import { Fade, Kicker, Lazy, Press, Segmented, Switch, onScrollY, setHaptics } from './ui';
import { openOS, osId, poke, setPetMood, useIslandOS } from './useIslandOS';

const MOTIONS = ['island', 'bouncy', 'snappy', 'smooth'] as const satisfies readonly MotionPreset[];
const MOODS = ['idle', 'happy', 'love', 'sleepy', 'surprised', 'wink', 'thinking', 'focused'];
const MOOD_EMOJI: Record<string, string> = { idle: '•‿•', happy: '^‿^', love: '♥‿♥', sleepy: '–‿–', surprised: 'O_O', wink: '^‿•', thinking: '•_•?', focused: '>_<' };
const OS_SCREENS = [{ id: '', label: 'Launcher', color: C.violet }, ...APPS];
const android = Platform.OS === 'android';

interface Look { material: 'solid' | 'glass'; aura: boolean }

/** The customize panel's look applied to a showcase template: brand-colored aura, or none. */
const styled = (s: Scenario, look: Look): IslandTemplate => ({ ...s.template, theme: { ...s.template.theme, aura: look.aura ? s.template.theme?.aura ?? s.color : '' } });

export default function App() {
  const [fontsReady, fontError] = useFonts({ InterTight_400Regular, InterTight_500Medium, InterTight_600SemiBold, InterTight_700Bold, InterTight_800ExtraBold, InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic });
  const [waited, setWaited] = useState(false);
  useEffect(() => { const t = setTimeout(() => setWaited(true), 1500); return () => clearTimeout(t); }, []);
  // Fonts are embedded on Android; elsewhere they load fast. Never hold the page hostage to them.
  const fontsLoaded = fontsReady || !!fontError || waited;
  const screen = useWindowDimensions();
  const [material, setMaterial] = useState<Look['material']>('solid');
  const [aura, setAura] = useState(false);
  const [motion, setMotion] = useState<MotionPreset>('island');
  const [haptics, setHapticsOn] = useState(true);
  const [dim, setDim] = useState(true);
  const [overlay, setOverlay] = useState(false);
  const [caps, setCaps] = useState(capabilities);
  const [playing, setPlaying] = useState<string[]>([]);
  const [mood, setMood] = useState('idle');
  const [group, setGroup] = useState<Group | 'All'>('All');
  const [bridgeAddr, setBridgeAddr] = useState('localhost:7337');
  const [bridgeToken, setBridgeToken] = useState('');
  const [bridgeOn, setBridgeOn] = useState(false);
  const claude = useClaudeBridge(bridgeAddr, bridgeToken, bridgeOn);
  const lives = useRef(new Map<string, { live: LiveIsland; timers: ReturnType<typeof setTimeout>[] }>());
  const blurTarget = useRef<ComponentRef<typeof View>>(null);

  // Island buttons run the scenario's own logic; the patch lands on the island that was tapped.
  useEffect(() => onAction((id, action, state) => {
    const entry = lives.current.get(id);
    const patch = entry && scenarios.find((x) => x.id === id)?.handle?.(action, state);
    if (entry && patch) entry.live.update(patch);
  }), []);

  useIslandOS();
  useEffect(() => { setHaptics(haptics); }, [haptics]);
  useEffect(() => { requestPermissions().then(setCaps).catch(() => {}); }, []);

  const look: Look = { material, aura };
  const base: IslandTheme = useMemo(() => ({ fonts: ISLAND_FONTS, material, aura: aura ? C.violet : '' }), [material, aura]);

  function stop(id: string) {
    const entry = lives.current.get(id);
    entry?.timers.forEach(clearTimeout);
    entry?.live.end();
    lives.current.delete(id);
    setPlaying((p) => p.filter((x) => x !== id));
  }

  function play(s: Scenario) {
    if (lives.current.has(s.id)) return stop(s.id);
    const tpl = island(styled(s, look));
    // Interactive islands (no story) open expanded: they're there to be played with.
    const live = s.toast ? tpl.show(s.initial(), { id: s.id, expanded: true, duration: 4500 })
      : tpl.start(s.initial(), { id: s.id, overlay: overlay && android, expanded: !s.story.length });
    const timers: ReturnType<typeof setTimeout>[] = [];
    let at = 0;
    for (const [delay, patch, alert] of s.story) {
      at += delay;
      // Beats resolve when they play, so times like boardAt are always relative to now.
      timers.push(setTimeout(() => live.update(typeof patch === 'function' ? patch(live.state) : patch, { alert }), at));
    }
    if (s.toast) timers.push(setTimeout(() => stop(s.id), 4500));
    lives.current.set(s.id, { live, timers });
    setPlaying((p) => [...p, s.id]);
  }

  // Stable identity for memoized cards; always calls the latest play().
  const playLatest = useRef(play);
  playLatest.current = play;
  const playRef = useMemo(() => (sc: Scenario) => playLatest.current(sc), []);

  function stopAll() {
    [...lives.current.keys()].forEach(stop);
    focus(osId);
  }

  const watch = (e: GestureResponderEvent) => {
    lookAt(e.nativeEvent.pageX, e.nativeEvent.pageY, screen);
    poke();
  };
  // Mouse on the web: the pet follows the cursor too.
  const pointer = Platform.OS === 'web' ? { onPointerMove: (e: { nativeEvent: { pageX: number; pageY: number } }) => lookAt(e.nativeEvent.pageX, e.nativeEvent.pageY, screen) } : {};

  const cardW = Math.min(screen.width - 40, 396);
  const gridW = Math.floor((Math.min(screen.width, 760) - 40 - 12) / 2);
  const osState = useMemo(() => ({ ...initialOS(), tHi: true }), []);
  const shown = group === 'All' ? scenarios : scenarios.filter((x) => x.group === group);

  return (
    <View style={s.screen} onTouchStart={watch} onTouchMove={watch} {...pointer}>
      <StatusBar style="light" hidden={android} />
      {/* Everything the glass island can blur on Android lives in here. */}
      <BlurTargetView ref={blurTarget} style={StyleSheet.absoluteFill}>
      {fontsLoaded ? (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} scrollEventThrottle={100} onScroll={(e) => onScrollY(e.nativeEvent.contentOffset.y)}>
          {/* Hero */}
          <View style={[s.hero, { minHeight: screen.height * 0.88 }]}>
            <TapHint />
            {/* The mascot: a big island with the same eyes. Both follow your finger. */}
            <View style={s.stage}>
              <Lazy estimate={92}>
                <Press onPress={() => { focus(osId); openOS(); }} scale={0.92} label="Open Island OS">
                  <IslandPreview template={{ compact: { leading: row({ padding: 18 }, spacer(28), pet(mood, { size: 58 })) } }} theme={base} />
                </Press>
              </Lazy>
            </View>
            <Kicker color={C.violet}>Halo Island · React Native</Kicker>
            <Text style={s.display}>The island</Text>
            <Text style={s.displaySerif}>is the app.</Text>
            <Text style={s.lead}>
              Live Activities, an in-app Dynamic Island and a little creature that watches your finger. iOS and Android, from one JSON template.
            </Text>
            <View style={s.ctaRow}>
              <Press style={s.cta} onPress={() => { focus(osId); openOS(); }} label="Open Island OS">
                <Text style={s.ctaText}>Open Island OS</Text>
                <Arrow color={C.bg} />
              </Press>
              <Press style={s.ctaGhost} onPress={() => play(scenarios[0])} haptic="select" label="Play a live activity">
                <Text style={s.ctaGhostText}>Play IndiGo</Text>
              </Press>
            </View>
            <View style={s.gestures}>
              {['Tap to open', 'Swipe down', 'Swipe right = back', 'Long-press'].map((g) => (
                <View key={g} style={s.gesture}><Text style={s.gestureText}>{g}</Text></View>
              ))}
            </View>
          </View>

          {/* Island OS */}
          <Section kicker="Island OS" color="#FF5DA2" title="Eight apps." serif="Zero screens.">
            Music, a BTC wallet, smart home, focus timer, rides, an AI that streams its answer, weather, and the pet. Every tap, chip and slider runs inside the island; the app only answers action strings.
          </Section>
          <Lazy estimate={420}>
            <FlatList
              horizontal
              data={OS_SCREENS}
              keyExtractor={(a) => a.id || 'launcher'}
              initialNumToRender={2}
              windowSize={3}
              showsHorizontalScrollIndicator={false}
              snapToInterval={cardW + 12}
              decelerationRate="fast"
              contentContainerStyle={s.rail}
              renderItem={({ item: a }) => (
                <View style={{ width: cardW, gap: 12 }}>
                  <IslandPreview template={osTemplate} state={osState} expanded screen={a.id || undefined} theme={base} />
                  <View style={s.railLabel}>
                    <View style={[s.dot, { backgroundColor: a.color }]} />
                    <Text style={s.railText}>{a.label}</Text>
                    <Text style={s.railHint}>{a.id ? 'try it right here' : 'tap a tile'}</Text>
                  </View>
                </View>
              )}
            />
          </Lazy>
          <Press style={[s.wide, { marginHorizontal: 20 }]} onPress={() => { focus(osId); openOS(); }} label="Open on the island">
            <Text style={s.wideText}>Open it on the real island</Text>
            <Arrow color={C.ink} up />
          </Press>

          {/* Live Activities */}
          <Section kicker="Live Activities" color={C.amber} title="Sixteen islands." serif="All alive.">
            A flight to boarding, classes, Claude Code limits, a health buddy, a clan raid. Tap one to play its story on the island; start two and the older one becomes a bubble.
          </Section>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
            {(['All', ...groups] as const).map((g) => (
              <Press key={g} onPress={() => setGroup(g)} haptic="select" style={[s.tab, group === g && s.tabOn]} label={`Show ${g}`}>
                <Text style={[s.tabText, group === g && { color: C.bg }]}>{g}</Text>
              </Press>
            ))}
          </ScrollView>
          <View style={s.grid}>
            {shown.map((sc) => (
              <ScenarioCard key={sc.id} sc={sc} width={gridW} live={playing.includes(sc.id)} base={base} onPress={playRef} />
            ))}
          </View>

          {/* Coordination */}
          <Section kicker="In sync" color="#5E8BFF" title="One state." serif="Two views.">
            The card below and the island are the same React state, drawn twice by useIsland. Change it here and the island follows; tap Boarding pass on the island and this card answers. They can't disagree.
          </Section>
          <InSync width={cardW} />

          {playing.length ? (
            <Press style={[s.wide, { marginHorizontal: 20 }]} onPress={stopAll} haptic="select" label="Stop all live activities">
              <Text style={s.wideText}>Stop {playing.length} live {playing.length === 1 ? 'activity' : 'activities'}</Text>
            </Press>
          ) : null}

          {/* Claude Code, live */}
          <Section kicker="Claude Code" color="#D97757" title="Your limits." serif="Your island.">
            Run tools/island-bridge on your machine and this island shows your real 5-hour and weekly Claude Code usage, what Claude is doing, and its permission requests. Allow or deny without touching the keyboard.
          </Section>
          <View style={s.panel}>
            <View style={s.setting}>
              <Text style={s.settingTitle}>Bridge address</Text>
              <TextInput value={bridgeAddr} onChangeText={setBridgeAddr} autoCapitalize="none" autoCorrect={false} style={s.input} placeholderTextColor={C.ink3} />
              <Text style={[s.settingTitle, { marginTop: 14 }]}>Token</Text>
              <TextInput value={bridgeToken} onChangeText={setBridgeToken} autoCapitalize="none" autoCorrect={false} placeholder="printed by bridge.mjs" style={s.input} placeholderTextColor={C.ink3} secureTextEntry />
            </View>
            <Row title={claude.status === 'live' ? `Live · ${claude.bridge?.model || 'Claude Code'}` : claude.status === 'connecting' ? 'Connecting…' : claude.status === 'error' ? 'Can\u2019t reach the bridge' : 'Connect'} hint={claude.status === 'live' ? claude.bridge?.task : 'node tools/island-bridge/bridge.mjs'}>
              <Switch value={bridgeOn} onChange={setBridgeOn} color="#D97757" label="Connect to Claude Code" />
            </Row>
          </View>

          {/* Customize */}
          <Section kicker="Make it yours" color={C.mint} title="One prop." serif="Every island.">
            The host takes a base theme and motion; templates can override them. Changes apply live.
          </Section>
          <View style={s.panel}>
            <Setting title="Material" hint="Glass is Liquid Glass on iOS 26, a blur on web, tinted on Android.">
              <Segmented options={['solid', 'glass'] as const} value={material} onChange={setMaterial} labels={{ solid: 'Solid', glass: 'Glass' }} />
            </Setting>
            <Setting title="Motion">
              <Segmented options={MOTIONS} value={motion as (typeof MOTIONS)[number]} onChange={setMotion} labels={{ island: 'Island', bouncy: 'Bouncy', snappy: 'Snappy', smooth: 'Smooth' }} />
            </Setting>
            <Setting title="Pet mood" hint="It also has opinions of its own: leave it alone and it dozes off.">
              <View style={s.moods}>
                {MOODS.map((m) => (
                  <Press key={m} onPress={() => { setMood(m); setPetMood(m); }} haptic="select" style={[s.mood, mood === m && { backgroundColor: C.pink, borderColor: C.pink }]} label={`Mood ${m}`}>
                    <Text style={[s.moodText, mood === m && { color: '#fff' }]}>{MOOD_EMOJI[m]}  {m}</Text>
                  </Press>
                ))}
              </View>
            </Setting>
            <Row title="Aura" hint="Brand light pooling under the expanded island. Off is the system look."><Switch value={aura} onChange={setAura} color={C.violet} label="Aura" /></Row>
            <Row title="Dim the app" hint="Behind the expanded island; tap outside to close."><Switch value={dim} onChange={setDim} color={C.violet} label="Dim" /></Row>
            <Row title="Haptics"><Switch value={haptics} onChange={setHapticsOn} color={C.violet} label="Haptics" /></Row>
            {android ? (
              <Row title="Over other apps" hint={caps.overlay ? 'Permission granted · press Home while a card plays' : 'Needs the overlay permission'}>
                <Switch value={overlay} color={C.mint} label="Over other apps" onChange={async (on) => {
                  if (on) setCaps(await requestPermissions({ overlay: true }));
                  setOverlay(on);
                }} />
              </Row>
            ) : null}
            <View style={s.caps}>
              {([['Live Activities', caps.liveActivities], ['Live Updates', caps.liveUpdates], ['Notifications', caps.notifications], ['Overlay', caps.overlay]] as const).map(([k, v]) => (
                <View key={k} style={[s.cap, v && { backgroundColor: C.mint + '1F', borderColor: C.mint + '55' }]}>
                  <Text style={[s.capText, v && { color: C.mint }]}>{v ? '✓' : '–'}  {k}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Footer */}
          <View style={s.footer}>
            <Kicker>Install</Kicker>
            <Press style={s.code} onPress={() => Share.share({ message: 'bunx expo install halo-island' }).catch(() => {})} haptic="select" label="Share install command">
              <Text style={s.codeText}><Text style={{ color: C.ink3 }}>$ </Text>bunx expo install halo-island</Text>
            </Press>
            <View style={s.code}>
              <Text style={s.codeText}>
                <Text style={{ color: C.pink }}>const</Text> ride = island(template){'\n'}
                <Text style={{ color: C.pink }}>const</Text> live = ride.start({'{'} eta: <Text style={{ color: C.amber }}>4</Text> {'}'}){'\n'}
                live.update({'{'} eta: <Text style={{ color: C.amber }}>1</Text> {'}'}, {'{'} alert: <Text style={{ color: C.amber }}>true</Text> {'}'})
              </Text>
            </View>
            <Press onPress={() => { endAll(); lives.current.clear(); setPlaying([]); }} haptic="select" style={{ alignSelf: 'center', padding: 12 }} label="End every island">
              <Text style={s.endAll}>End every island</Text>
            </Press>
            <Text style={s.signoff}>Made for the notch, with love.</Text>
          </View>
        </ScrollView>
      ) : null}
      {/* Content dissolves under the island instead of colliding with it. */}
      <Fade style={s.topFade} stops={[[0, 0.96], [0.45, 0.7], [1, 0]]} />
      </BlurTargetView>
      <HaloIslandHost placement={android ? 'cutout' : 'auto'} theme={base} motion={motion} haptics={haptics} dim={dim} blurTarget={blurTarget} />
    </View>
  );
}

function Section({ kicker, color, title, serif, children }: { kicker: string; color: string; title: string; serif: string; children: string }) {
  return (
    <View style={s.section}>
      <Kicker color={color}>{kicker}</Kicker>
      <Text style={s.h2}>{title} <Text style={s.h2Serif}>{serif}</Text></Text>
      <Text style={s.body}>{children}</Text>
    </View>
  );
}

function Setting({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={s.setting}>
      <Text style={s.settingTitle}>{title}</Text>
      {hint ? <Text style={s.settingHint}>{hint}</Text> : null}
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={[s.setting, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.settingTitle}>{title}</Text>
        {hint ? <Text style={s.settingHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** "↑ tap me" under the island, bobbing gently. */
function TapHint() {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => { if (!reduced) t.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true); }, [reduced]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: -t.value * 5 }], opacity: 0.55 + t.value * 0.35 }));
  return (
    <Animated.View style={[{ alignSelf: 'center', alignItems: 'center' }, a]}>
      <Arrow color={C.ink2} up />
      <Text style={s.tapHint}>that’s me. tap.</Text>
    </Animated.View>
  );
}

function Arrow({ color, up }: { color: string; up?: boolean }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" style={{ transform: [{ rotate: up ? '-90deg' : '0deg' }] }}>
      <Path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 40 },
  topFade: { position: 'absolute', top: 0, left: 0, right: 0, height: 96 },
  hero: { paddingHorizontal: 24, paddingTop: android ? 64 : 110, paddingBottom: 28 },
  stage: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  tapHint: { fontFamily: F.serifItalic, fontSize: 19, color: C.ink2, marginTop: 4 },
  display: { fontFamily: F.heavy, fontSize: 58, lineHeight: 60, letterSpacing: -2.4, color: C.ink, marginTop: 14 },
  displaySerif: { fontFamily: F.serifItalic, fontSize: 70, lineHeight: 72, letterSpacing: -1.2, color: C.ink, marginTop: -4 },
  lead: { fontFamily: F.regular, fontSize: 17, lineHeight: 25, color: C.ink2, marginTop: 16, letterSpacing: -0.2 },
  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 26 },
  cta: { height: 54, borderRadius: R.pill, paddingHorizontal: 24, backgroundColor: C.ink, flexDirection: 'row', alignItems: 'center', gap: 10 },
  ctaText: { fontFamily: F.bold, fontSize: 16, color: C.bg, letterSpacing: -0.2 },
  ctaGhost: { height: 54, borderRadius: R.pill, paddingHorizontal: 22, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.04)' },
  ctaGhostText: { fontFamily: F.semibold, fontSize: 16, color: C.ink, letterSpacing: -0.2 },
  gestures: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 22 },
  gesture: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, backgroundColor: 'rgba(255,255,255,0.03)' },
  gestureText: { fontFamily: F.medium, fontSize: 12, color: C.ink3 },
  section: { paddingHorizontal: 24, marginTop: 56, marginBottom: 20 },
  h2: { fontFamily: F.heavy, fontSize: 36, lineHeight: 40, letterSpacing: -1.3, color: C.ink, marginTop: 10 },
  h2Serif: { fontFamily: F.serifItalic, fontSize: 42, letterSpacing: -0.6 },
  body: { fontFamily: F.regular, fontSize: 15.5, lineHeight: 23, color: C.ink2, marginTop: 10 },
  rail: { paddingHorizontal: 20, gap: 12, paddingBottom: 6 },
  tabs: { paddingHorizontal: 20, gap: 8, paddingBottom: 16 },
  tab: { height: 36, paddingHorizontal: 16, borderRadius: R.pill, justifyContent: 'center', borderWidth: 1, borderColor: C.line, backgroundColor: 'rgba(255,255,255,0.04)' },
  tabOn: { backgroundColor: C.ink, borderColor: C.ink },
  tabText: { fontFamily: F.semibold, fontSize: 14, color: C.ink2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20, alignSelf: 'center', maxWidth: 760 },
  railLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  railText: { fontFamily: F.bold, fontSize: 15, color: C.ink, letterSpacing: -0.2 },
  railHint: { fontFamily: F.serifItalic, fontSize: 15, color: C.ink3, marginLeft: 'auto' },
  wide: { marginTop: 16, height: 52, borderRadius: R.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.04)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  wideText: { fontFamily: F.semibold, fontSize: 15, color: C.ink },
  phone: { marginTop: 18, marginHorizontal: 12, padding: 8, paddingTop: 6, borderTopLeftRadius: 40, borderTopRightRadius: 40, borderWidth: 4, borderBottomWidth: 0, borderColor: '#202027', backgroundColor: 'rgba(255,255,255,0.03)', flex: 1 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 6 },
  statusText: { fontFamily: F.bold, fontSize: 11, color: C.ink3 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: '#0B0B10' },
  mark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: F.bold, fontSize: 17, color: C.ink, letterSpacing: -0.3 },
  cardAbout: { fontFamily: F.regular, fontSize: 13, color: C.ink3, marginTop: 1 },
  play: { height: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  playText: { fontFamily: F.bold, fontSize: 13, color: C.ink },
  panel: { marginHorizontal: 20, borderRadius: R.card, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, backgroundColor: C.surface, overflow: 'hidden' },
  setting: { padding: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  settingTitle: { fontFamily: F.semibold, fontSize: 16, color: C.ink, letterSpacing: -0.2 },
  settingHint: { fontFamily: F.regular, fontSize: 13, color: C.ink3, marginTop: 3, lineHeight: 18 },
  moods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mood: { paddingHorizontal: 12, height: 36, justifyContent: 'center', borderRadius: R.pill, borderWidth: 1, borderColor: C.line, backgroundColor: 'rgba(255,255,255,0.04)' },
  moodText: { fontFamily: F.semibold, fontSize: 13, color: C.ink2 },
  caps: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 18 },
  input: { marginTop: 8, height: 46, borderRadius: 14, paddingHorizontal: 14, fontFamily: F.mono, fontSize: 14, color: C.ink, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  cap: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  capText: { fontFamily: F.semibold, fontSize: 12, color: C.ink3 },
  footer: { paddingHorizontal: 20, marginTop: 56, gap: 12 },
  code: { borderRadius: 18, padding: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  codeText: { fontFamily: F.mono, fontSize: 13, lineHeight: 21, color: C.ink },
  endAll: { fontFamily: F.semibold, fontSize: 14, color: C.ink3 },
  signoff: { fontFamily: F.serifItalic, fontSize: 20, color: C.ink3, textAlign: 'center', marginTop: 8 },
});
