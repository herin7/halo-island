/** Showcase pieces: floating 3D objects, scenario cards, and the in-sync order demo. */
import { IslandPreview, IslandTheme, useIsland } from 'halo-island';
import { memo, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Scenario, scenarios } from './catalog';
import { media } from './media';

const GLOW = require('./assets/textures/glow.png');
import { C, F, R } from './theme';
import { Glow, Press } from './ui';

// region Floating object

/** A 3D object hovering over a soft contact shadow, drifting on its own phase. */
export function Floating({ name, size, phase = 0, tilt = 6 }: { name: string; size: number; phase?: number; tilt?: number }) {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) t.value = withDelay(phase * 700, withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduced]);
  const body = useAnimatedStyle(() => ({ transform: [{ translateY: -t.value * size * 0.07 }, { rotate: `${(t.value - 0.5) * tilt}deg` }] }));
  const shadow = useAnimatedStyle(() => ({ opacity: 0.85 - t.value * 0.3, transform: [{ scaleX: 1 - t.value * 0.16 }] }));
  const src = media[name as keyof typeof media];
  return (
    <View style={{ width: size, height: size * 1.12, alignItems: 'center' }}>
      {/* A soft contact shadow: the glow texture, tinted black and squashed flat. */}
      <Animated.Image source={GLOW} tintColor="#000000" resizeMode="stretch" style={[{ position: 'absolute', bottom: -size * 0.03, width: size * 0.9, height: size * 0.2 }, shadow]} />
      <Animated.View style={body}>
        {src ? <Image source={src} style={{ width: size, height: size }} resizeMode="contain" /> : null}
      </Animated.View>
    </View>
  );
}

// endregion

// region Scenario card

/** Memoized: the grid re-renders whenever the app does, the cards only when their own props change. */
export const ScenarioCard = memo(function ScenarioCard({ sc, width, live, base, onPress, index }: { sc: Scenario; width: number; live: boolean; base: IslandTheme; onPress: (sc: Scenario) => void; index: number }) {
  const state = useMemo(sc.initial, [sc]);
  return (
    <Press onPress={() => onPress(sc)} scale={0.97} style={[s.card, { width, borderColor: live ? sc.color + 'AA' : 'rgba(255,255,255,0.09)' }]} label={`${live ? 'Stop' : 'Play'} ${sc.title}`}>
      <View style={[s.cardStage, { height: width * 0.78 }]}>
        <Glow color={sc.color} size={width * 1.25} opacity={live ? 0.9 : 0.5} style={{ position: 'absolute', top: -width * 0.36 }} />
        <Floating name={sc.hero} size={width * 0.46} phase={index % 4} />
      </View>
      <View style={s.cardIsland} pointerEvents="none">
        <IslandPreview template={sc.template} state={state} theme={base} />
      </View>
      <View style={s.cardText}>
        <Text style={s.group}>{sc.group}</Text>
        <Text style={s.title} numberOfLines={1}>{sc.title}</Text>
        <Text style={s.about} numberOfLines={2}>{sc.about}</Text>
      </View>
      <View style={[s.pill, live && { backgroundColor: sc.color }]}>
        {live ? <LiveDot color={sc.color === '#FFFFFF' ? '#000' : '#fff'} /> : null}
        <Text style={[s.pillText, live && { color: sc.color === '#FFFFFF' ? '#000' : '#fff' }]}>{live ? 'Live' : sc.toast ? 'Show' : 'Play'}</Text>
      </View>
    </Press>
  );
});

function LiveDot({ color }: { color: string }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withRepeat(withSequence(withTiming(1, { duration: 600 }), withTiming(0, { duration: 600 })), -1); }, []);
  const a = useAnimatedStyle(() => ({ opacity: 0.4 + t.value * 0.6 }));
  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }, a]} />;
}

// endregion

// region In sync

const SWIGGY = scenarios.find((x) => x.id === 'swiggy')!;
const STAGES = [
  { status: 'Order confirmed', eta: 30, progress: 0.06, vehicle: 'steaming-bowl', rider: '' },
  { status: 'Packing your biryani', eta: 24, progress: 0.2, vehicle: 'steaming-bowl', rider: '' },
  { status: 'Ravi picked it up', eta: 16, progress: 0.42, vehicle: 'scooter', rider: 'Ravi' },
  { status: 'Ravi is 2 km away', eta: 8, progress: 0.7, vehicle: 'scooter', rider: 'Ravi' },
  { status: 'Delivered. Enjoy!', eta: 0, progress: 1, vehicle: 'house', rider: '', delivered: true },
];

/**
 * One order, two views. The card and the island render the same React state through useIsland;
 * buttons on either side change it, and both move together.
 */
export function InSync({ width }: { width: number }) {
  const [tracking, setTracking] = useState(false);
  const [stage, setStage] = useState(0);
  const [tip, setTip] = useState(0);
  const [note, setNote] = useState('');
  const st = STAGES[stage];
  const state = { ...st, items: `Meghana Foods · 2 items${tip ? ` · ₹${tip} tip` : ''}`, status: note || st.status };

  useIsland(SWIGGY.template, tracking ? state : null, {
    id: 'in-sync',
    alertOn: ['vehicle'],
    onAction: (action) => {
      if (action === 'call') setNote('Calling Ravi…');
      if (action === 'rate') { setNote('Thanks for rating!'); }
    },
  });
  useEffect(() => { if (note) { const t = setTimeout(() => setNote(''), 2500); return () => clearTimeout(t); } }, [note]);

  return (
    <View style={[s.sync, { width }]}>
      <View style={s.syncHead}>
        <Floating name={st.vehicle} size={58} tilt={4} />
        <View style={{ flex: 1, gap: 2 }}>
          <Animated.Text key={state.status} entering={FadeIn.duration(220)} exiting={FadeOut.duration(120)} style={s.syncStatus} numberOfLines={1}>{state.status}</Animated.Text>
          <Text style={s.syncItems} numberOfLines={1}>{state.items}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.syncEta}>{st.eta}</Text>
          <Text style={s.syncUnit}>min</Text>
        </View>
      </View>
      <Progress value={st.progress} />
      <View style={s.syncRow}>
        {!tracking ? (
          <Action label="Start tracking" color="#FC8019" solid onPress={() => { setStage(0); setTip(0); setTracking(true); }} />
        ) : (
          <>
            <Action label={stage < STAGES.length - 1 ? 'Next stage' : 'Restart'} color="#FC8019" solid onPress={() => setStage((x) => (x + 1) % STAGES.length)} />
            <Action label={`+₹20 tip`} color="#FC8019" onPress={() => setTip((x) => x + 20)} />
            <Action label="Stop" color="#FFFFFF" onPress={() => setTracking(false)} />
          </>
        )}
      </View>
      <Animated.View layout={LinearTransition} style={s.syncFoot}>
        <View style={[s.syncDot, { backgroundColor: tracking ? '#30D158' : C.ink3 }]} />
        <Text style={s.syncFootText}>{tracking ? 'In sync with the island · tap Call on it' : 'Start tracking to light up the island'}</Text>
      </Animated.View>
    </View>
  );
}

function Progress({ value }: { value: number }) {
  const p = useSharedValue(value);
  useEffect(() => { p.value = withSpring(value, { duration: 1100, dampingRatio: 0.85 }); }, [value]);
  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <View style={s.track}>
      <Animated.View style={[s.fill, fill]} />
    </View>
  );
}

function Action({ label, color, solid, onPress }: { label: string; color: string; solid?: boolean; onPress: () => void }) {
  return (
    <Press onPress={onPress} haptic="select" style={[s.action, solid ? { backgroundColor: color } : { backgroundColor: color + '1F', borderColor: color + '44' }]} label={label}>
      <Text style={[s.actionText, { color: solid ? '#1E0A00' : color }]}>{label}</Text>
    </Press>
  );
}

// endregion

const s = StyleSheet.create({
  card: { borderRadius: 26, borderWidth: 1, backgroundColor: '#0C0C11', overflow: 'hidden', paddingBottom: 14, experimental_backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 40%)' },
  cardStage: { alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  cardIsland: { alignItems: 'center', marginTop: -6, transform: [{ scale: 0.86 }] },
  cardText: { paddingHorizontal: 14, marginTop: 8, gap: 2 },
  group: { fontFamily: F.semibold, fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', color: C.ink3 },
  title: { fontFamily: F.bold, fontSize: 17, letterSpacing: -0.3, color: C.ink },
  about: { fontFamily: F.regular, fontSize: 12.5, lineHeight: 17, color: C.ink2, minHeight: 34 },
  pill: { alignSelf: 'flex-start', marginLeft: 14, marginTop: 10, height: 30, paddingHorizontal: 12, borderRadius: R.pill, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.09)' },
  pillText: { fontFamily: F.bold, fontSize: 12.5, color: C.ink },
  sync: { alignSelf: 'center', borderRadius: R.card, padding: 18, gap: 14, backgroundColor: '#0E0B09', borderWidth: 1, borderColor: 'rgba(252,128,25,0.28)', experimental_backgroundImage: 'linear-gradient(180deg, rgba(252,128,25,0.14), rgba(252,128,25,0) 55%)' },
  syncHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  syncStatus: { fontFamily: F.bold, fontSize: 17, color: C.ink, letterSpacing: -0.3 },
  syncItems: { fontFamily: F.regular, fontSize: 13, color: C.ink2 },
  syncEta: { fontFamily: F.heavy, fontSize: 34, lineHeight: 36, color: '#FC8019', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  syncUnit: { fontFamily: F.bold, fontSize: 12, color: '#FC8019', marginTop: -2 },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(252,128,25,0.18)', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: '#FC8019' },
  syncRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  action: { height: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  actionText: { fontFamily: F.bold, fontSize: 14 },
  syncFoot: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  syncDot: { width: 7, height: 7, borderRadius: 4 },
  syncFootText: { fontFamily: F.medium, fontSize: 12.5, color: C.ink3 },
});
