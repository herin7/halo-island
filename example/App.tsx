import { StatusBar } from 'expo-status-bar';
import { HaloIslandHost, LiveIsland, capabilities, endAll, island, requestPermissions, useIslandAction } from 'halo-island';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';

import { Scenario, scenarios } from './showcase';

export default function App() {
  const { width } = useWindowDimensions();
  const columns = width >= 700 ? 3 : 2;
  const [overlay, setOverlay] = useState(false);
  const [caps, setCaps] = useState(capabilities);
  const [playing, setPlaying] = useState<string | null>(null);
  const live = useRef<LiveIsland | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => { requestPermissions().then(setCaps); }, []);
  useEffect(() => () => stop(), []);

  useIslandAction('end', () => stop());
  useIslandAction('toggle', () => {
    const paused = live.current?.state.playIcon === 'play';
    live.current?.update({ playIcon: paused ? 'pause' : 'play' });
  });

  function stop() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    live.current?.end();
    live.current = null;
    setPlaying(null);
  }

  function play(s: Scenario) {
    if (playing === s.id) return stop();
    stop();
    const tpl = island(s.template);
    // A payment receipt is a moment, not an activity: show it in-app as a toast.
    const next = s.story.length === 0
      ? tpl.show(s.initial(), { expanded: true, duration: 4000 })
      : tpl.start(s.initial(), { overlay });
    live.current = next;
    setPlaying(s.id);
    let at = 0;
    for (const [delay, patch, alert] of s.story) {
      at += delay;
      timers.current.push(setTimeout(() => next.update(patch, { alert }), at));
    }
    if (s.story.length === 0) timers.current.push(setTimeout(() => setPlaying(null), 4000));
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>HALO ISLAND</Text>
        <Text style={styles.title}>Live Activities{'\n'}for every phone.</Text>
        <Text style={styles.lead}>Tap a card. Each one plays a real-app story on the island — in-app, over other apps, and in the status bar.</Text>

        <View style={styles.chips}>
          <Chip on={caps.liveUpdates} label="Live Updates" />
          <Chip on={caps.notifications} label="Notifications" />
          <Chip on={caps.overlay} label="Overlay" />
          <Chip on={caps.liveActivities} label="Live Activities" />
        </View>

        <View style={styles.toggle}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Float over other apps</Text>
            <Text style={styles.toggleHint}>Android · start one, then press Home</Text>
          </View>
          <Switch
            value={overlay}
            trackColor={{ true: '#5FCB9C' }}
            onValueChange={async (on) => {
              if (on) setCaps(await requestPermissions({ overlay: true }));
              setOverlay(on);
            }}
          />
        </View>

        <View style={styles.grid}>
          {scenarios.map((s) => {
            const active = playing === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => play(s)}
                style={({ pressed }) => [
                  styles.card,
                  { width: `${100 / columns - 2}%`, borderColor: active ? s.accent : '#1C1F22', transform: [{ scale: pressed ? 0.97 : 1 }] },
                ]}
              >
                <View style={[styles.badge, { backgroundColor: `${s.accent}26` }]}>
                  <Text style={styles.emoji}>{s.emoji}</Text>
                </View>
                <Text style={styles.cardTitle}>{s.title}</Text>
                <Text style={styles.cardSub} numberOfLines={2}>{s.subtitle}</Text>
                <Text style={[styles.play, { color: s.accent }]}>{active ? '■  Stop' : '▶  Play'}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={() => { stop(); endAll(); }} style={styles.endAll}>
          <Text style={styles.endAllText}>End all islands</Text>
        </Pressable>
      </ScrollView>
      <HaloIslandHost />
    </View>
  );
}

function Chip({ on, label }: { on: boolean; label: string }) {
  return (
    <View style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && { color: '#5FCB9C' }]}>{on ? '●' : '○'}  {label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#07080A' },
  content: { padding: 18, paddingTop: 120, paddingBottom: 48 },
  kicker: { color: '#5FCB9C', fontWeight: '800', letterSpacing: 3, fontSize: 12 },
  title: { color: '#F7F7F2', fontSize: 38, lineHeight: 42, fontWeight: '800', marginTop: 8, letterSpacing: -1 },
  lead: { color: '#9AA09A', fontSize: 15, lineHeight: 21, marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  chip: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#121417' },
  chipOn: { backgroundColor: '#10241B' },
  chipText: { color: '#6B716B', fontSize: 12, fontWeight: '600' },
  toggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#121417', borderRadius: 18, padding: 16, marginTop: 18 },
  toggleTitle: { color: '#F7F7F2', fontSize: 16, fontWeight: '700' },
  toggleHint: { color: '#6B716B', fontSize: 12, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginTop: 18 },
  card: { backgroundColor: '#0F1113', borderRadius: 22, padding: 16, borderWidth: 1.5, minHeight: 168 },
  badge: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 24 },
  cardTitle: { color: '#F7F7F2', fontSize: 16, fontWeight: '700', marginTop: 12 },
  cardSub: { color: '#7A807A', fontSize: 12, lineHeight: 16, marginTop: 4, flex: 1 },
  play: { fontSize: 13, fontWeight: '800', marginTop: 10 },
  endAll: { alignItems: 'center', padding: 18, marginTop: 8 },
  endAllText: { color: '#6B716B', fontWeight: '600' },
});
