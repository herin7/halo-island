/** Showcase pieces: scenario cards and the in-sync order demo. */
import { IslandPreview, IslandTheme, useIsland } from 'halo-island';
import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Scenario, scenarios } from './catalog';
import { C, F, R } from './theme';
import { Glyph, Press } from './ui';

// region Scenario card

/** Memoized: the grid re-renders whenever the app does, the cards only when their own props change. */
export const ScenarioCard = memo(function ScenarioCard({ sc, width, live, base, onPress }: { sc: Scenario; width: number; live: boolean; base: IslandTheme; onPress: (sc: Scenario) => void }) {
  const state = useMemo(sc.initial, [sc]);
  return (
    <Press onPress={() => onPress(sc)} scale={0.97} style={[s.card, { width, borderColor: live ? sc.color : C.line }]} label={`${live ? 'Stop' : 'Play'} ${sc.title}`}>
      <View style={s.cardStage} pointerEvents="none">
        <View style={s.cardIsland}>
          <IslandPreview template={sc.template} state={state} theme={base} />
        </View>
      </View>
      <View style={s.cardText}>
        <View style={s.titleRow}>
          <Text style={s.title} numberOfLines={1}>{sc.title}</Text>
          {live ? <LiveDot color={sc.color} /> : null}
        </View>
        <Text style={s.about} numberOfLines={2}>{sc.about}</Text>
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

const INDIGO = scenarios.find((x) => x.id === 'indigo')!;
const BLUE = '#5E8BFF';
const STAGES = [
  { status: 'Boarding in', gate: 'G24', mins: 38, progress: 0.12 },
  { status: 'Gate changed · boarding in', gate: 'G27', mins: 24, progress: 0.22 },
  { status: 'Boarding now', gate: 'G27', mins: 1, progress: 0.35, boarding: true },
  { status: 'Gate closes in', gate: 'G27', mins: 0.5, progress: 0.4, boarding: true },
];

/**
 * One flight, two views. The card and the island render the same React state through useIsland;
 * buttons on either side change it, and both move together.
 */
export function InSync({ width }: { width: number }) {
  const [tracking, setTracking] = useState(false);
  const [stage, setStage] = useState(0);
  const [note, setNote] = useState('');
  const st = STAGES[stage];
  // Times are fixed when the stage changes, so re-renders don't resend the clock.
  const boardAt = useMemo(() => Date.now() + st.mins * 60_000, [stage, tracking]);
  const { mins: _m, ...shown } = st;
  const state = { ...shown, status: note || st.status, boardAt };

  useIsland(INDIGO.template, tracking ? state : null, {
    id: 'in-sync',
    alertOn: ['gate', 'boarding'],
    onAction: (action) => { if (action === 'pass') setNote('Boarding pass on screen'); },
  });
  useEffect(() => { if (note) { const t = setTimeout(() => setNote(''), 2500); return () => clearTimeout(t); } }, [note]);

  return (
    <View style={[s.sync, { width }]}>
      <View style={s.syncHead}>
        <View style={s.syncMark}><Glyph name="airliner" size={22} color={BLUE} /></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Animated.Text key={state.status} entering={FadeIn.duration(220)} exiting={FadeOut.duration(120)} style={s.syncStatus} numberOfLines={1}>{state.status}</Animated.Text>
          <Text style={s.syncItems} numberOfLines={1}>6E 2134 · BLR → DEL</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.syncEta}>{st.gate}</Text>
          <Text style={s.syncUnit}>gate</Text>
        </View>
      </View>
      <Progress value={st.progress} />
      <View style={s.syncRow}>
        {!tracking ? (
          <Action label="Track flight" color={BLUE} solid onPress={() => { setStage(0); setTracking(true); }} />
        ) : (
          <>
            <Action label={stage < STAGES.length - 1 ? 'Next update' : 'Restart'} color={BLUE} solid onPress={() => setStage((x) => (x + 1) % STAGES.length)} />
            <Action label="Stop" color="#FFFFFF" onPress={() => setTracking(false)} />
          </>
        )}
      </View>
      <Animated.View layout={LinearTransition} style={s.syncFoot}>
        <View style={[s.syncDot, { backgroundColor: tracking ? '#30D158' : C.ink3 }]} />
        <Text style={s.syncFootText}>{tracking ? 'In sync with the island · board to see the pass' : 'Track the flight to light up the island'}</Text>
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
    <Press onPress={onPress} haptic="select" style={[s.action, solid ? { backgroundColor: color } : { backgroundColor: color + '24' }]} label={label}>
      <Text style={[s.actionText, { color: solid ? '#FFFFFF' : color }]}>{label}</Text>
    </Press>
  );
}

// endregion

const s = StyleSheet.create({
  card: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, backgroundColor: C.surface, overflow: 'hidden', paddingBottom: 14 },
  cardStage: { height: 76, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  cardIsland: { transform: [{ scale: 0.82 }] },
  cardText: { paddingHorizontal: 14, marginTop: 12, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { fontFamily: F.semibold, fontSize: 15.5, letterSpacing: -0.2, color: C.ink, flexShrink: 1 },
  about: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.ink3, minHeight: 36 },
  sync: { alignSelf: 'center', borderRadius: R.card, padding: 18, gap: 16, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  syncMark: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(94,139,255,0.18)' },
  syncHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  syncStatus: { fontFamily: F.semibold, fontSize: 17, color: C.ink, letterSpacing: -0.3 },
  syncItems: { fontFamily: F.regular, fontSize: 13, color: C.ink2 },
  syncEta: { fontFamily: F.semibold, fontSize: 30, lineHeight: 34, color: '#5E8BFF', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  syncUnit: { fontFamily: F.semibold, fontSize: 12, color: '#5E8BFF', marginTop: -2 },
  track: { height: 4, borderRadius: 2, backgroundColor: '#2C2C2E', overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: '#5E8BFF' },
  syncRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  action: { height: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center' },
  actionText: { fontFamily: F.semibold, fontSize: 14 },
  syncFoot: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  syncDot: { width: 7, height: 7, borderRadius: 4 },
  syncFootText: { fontFamily: F.medium, fontSize: 12.5, color: C.ink3 },
});
