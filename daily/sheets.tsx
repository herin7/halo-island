/** Food logging and settings, as bottom sheets over the dashboard. */
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Linking, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { CARDS, CardId, MOMENTS, Moment, Prefs, Profile, ROWS, Row, Saved, activeProfile, defaultPrefs, favourites, kcal, logFood, protein, removeFood } from './day';
import { DeskStatus, Route, deskVia } from './desk';
import { loginUrl, requestToken } from './kite';
import { ios } from './platform';
import { C, F } from './theme';
import { Field, Meter, Pill, Press, Sheet, T, Toggle } from './ui';

type Update = (fn: (s: Saved) => Saved) => void;

export function FoodSheet({ open, onClose, saved, update }: { open: boolean; onClose: () => void; saved: Saved; update: Update }) {
  const [name, setName] = useState('');
  const [cal, setCal] = useState('');
  const [prot, setProt] = useState('');
  const add = () => {
    if (!name.trim() || !Number(cal)) return;
    update((s) => logFood(s, name.trim(), Number(cal), Number(prot) || 0));
    setName(''); setCal(''); setProt('');
  };
  return (
    <Sheet open={open} onClose={onClose} title="Log food">
      <ScrollView contentContainerStyle={{ gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={st.totals}>
          <Total label="kcal" value={kcal(saved)} goal={saved.goals.kcal} color={C.kcal} />
          <Total label="protein g" value={protein(saved)} goal={saved.goals.protein} color={C.protein} />
        </View>
        <View style={st.grid}>
          {favourites(saved).map((f) => (
            <Press key={f.name} onPress={() => update((s) => logFood(s, f.name, f.kcal, f.protein))} style={st.fav} label={`Log ${f.name}`}>
              <Text style={st.favName} numberOfLines={1}>{f.name}</Text>
              <Text style={st.favMeta}>{f.kcal} kcal · {f.protein} g</Text>
            </Press>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Field label="Food" value={name} onChangeText={setName} placeholder="Poha" style={{ flex: 2 }} />
          <Field label="kcal" value={cal} onChangeText={setCal} numeric placeholder="270" style={{ flex: 1 }} />
          <Field label="Protein" value={prot} onChangeText={setProt} numeric placeholder="6" style={{ flex: 1 }} />
        </View>
        <Pill label="Add" onPress={add} color={C.kcal} filled />
        {saved.food.length ? <Text style={st.section}>Today</Text> : null}
        {[...saved.food].reverse().map((f) => (
          <View key={f.t} style={st.entry}>
            <View style={{ flex: 1 }}>
              <Text style={st.favName}>{f.name}</Text>
              <T style={{ fontSize: 12.5 }}>{new Date(f.t).toTimeString().slice(0, 5)} · {f.kcal} kcal · {f.protein} g protein</T>
            </View>
            <Press onPress={() => update((s) => removeFood(s, f.t))} style={st.remove} label={`Remove ${f.name}`}>
              <Text style={st.removeText}>Remove</Text>
            </Press>
          </View>
        ))}
      </ScrollView>
    </Sheet>
  );
}

function Total({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <Text style={st.totalValue}>{value.toLocaleString('en-IN')}<Text style={st.totalGoal}> / {goal} {label}</Text></Text>
      <Meter value={value / goal} color={color} />
    </View>
  );
}

export function SettingsSheet({ open, onClose, saved, update, status, overlayOk, onOverlay, onClaude, onClaudeCode, onKite }: {
  open: boolean; onClose: () => void; saved: Saved; update: Update; status: DeskStatus; overlayOk: boolean; onOverlay: (on: boolean) => void;
  onClaude: () => void; onClaudeCode: (text: string) => void; onKite: () => void;
}) {
  const [code, setCode] = useState('');
  const p = saved.prefs;
  const pref = (patch: Partial<Prefs>) => update((s) => ({ ...s, prefs: { ...s.prefs, ...patch } }));
  const prof = activeProfile(saved);
  const setProf = (patch: Partial<Profile>) => update((s) => ({ ...s, prefs: { ...s.prefs, profiles: s.prefs.profiles.map((x, i) => (i === s.prefs.profile ? { ...x, ...patch } : x)) } }));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= p.cards.length) return;
    const cards = [...p.cards];
    [cards[i], cards[j]] = [cards[j], cards[i]];
    pref({ cards });
  };
  const goal = (k: keyof Saved['goals']) => (v: string) => update((s) => ({ ...s, goals: { ...s.goals, [k]: Number(v) || 0 } }));
  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <ScrollView contentContainerStyle={{ gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={st.section}>Claude account</Text>
        {saved.claude ? (
          <>
            <T>Signed in. Limits come straight from your account, every 3 minutes, PC or not.</T>
            <View style={{ flexDirection: 'row' }}><Pill label="Sign out" onPress={() => update((s) => ({ ...s, claude: null, claudeUsage: null }))} color={C.ink} /></View>
          </>
        ) : (
          <>
            <T>Sign in the way Claude Code does. Halo only asks to read your profile and usage; it can’t send prompts. After approving, tap Copy code and come back.</T>
            <View style={{ flexDirection: 'row' }}><Pill label="Sign in with Claude" onPress={onClaude} color={C.claude} filled /></View>
            <Field label="Or paste the code" value={code} onChangeText={setCode} placeholder="code#state" />
            {code ? <View style={{ flexDirection: 'row' }}><Pill label="Use code" onPress={() => { onClaudeCode(code); setCode(''); }} color={C.claude} /></View> : null}
          </>
        )}

        <Text style={st.section}>Zerodha</Text>
        <Toggle title="Preview with a sample portfolio" hint="A moving sample day for demos and recordings. Your real account is untouched." value={!!saved.kiteDemo} onChange={(on) => update((s) => ({ ...s, kiteDemo: on }))} />
        <T>Free with Kite Connect Personal. At developers.kite.trade create an app with redirect URL <Text style={st.code}>https://127.0.0.1/halo</Text>, then paste its key and secret. They stay on this phone.</T>
        <Field label="API key" value={saved.kite?.apiKey ?? ''} onChangeText={(apiKey) => update((s) => ({ ...s, kite: { apiSecret: '', token: '', user: '', expiresAt: 0, ...s.kite, apiKey: apiKey.trim() } }))} placeholder="from developers.kite.trade" />
        <Field label="API secret" value={saved.kite?.apiSecret ?? ''} onChangeText={(apiSecret) => update((s) => ({ ...s, kite: { apiKey: '', token: '', user: '', expiresAt: 0, ...s.kite, apiSecret: apiSecret.trim() } }))} placeholder="shown once when you create the app" secure />
        {saved.kite?.token ? (
          <View style={{ flexDirection: 'row' }}><Pill label={`Log out ${saved.kite.user}`} onPress={() => update((s) => ({ ...s, kite: s.kite && { ...s.kite, token: '' }, kitePf: null }))} color={C.ink} /></View>
        ) : saved.kite?.apiKey && saved.kite.apiSecret ? (
          <View style={{ flexDirection: 'row' }}><Pill label="Log in to Kite" onPress={onKite} color={C.ink} filled /></View>
        ) : null}

        <Text style={st.section}>Your PC</Text>
        <Text style={st.fieldLabel}>Connection</Text>
        <View style={st.chips}>
          {([['auto', 'Auto'], ['local', 'Local / Tailscale'], ['relay', 'Relay']] as [Route, string][]).map(([r, label]) => (
            <Pill key={r} label={label} onPress={() => update((s) => ({ ...s, desk: { ...s.desk, route: r } }))} color={C.desk} filled={(saved.desk.route ?? 'auto') === r} />
          ))}
        </View>
        <T style={{ fontSize: 12.5 }}>{saved.desk.relay
          ? 'Relay paired. Auto talks to your PC directly on Wi-Fi or Tailscale and switches to the relay when it can’t; everything through the relay is sealed with a key only your phone and PC have.'
          : 'No relay yet. Run relay/deploy.mjs on your PC, restart the bridge and scan the pairing QR again to use Halo away from home. Local works with your Wi-Fi or your PC’s Tailscale address.'}</T>
        <T>On your PC run <Text style={st.code}>node tools/island-bridge/bridge.mjs --lan</Text>, open <Text style={st.code}>localhost:7337/pair</Text> and scan the QR code with your camera. Or type it in:</T>
        <Field label="Address" value={saved.desk.addr} onChangeText={(addr) => update((s) => ({ ...s, desk: { ...s.desk, addr } }))} placeholder="192.168.1.5:7337" />
        <Field label="Token" value={saved.desk.token} onChangeText={(token) => update((s) => ({ ...s, desk: { ...s.desk, token } }))} placeholder="printed by the bridge" secure />
        <T style={{ color: status === 'live' ? C.steps : status === 'error' ? C.fail : C.ink3 }}>
          {status === 'live' ? (deskVia() === 'relay' ? 'Connected through your relay · end-to-end sealed' : 'Connected directly') : status === 'connecting' ? 'Connecting…' : status === 'error' ? 'Can’t reach your PC' : 'Not paired'}
        </T>

        <Text style={st.section}>Island</Text>
        <Toggle title="Show the island" hint="Swipe the pill up to tuck it away; it still comes back when Claude asks, a file arrives, CI finishes or it’s protein time." value={!saved.quiet} onChange={(on) => update((s) => ({ ...s, quiet: !on }))} />
        {ios ? null : <>
        <Toggle title="Over other apps" hint={overlayOk ? 'Halo floats over every app.' : 'Needs the “Display over other apps” permission.'} value={saved.overlay && overlayOk} onChange={onOverlay} />
        <T style={{ fontSize: 12.5 }}>OnePlus pauses apps in the background. To keep the island live: Settings → Battery → Halo → Allow background activity.</T>
        </>}
        <Pill label="Open app settings" onPress={() => Linking.openSettings()} color={C.ink} />

        <Text style={st.section}>Daily goals</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Field label="Steps" value={String(saved.goals.steps)} onChangeText={goal('steps')} numeric style={{ flex: 1 }} />
          <Field label="kcal" value={String(saved.goals.kcal)} onChangeText={goal('kcal')} numeric style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Field label="Protein g" value={String(saved.goals.protein)} onChangeText={goal('protein')} numeric style={{ flex: 1 }} />
          <Field label="Water glasses" value={String(saved.goals.water)} onChangeText={goal('water')} numeric style={{ flex: 1 }} />
        </View>
        <Toggle title="Protein reminder" hint="At each hour below the island pops open if you’re behind pace (3 checks: under 30%, 60%, 90% of your goal)." value={p.reminder.on} onChange={(on) => pref({ reminder: { ...p.reminder, on } })} />
        <ListField label="Reminder hours (24h)" value={p.reminder.hours.map(String)} placeholder="13, 17, 21" onChange={(v) => pref({ reminder: { ...p.reminder, hours: v.map(Number).filter((h) => h >= 0 && h < 24) } })} />

        <Text style={st.section}>Island moments</Text>
        <T style={{ fontSize: 12.5 }}>What may take over the island. Off ones still show on the dashboard.</T>
        {(Object.keys(MOMENTS) as Moment[]).map((m) => (
          <Toggle key={m} title={MOMENTS[m]} value={p.island[m]} onChange={(on) => pref({ island: { ...p.island, [m]: on } })} />
        ))}

        <Text style={st.section}>Profiles</Text>
        <T style={{ fontSize: 12.5 }}>A profile decides what the island's day view and the dashboard show. Switch from the header, or with the island's switch button.</T>
        <View style={st.chips}>
          {p.profiles.map((pr, i) => (
            <Pill key={i} label={pr.name || 'Untitled'} onPress={() => pref({ profile: i })} color={C.steps} filled={p.profile === i} />
          ))}
          <Pill label="+ New" onPress={() => pref({ profiles: [...p.profiles, { ...prof, name: `${prof.name} copy` }], profile: p.profiles.length })} color={C.ink3} />
        </View>
        <Field label="Name" value={prof.name} onChangeText={(name) => setProf({ name })} placeholder="Work" />
        <Text style={st.fieldLabel}>Resting island shows</Text>
        <View style={st.chips}>
          {([['steps', 'Steps'], ['claude', 'Claude %'], ['kcal', 'kcal'], ['protein', 'Protein'], ['kite', 'Day P&L']] as const).map(([k, label]) => (
            <Pill key={k} label={label} onPress={() => setProf({ idle: k })} color={C.steps} filled={prof.idle === k} />
          ))}
        </View>
        <Text style={st.fieldLabel}>Island day view</Text>
        <View style={st.chips}>
          {(Object.keys(ROWS) as Row[]).map((r) => (
            <Pill key={r} label={ROWS[r]} onPress={() => setProf({ rows: prof.rows.includes(r) ? prof.rows.filter((x) => x !== r) : [...prof.rows, r] })} color={C.desk} filled={prof.rows.includes(r)} />
          ))}
        </View>
        <Text style={st.fieldLabel}>Dashboard cards</Text>
        <View style={st.chips}>
          {(Object.keys(CARDS) as CardId[]).map((c) => (
            <Pill key={c} label={CARDS[c]} onPress={() => setProf({ cards: prof.cards.includes(c) ? prof.cards.filter((x) => x !== c) : [...prof.cards, c] })} color={C.desk} filled={prof.cards.includes(c)} />
          ))}
        </View>
        {p.profiles.length > 1 ? (
          <View style={{ flexDirection: 'row' }}><Pill label={`Delete ${prof.name || 'profile'}`} onPress={() => pref({ profiles: p.profiles.filter((_, i) => i !== p.profile), profile: 0 })} color={C.fail} /></View>
        ) : null}

        <Text style={st.section}>Dashboard</Text>
        {p.cards.map((c, i) => (
          <View key={c.id} style={st.cardRow}>
            <Press onPress={() => move(i, -1)} style={st.move} label={`Move ${CARDS[c.id]} up`}><Text style={st.moveText}>↑</Text></Press>
            <Press onPress={() => move(i, 1)} style={st.move} label={`Move ${CARDS[c.id]} down`}><Text style={st.moveText}>↓</Text></Press>
            <View style={{ flex: 1 }}><Toggle title={CARDS[c.id]} value={c.on} onChange={(on) => pref({ cards: p.cards.map((x) => (x.id === c.id ? { ...x, on } : x)) })} /></View>
          </View>
        ))}

        <Text style={st.section}>Developer</Text>
        <ListField label="npm packages to track" value={p.npm} placeholder="halo-island, react-native-svg" onChange={(npm) => update((s) => ({ ...s, prefs: { ...s.prefs, npm }, npmAt: 0 }))} />
        <ListField label="Repos to watch for releases" value={p.repos} placeholder="facebook/react-native, expo/expo" onChange={(repos) => update((s) => ({ ...s, prefs: { ...s.prefs, repos }, releasesAt: 0 }))} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Field label="Hacker News min points" value={String(p.newsMin)} onChangeText={(v) => pref({ newsMin: Number(v) || 0 })} numeric style={{ flex: 1 }} />
          <Field label="Step length cm" value={String(p.stepCm)} onChangeText={(v) => pref({ stepCm: Number(v) || 75 })} numeric style={{ flex: 1 }} />
        </View>
        <Pill label="Reset preferences" onPress={() => update((s) => ({ ...s, prefs: defaultPrefs() }))} color={C.ink3} />
        {/* Which JS is running: the one built into the APK, or an OTA update. */}
        <T style={{ fontSize: 12.5, color: C.ink3 }}>
          {`Runtime ${Updates.runtimeVersion ?? '—'} · ${Updates.isEmbeddedLaunch ? 'built-in' : `update ${Updates.updateId?.slice(0, 8)} · ${Updates.createdAt?.toLocaleString('en-IN') ?? ''}`}`}
        </T>
      </ScrollView>
    </Sheet>
  );
}

/** A comma-separated list. Keeps what you type (trailing commas and all) and saves the parsed list. */
function ListField({ label, value, placeholder, onChange }: { label: string; value: string[]; placeholder: string; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  return <Field label={label} value={text} placeholder={placeholder} onChangeText={(t) => { setText(t); onChange(t.split(',').map((x) => x.trim()).filter(Boolean)); }} />;
}

/**
 * Kite's login, inside the app (what Kite recommends for apps without a server). It ends on the
 * registered redirect URL; the request token is read off that URL before the page ever loads.
 */
export function KiteLogin({ apiKey, onToken, onClose }: { apiKey: string; onToken: (requestToken: string) => void; onClose: () => void }) {
  const catchToken = (url: string) => {
    const t = requestToken(url);
    if (t) onToken(t);
    return !t && !url.startsWith('https://127.0.0.1');
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={st.webHead}>
        <Text style={st.webTitle}>Log in to Kite</Text>
        <Press onPress={onClose} style={st.webClose} label="Close"><Text style={st.removeText}>Close</Text></Press>
      </View>
      <WebView
        source={{ uri: loginUrl(apiKey) }}
        style={{ flex: 1, backgroundColor: '#FFFFFF' }}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        onShouldStartLoadWithRequest={(r) => catchToken(r.url)}
        onNavigationStateChange={(n) => { catchToken(n.url); }}
      />
    </Modal>
  );
}

const st = StyleSheet.create({
  webHead: { flexDirection: 'row', alignItems: 'center', paddingTop: 44, paddingBottom: 10, paddingHorizontal: 16, backgroundColor: '#111113' },
  webTitle: { flex: 1, fontFamily: F.semibold, fontSize: 17, color: C.ink },
  webClose: { paddingHorizontal: 14, height: 34, borderRadius: 17, justifyContent: 'center', backgroundColor: C.fill },
  totals: { flexDirection: 'row', gap: 16 },
  totalValue: { fontFamily: F.light, fontSize: 30, color: C.ink, letterSpacing: -1 },
  totalGoal: { fontFamily: F.regular, fontSize: 13, color: C.ink2, letterSpacing: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fav: { width: '48.5%' as unknown as number, padding: 12, borderRadius: 18, backgroundColor: C.fill, gap: 2 },
  favName: { fontFamily: F.medium, fontSize: 14.5, color: C.ink },
  favMeta: { fontFamily: F.regular, fontSize: 12, color: C.ink2 },
  section: { fontFamily: F.semibold, fontSize: 13, color: C.ink3, marginTop: 6 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  remove: { paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: 'center', backgroundColor: C.fill },
  removeText: { fontFamily: F.medium, fontSize: 12.5, color: C.ink2 },
  code: { fontFamily: 'monospace', fontSize: 12.5, color: C.ink },
  fieldLabel: { fontFamily: F.medium, fontSize: 13, color: C.ink2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  move: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.fill },
  moveText: { fontFamily: F.medium, fontSize: 15, color: C.ink2 },
});
