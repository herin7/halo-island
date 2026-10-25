/** Dashboard cards. Settings decides which ones show and in what order; half-width ones pair up. */
import { Bars, Ring, Sparkline, Sky } from 'halo-island/src/graphics';
import { ReactNode } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import type { Window } from './claude';
import { CardId, Saved, compact, kcal, protein, stepsToday } from './day';
import type { Desk } from './desk';
import { C, F } from './theme';
import { Big, Card, Head, Icon, Meter, Pill, Press, T } from './ui';

export interface Ctx {
  saved: Saved;
  live: Desk | null;
  status: string;
  now: number;
  limits: { five: Window | null; week: Window | null };
  update: (fn: (s: Saved) => Saved) => void;
  openFood: () => void;
  openSettings: () => void;
  signInClaude: () => void;
  refresh: () => void;
  sendClipboard: () => void;
}

/** These sit two to a row when they're next to each other. */
export const HALF = new Set<CardId>(['weather', 'steps', 'food', 'water']);

const MIN = 60_000;
const dur = (ms: number) => (ms >= 864e5 ? `${Math.floor(ms / 864e5)}d ${Math.floor((ms % 864e5) / 3.6e6)}h` : `${Math.floor(ms / 3.6e6)}h ${Math.floor((ms % 3.6e6) / MIN)}m`);
const ago = (ms: number) => (ms < 3.6e6 ? `${Math.max(1, Math.round(ms / MIN))}m ago` : ms < 864e5 ? `${Math.round(ms / 3.6e6)}h ago` : `${Math.round(ms / 864e5)}d ago`);

/** One card by id, or null when it has nothing to show yet. */
export function renderCard(id: CardId, x: Ctx): ReactNode {
  const { saved, live, now } = x;
  switch (id) {
    case 'weather':
      return (
        <Card style={{ minHeight: 178 }} onPress={x.refresh} label="Weather">
          <View style={s.sky}><Sky condition={saved.wx?.sky ?? 'cloudy'} size={86} /></View>
          <View style={{ flex: 1 }} />
          <Big value={saved.wx ? `${saved.wx.temp}°` : '–'} size={44} />
          <T lines={1}>{saved.wx ? `${saved.wx.label} · ${saved.wx.city}` : 'Finding you…'}</T>
          {saved.wx ? <T style={s.small}>H {saved.wx.high}°  L {saved.wx.low}°</T> : null}
        </Card>
      );

    case 'steps': {
      const steps = stepsToday(saved);
      const hour = new Date(now).getHours();
      const max = Math.max(1, ...saved.steps.hours);
      return (
        <Card style={{ minHeight: 178 }}>
          <Head glyph="steps" color={C.steps}>Steps</Head>
          <View style={{ flex: 1 }} />
          <Big value={steps.toLocaleString('en-IN')} size={38} />
          <T style={s.small}>{((steps * saved.prefs.stepCm) / 100_000).toFixed(1)} km · goal {saved.goals.steps.toLocaleString('en-IN')}</T>
          <Bars values={saved.steps.hours.map((h) => h / max)} active={hour + 1} height={28} gap={2} color={C.steps} track="#232326" live={false} />
        </Card>
      );
    }

    case 'claude': {
      const { five, week } = x.limits;
      const usage = live?.usage;
      const resetIn = five?.resetsAt ? Math.max(0, five.resetsAt - now) : 0;
      const weekIn = week?.resetsAt ? Math.max(0, week.resetsAt - now) : 0;
      const cu = saved.claudeUsage;
      const models = [cu?.opus && `Opus ${Math.round(cu.opus.pct)}%`, cu?.sonnet && `Sonnet ${Math.round(cu.sonnet.pct)}%`].filter(Boolean).join(' · ');
      const tokenMax = Math.max(1, ...(usage?.week ?? [1]));
      return (
        <Card onPress={live || five ? undefined : x.openSettings} label="Claude Code">
          <Head glyph="claude" color={C.claude} right={live?.model ? <T style={s.small}>{live.model}</T> : null}>Claude Code</Head>
          {live || five || week ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <View style={s.ring}>
                  <Ring value={(five?.pct ?? 0) / 100} size={76} thickness={6} color={C.claude} track="#26262A" />
                  <Text style={s.ringText}>{five ? Math.round(five.pct) : '–'}<Text style={s.ringUnit}>%</Text></Text>
                </View>
                <View style={{ flex: 1, gap: 8 }}>
                  <View>
                    <Text style={s.title}>5-hour limit</Text>
                    <T style={s.small}>{!five ? 'Sign in with Claude in Settings to see limits' : resetIn ? `Resets in ${dur(resetIn)}` : 'Fresh window'}</T>
                  </View>
                  <View style={{ gap: 6 }}>
                    <View style={s.between}><T style={[s.small, { flexShrink: 0 }]} lines={1}>This week</T><T style={s.small} lines={1}>{week ? `${Math.round(week.pct)}%` : '–'}</T></View>
                    <Meter value={(week?.pct ?? 0) / 100} color={C.claude} />
                    {weekIn ? <T style={s.small}>Resets in {dur(weekIn)}</T> : null}
                  </View>
                </View>
              </View>
              {models ? <T style={s.small}>{models}</T> : null}
              {usage ? (
                <View style={{ gap: 8 }}>
                  <View style={s.between}>
                    <T style={s.small}>{compact(usage.todayTokens)} tokens · {usage.sessions} sessions · {Math.floor(usage.activeMin / 60)}h {usage.activeMin % 60}m</T>
                    <T style={s.small}>7 days</T>
                  </View>
                  <Bars values={usage.week.map((t) => t / tokenMax)} active={7} height={26} gap={4} color={C.claude} track="#232326" live={false} />
                </View>
              ) : null}
              {live ? <T lines={1} style={{ color: live.working ? C.ink : C.ink3 }}>{live.task}</T> : null}
            </>
          ) : (
            <>
              <T>Sign in with your Claude account to see your 5-hour and weekly limits anywhere. Pair with your PC for today’s tokens and to approve Claude from here.</T>
              <View style={{ flexDirection: 'row' }}><Pill label="Sign in with Claude" onPress={x.signInClaude} color={C.claude} filled /></View>
            </>
          )}
        </Card>
      );
    }

    case 'food':
      return (
        <Card onPress={x.openFood} label="Log food">
          <Head glyph="food" color={C.kcal}>Food</Head>
          <Big value={kcal(saved).toLocaleString('en-IN')} unit="kcal" size={34} />
          <View style={{ gap: 6 }}>
            <View style={s.between}><T style={s.small}>Protein</T><T style={[s.small, { color: C.protein }]}>{protein(saved)} / {saved.goals.protein} g</T></View>
            <Meter value={protein(saved) / saved.goals.protein} color={C.protein} />
          </View>
          <T style={s.small}>{saved.food.length ? `${saved.food.length} logged · tap to add` : 'Tap to log'}</T>
        </Card>
      );

    case 'water':
      return (
        <Card onPress={() => x.update((v) => ({ ...v, water: v.water + 1 }))} onLongPress={() => x.update((v) => ({ ...v, water: Math.max(0, v.water - 1) }))} label="Add a glass of water">
          <Head glyph="water" color={C.water}>Water</Head>
          <Big value={saved.water} unit={`/ ${saved.goals.water}`} size={34} />
          <View style={s.drops}>
            {Array.from({ length: saved.goals.water }, (_, i) => <Icon key={i} name="water" size={14} color={i < saved.water ? C.water : '#2C2C30'} />)}
          </View>
          <T style={s.small}>Tap +1 · hold −1</T>
        </Card>
      );

    case 'github': {
      const gh = live?.gh;
      if (!gh) return null;
      return (
        <Card>
          <Head glyph="github" color={C.ink} right={<T style={s.small}>{gh.login}</T>}>GitHub</Head>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
            <View style={{ flex: 1 }}>
              <Big value={gh.today} unit="today" size={38} />
              <T style={s.small}>{gh.streak}-day streak · {gh.reviews ? `${gh.reviews} review${gh.reviews > 1 ? 's' : ''} waiting` : 'no reviews waiting'}</T>
            </View>
            <View style={s.squares}>
              {gh.week.map((n, i) => <View key={i} style={[s.square, { backgroundColor: n ? C.pass : '#232326', opacity: n ? Math.min(1, 0.35 + n / 12) : 1 }]} />)}
            </View>
          </View>
          {gh.ci ? (
            <Press onPress={() => Linking.openURL(gh.ci!.url)} style={s.row} label="Open CI run">
              <Icon name={gh.ci.status !== 'completed' ? 'branch' : gh.ci.conclusion === 'success' ? 'pass' : 'fail'} size={18} color={gh.ci.status !== 'completed' ? C.run : gh.ci.conclusion === 'success' ? C.pass : C.fail} />
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{gh.ci.title}</Text>
                <T style={s.small} lines={1}>{gh.ci.repo} · {gh.ci.branch} · {gh.ci.status === 'completed' ? (gh.ci.conclusion === 'success' ? 'passed' : 'failed') : `${gh.ci.done}/${gh.ci.total || '?'} running`}</T>
              </View>
            </Press>
          ) : null}
        </Card>
      );
    }

    case 'npm':
      if (!saved.npmStats.length) return null;
      return (
        <Card>
          <Head glyph="npm" color="#CB3837">npm</Head>
          {saved.npmStats.map((p) => (
            <Press key={p.name} onPress={() => Linking.openURL(`https://www.npmjs.com/package/${p.name}`)} style={s.pkg} label={p.name}>
              <View style={s.between}>
                <Text style={s.rowTitle}>{p.name}{p.version ? <Text style={s.small}>  v{p.version}</Text> : null}</Text>
                <Text style={s.rowTitle}>{p.week.toLocaleString('en-IN')}<Text style={s.small}> / week</Text></Text>
              </View>
              {p.month.length > 1 ? <Sparkline values={norm(p.month)} height={30} color="#CB3837" fill thickness={1.6} /> : null}
              <T style={s.small}>{p.day.toLocaleString('en-IN')} yesterday</T>
            </Press>
          ))}
        </Card>
      );

    case 'releases':
      if (!saved.releases.length) return null;
      return (
        <Card>
          <Head glyph="github" color={C.ink}>Releases</Head>
          {saved.releases.map((r) => (
            <Press key={r.repo} onPress={() => Linking.openURL(r.url)} style={s.release} label={`${r.repo} ${r.tag}`}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{r.repo.split('/')[1]}</Text>
                <T style={s.small} lines={1}>{r.repo.split('/')[0]} · {ago(now - r.at)}</T>
              </View>
              <Text style={[s.tag, now - r.at < 3 * 864e5 && { color: C.steps }]}>{r.tag}</Text>
            </Press>
          ))}
        </Card>
      );

    case 'news': {
      const list = saved.news.filter((n) => n.points >= saved.prefs.newsMin);
      if (!list.length) return null;
      return (
        <Card>
          <Head glyph="hn" color={C.hn} right={<T style={s.small}>▲ {saved.prefs.newsMin}+</T>}>Hacker News</Head>
          {list.slice(0, 7).map((n) => (
            <Press key={n.id} onPress={() => Linking.openURL(n.url)} style={s.story} label={n.title}>
              <Text style={s.storyTitle} numberOfLines={2}>{n.title}</Text>
              <T style={s.small} lines={1}>▲ {n.points} · {n.comments} comments · {n.site}</T>
            </Press>
          ))}
        </Card>
      );
    }

    case 'desk':
      return (
        <Card>
          <Head glyph="send" color={C.desk}>Desk</Head>
          <T>Share any file or link to <Text style={{ color: C.ink }}>Halo</Text> and it lands on your PC. From the PC: <Text style={s.code}>bridge.mjs send file</Text>.</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pill label="Send clipboard to PC" onPress={x.sendClipboard} color={C.desk} />
          </View>
        </Card>
      );
  }
}

const norm = (xs: number[]) => {
  const max = Math.max(1, ...xs);
  return xs.map((v) => v / max);
};

const s = StyleSheet.create({
  title: { fontFamily: F.medium, fontSize: 16, color: C.ink, letterSpacing: -0.2 },
  small: { fontFamily: F.regular, fontSize: 12.5, lineHeight: 17, color: C.ink2 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  sky: { position: 'absolute', top: 6, right: 0 },
  ring: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  ringText: { position: 'absolute', fontFamily: F.light, fontSize: 24, color: C.ink, letterSpacing: -0.8 },
  ringUnit: { fontSize: 12, color: C.ink2 },
  drops: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  squares: { flexDirection: 'row', gap: 4, paddingBottom: 6 },
  square: { width: 14, height: 14, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 18, backgroundColor: C.fill },
  rowTitle: { fontFamily: F.medium, fontSize: 14.5, color: C.ink },
  pkg: { gap: 6, paddingVertical: 4 },
  release: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  tag: { fontFamily: 'monospace', fontSize: 13, color: C.ink2 },
  story: { gap: 2, paddingVertical: 4 },
  storyTitle: { fontFamily: F.regular, fontSize: 15, lineHeight: 20, color: C.ink, letterSpacing: -0.15 },
  code: { fontFamily: 'monospace', fontSize: 12.5, color: C.ink },
});
