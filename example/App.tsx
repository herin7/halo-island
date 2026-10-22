import { StatusBar } from 'expo-status-bar';
import { HaloIslandHost, IslandPreview, LiveIsland, capabilities, endAll, island, onAction, requestPermissions } from 'halo-island';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';

import { Scenario, scenarios } from './showcase';

// Kimbo's light palette: warm paper, so the black islands carry all the color.
const C = {
  background: '#F4F1EC',
  surface: '#FCFAF7',
  border: '#E3DED6',
  text: '#171815',
  secondary: '#565A54',
  muted: '#858981',
  brand: '#E85F43',
};
const F = { regular: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold', heavy: 'Manrope_800ExtraBold' };

const toast = island({
  compact: { leading: { type: 'icon', name: 'check', color: '#30D158' }, trailing: { type: 'text', text: '{title}', style: { weight: 'bold' } } },
  theme: { accent: '#30D158', fonts: F },
});

export default function App() {
  const [overlay, setOverlay] = useState(false);
  const [caps, setCaps] = useState(capabilities);
  const [playing, setPlaying] = useState<string | null>(null);
  const live = useRef<LiveIsland | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => { requestPermissions().then(setCaps); }, []);
  useEffect(() => () => stop(), []);

  // Island buttons arrive here as plain strings, from every surface.
  useEffect(() => onAction((_, action) => {
    const current = live.current;
    const say = (title: string) => toast.show({ title }, { duration: 1800 });
    switch (action) {
      case 'call': return Linking.openURL('tel:+919876543210');
      case 'chat': return Linking.openURL('sms:+919876543210');
      case 'toggle': return current?.update({ playIcon: current.state.playIcon === 'play' ? 'pause' : 'play' });
      case 'next': return current?.update({ title: 'Apna Bana Le', artist: 'Arijit Singh', progress: 0 });
      case 'previous': return current?.update({ title: 'Kesariya', artist: 'Arijit Singh', progress: 0 });
      case 'buy': return say('Buy order placed');
      case 'sell': return say('Sell order placed');
      case 'download': return say('Saved to Photos');
      case 'pause': return say('Run paused');
      case 'end': return stop();
      default: return Alert.alert('Island action', action);
    }
  }), []);

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
    const next = s.toast ? tpl.show(s.initial(), { expanded: true, duration: 4500 }) : tpl.start(s.initial(), { overlay });
    live.current = next;
    setPlaying(s.id);
    let at = 0;
    for (const [delay, patch, alert] of s.story) {
      at += delay;
      timers.current.push(setTimeout(() => next.update(patch, { alert }), at));
    }
    if (s.toast) timers.current.push(setTimeout(() => setPlaying(null), 4500));
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Halo Island</Text>
        <Text style={styles.lead}>
          Live Activities for React Native, on iOS and Android. Tap an app to start its island, then press Home: it keeps running over other apps and in the status bar.
        </Text>

        <View style={styles.panel}>
          <View style={styles.setting}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Show over other apps</Text>
              <Text style={styles.settingHint}>{caps.overlay ? 'Permission granted' : 'Needs the overlay permission'}</Text>
            </View>
            <Switch
              value={overlay}
              trackColor={{ true: C.text, false: C.border }}
              thumbColor={C.surface}
              onValueChange={async (on) => {
                if (on) setCaps(await requestPermissions({ overlay: true }));
                setOverlay(on);
              }}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.setting}>
            <Text style={[styles.settingTitle, { flex: 1 }]}>Status bar chip</Text>
            <Text style={styles.settingValue}>{caps.liveUpdates ? 'Live Updates' : caps.notifications ? 'Ongoing notification' : 'Off'}</Text>
          </View>
        </View>

        <Text style={styles.section}>Apps</Text>
        <View style={styles.panel}>
          {scenarios.map((s, i) => {
            const active = playing === s.id;
            return (
              <View key={s.id}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <Pressable onPress={() => play(s)} style={({ pressed }) => [styles.app, pressed && { backgroundColor: '#F1EDE6' }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.appTitle}>{s.title}</Text>
                    <Text style={styles.appAbout} numberOfLines={1}>{s.about}</Text>
                  </View>
                  {active ? <Text style={styles.live}>Running</Text> : <IslandPreview template={s.template} state={s.initial()} />}
                </Pressable>
              </View>
            );
          })}
        </View>

        <Pressable onPress={() => { stop(); endAll(); }} style={styles.endAll}>
          <Text style={styles.endAllText}>End every island</Text>
        </Pressable>
      </ScrollView>
      <HaloIslandHost />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 20, paddingTop: 116, paddingBottom: 48 },
  title: { fontFamily: F.bold, fontSize: 40, lineHeight: 46, letterSpacing: -1.4, color: C.text },
  lead: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, letterSpacing: -0.12, color: C.secondary, marginTop: 8 },
  panel: { backgroundColor: C.surface, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, marginTop: 20, overflow: 'hidden' },
  setting: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  settingTitle: { fontFamily: F.semibold, fontSize: 16, letterSpacing: -0.2, color: C.text },
  settingHint: { fontFamily: F.regular, fontSize: 13, color: C.muted, marginTop: 2 },
  settingValue: { fontFamily: F.semibold, fontSize: 14, color: C.secondary },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginLeft: 16 },
  section: { fontFamily: F.semibold, fontSize: 13, letterSpacing: 0.1, color: C.muted, marginTop: 28, marginLeft: 4 },
  app: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 68 },
  appTitle: { fontFamily: F.bold, fontSize: 17, letterSpacing: -0.3, color: C.text },
  appAbout: { fontFamily: F.regular, fontSize: 13, color: C.muted },
  live: { fontFamily: F.bold, fontSize: 13, color: C.brand },
  endAll: { alignItems: 'center', padding: 20, marginTop: 8 },
  endAllText: { fontFamily: F.semibold, fontSize: 14, color: C.muted },
});
