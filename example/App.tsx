import { StatusBar } from 'expo-status-bar';
import { HaloIslandHost, LiveIsland, capabilities, endAll, island, presets, requestPermissions, useIslandAction } from 'halo-island';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

const ride = island(presets.ride);
const timer = island(presets.timer);
const media = island(presets.media);
const goal = island(presets.goal);
const download = island(presets.progress);
const call = island(presets.call);
const score = island(presets.score);
const toast = island(presets.toast);

export default function App() {
  const [overlay, setOverlay] = useState(false);
  const [caps, setCaps] = useState(capabilities);
  const live = useRef<LiveIsland | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval>>(undefined);

  useIslandAction('cancel', () => stop());
  useIslandAction('stop', () => stop());
  useIslandAction('hangup', () => stop());
  useIslandAction('end', () => stop());
  useIslandAction('toggle', () => {
    const playing = live.current?.state.playIcon === 'pause';
    live.current?.update({ playIcon: playing ? 'play' : 'pause' });
  });

  useEffect(() => () => clearInterval(ticker.current), []);

  function stop() {
    clearInterval(ticker.current);
    live.current?.end();
    live.current = null;
  }

  /** Starts an island and simulates the app updating it every second. */
  function run(next: LiveIsland, tick?: (n: number) => Record<string, string | number>) {
    stop();
    live.current = next;
    let n = 0;
    if (tick) ticker.current = setInterval(() => next.update(tick(++n)), 1000);
  }

  const opts = { overlay };
  const demos: [string, () => void][] = [
    ['🚗  Ride', () => run(ride.start({ title: 'Asha is on the way', driver: 'White Swift · KA 01 AB 1234', eta: '6 min', progress: 0.1 }, opts),
      (n) => ({ eta: `${Math.max(0, 6 - Math.floor(n / 5))} min`, progress: Math.min(1, 0.1 + n * 0.03) }))],
    ['⏱  Timer', () => run(timer.start({ label: 'Focus', endsAt: Date.now() + 25 * 60_000 }, opts))],
    ['🎵  Media', () => run(media.start({ title: 'Blinding Lights', artist: 'The Weeknd', artwork: 'https://picsum.photos/seed/halo/200', progress: 0, playIcon: 'pause' }, opts),
      (n) => ({ progress: (n % 200) / 200 }))],
    ['🚶  Goal', () => run(goal.start({ label: 'Steps today', value: '4,200', goal: '8,000', progress: 0.52 }, opts),
      (n) => ({ value: (4200 + n * 37).toLocaleString(), progress: Math.min(1, (4200 + n * 37) / 8000) }))],
    ['⬇️  Download', () => run(download.start({ title: 'Season 2 · Episode 4', percent: '0%', progress: 0 }, opts),
      (n) => ({ percent: `${Math.min(100, n * 4)}%`, progress: Math.min(1, n * 0.04) }))],
    ['📞  Call', () => run(call.start({ name: 'Mom', startedAt: Date.now() }, opts))],
    ['⚽  Score', () => run(score.start({ home: 'IND', away: 'AUS', homeScore: 0, awayScore: 0, clock: "12'" }, opts),
      (n) => ({ homeScore: Math.floor(n / 6), awayScore: Math.floor(n / 9), clock: `${12 + n}'` }))],
    ['✅  Toast (in-app)', () => toast.show({ title: 'Saved', message: 'Your meal was logged.', icon: 'check' }, { expanded: true })],
  ];

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Halo Island</Text>
        <Text style={styles.caption}>
          Live updates {caps.liveUpdates ? '✓' : '✗'} · Notifications {caps.notifications ? '✓' : '✗'} · Overlay {caps.overlay ? '✓' : '✗'} · Live Activities {caps.liveActivities ? '✓' : '✗'}
        </Text>
        <View style={styles.row}>
          <Text style={styles.label}>Show over other apps (Android)</Text>
          <Switch value={overlay} onValueChange={async (on) => {
            if (on) setCaps(await requestPermissions({ overlay: true }));
            setOverlay(on);
          }} />
        </View>
        <Pressable style={styles.secondary} onPress={async () => setCaps(await requestPermissions())}>
          <Text style={styles.secondaryText}>Request notification permission</Text>
        </Pressable>
        {demos.map(([label, onPress]) => (
          <Pressable key={label} style={styles.demo} onPress={onPress}>
            <Text style={styles.demoText}>{label}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.secondary} onPress={() => { stop(); endAll(); }}>
          <Text style={styles.secondaryText}>End all</Text>
        </Pressable>
      </ScrollView>
      <HaloIslandHost />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0C0B' },
  content: { padding: 20, paddingTop: 110, gap: 10 },
  title: { color: '#F7F7F2', fontSize: 32, fontWeight: '800' },
  caption: { color: '#9AA09A', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: '#F7F7F2', fontSize: 15 },
  demo: { backgroundColor: '#181B19', borderRadius: 16, padding: 18 },
  demoText: { color: '#F7F7F2', fontSize: 17, fontWeight: '600' },
  secondary: { padding: 14, alignItems: 'center' },
  secondaryText: { color: '#5FCB9C', fontWeight: '600' },
});
