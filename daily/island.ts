/**
 * The one island Halo shows, over every app. It always shows the single thing that matters most
 * right now — Claude asking, a file from the PC, CI, the protein reminder, Claude working — and
 * otherwise your day. Only buttons, rings, timers and text: everything here renders natively in
 * the Android overlay too.
 */
import { IslandNode, IslandState, IslandTemplate, bar, button, column, fx, icon, line, ring, row, sky, spacer, stack, text, timer, when } from 'halo-island';

import type { Window } from './claude';
import { Release, Row, Saved, Story, activeProfile, compact, kcal, protein, proteinPick, stepsToday } from './day';
import type { Desk, DeskStatus } from './desk';
import { Pulse, liveCurve, livePortfolio, marketClock, nextOpen, rupees, sparkline } from './kite';
import { Glyph, g } from './glyphs';
import { C } from './theme';

const GREY = '#98989F';
const wide = (n: IslandNode) => column({ grow: true }, n);

/** A day stat: a ring around its glyph, the value, the label. */
const stat = (p: string, glyph: Glyph, color: string, value: string, label: string) =>
  column({ gap: 6, align: 'center', grow: true },
    stack(ring(p, { size: 50, thickness: 4.5, color, track: '#26262A' }), g(glyph, 18, color)),
    column({ gap: 0, align: 'center' },
      text(value, { size: 15, weight: 'semibold', mono: true }),
      text(label, { size: 11, color: GREY })));

const permission = column({ gap: 12 },
  column({ gap: 3, background: '#1C1C1E', radius: 16, padding: 12 },
    text('Claude wants to run', { size: 12, color: GREY }),
    text('{askTool}', { size: 14, weight: 'medium', font: 'monospace', lines: 3 })),
  row({ gap: 10 },
    wide(button('deny', 'Deny', { color: '#FFFFFF', tint: true })),
    wide(button('allow', 'Allow', { color: C.claude, textColor: '#1A0B05', confirm: 'Tap to run' }))));

/** An answer slot: tinted until picked; a picked one (multi-select) fills in with a check. */
const option = (i: number) => when(`o${i}`, wide(column({ gap: 0 },
  when(`o${i}On`, button(`q:${i}`, `{o${i}}`, { icon: 'check', color: C.claude, textColor: '#1A0B05' })),
  when(`!o${i}On`, button(`q:${i}`, `{o${i}}`, { color: C.claude, tint: true })))));

/** Claude asking you to choose: the question in the same card as a command, its answers two by two. */
const question = column({ gap: 10 },
  column({ gap: 4, background: '#1C1C1E', radius: 16, padding: 12 },
    row({ gap: 6 },
      text('{qHeader}', { size: 12, weight: 'semibold', color: C.claude, lines: 1 }),
      when('qMany', text('{qStep}', { size: 12, color: GREY, mono: true })),
      spacer(),
      text('{qHint}', { size: 12, color: GREY })),
    text('{qText}', { size: 15, weight: 'medium', lines: 3 })),
  row({ gap: 8 }, option(0), option(1)),
  when('o2', row({ gap: 8 }, option(2), option(3))),
  row({ gap: 8 },
    // Back to the terminal: for "Other", or when the island isn't where you want to answer.
    wide(button('q:pc', 'Answer on PC', { color: '#FFFFFF', tint: true })),
    when('qMulti', wide(button('q:done', '{qDone}', { color: C.claude, textColor: '#1A0B05' })))));

const ask = column({ gap: 0 }, when('isQ', question), when('!isQ', permission));

/** The day's P&L as a curve, in the day's color: drawn from our own polls, not a paid market feed. */
const curve = (height: number, fill = true) => column({ gap: 0 },
  when('kiteUp', line('{kiteCurve}', { height, color: C.pass, fill, thickness: 2 })),
  when('!kiteUp', line('{kiteCurve}', { height, color: C.fail, fill, thickness: 2 })));

/** The money in the day's color: green up, red down. */
const pnl = (key: string, size: number) => column({ gap: 0 },
  when('kiteUp', text(key, { size, weight: 'semibold', mono: true, color: C.pass })),
  when('!kiteUp', text(key, { size, weight: 'semibold', mono: true, color: C.fail })));

/** A mover tile: the symbol, and its move in the day's colour. */
const mover = (i: number) => when(`mv${i}`, column({ grow: true, gap: 1, padding: 8, radius: 12, background: '#16161A', align: 'center' },
  text(`{mv${i}s}`, { size: 11, weight: 'semibold', color: '#D1D1D6', lines: 1 }),
  when(`mv${i}u`, text(`{mv${i}p}`, { size: 12, weight: 'semibold', mono: true, color: C.pass })),
  when(`!mv${i}u`, text(`{mv${i}p}`, { size: 12, weight: 'semibold', mono: true, color: C.fail }))));

/**
 * The portfolio, the way a Live Activity would show it: the market's clock with a breathing live
 * dot, the value in rolling digits, the day's move, today's curve, the movers, and one quiet line.
 */
const portfolio = column({ gap: 12 },
  row({ gap: 7 },
    when('mktOpen', fx(column({ width: 7, height: 7, radius: 4, background: C.pass }), 'pulse')),
    when('!mktOpen', column({ width: 7, height: 7, radius: 4, background: '#48484A' })),
    text('{mktLabel}', { size: 12, color: GREY }),
    timer('{mktAt}', { style: { size: 12, color: GREY, mono: true } }),
    spacer(),
    text('{kiteWho}', { size: 12, color: GREY, lines: 1 })),
  row({ gap: 10, align: 'end' },
    column({ gap: 0, grow: true },
      text('Portfolio', { size: 12, color: GREY }),
      text('{kiteFull}', { size: 30, weight: 'semibold', mono: true, lines: 1 })),
    column({ gap: 0, align: 'end' },
      pnl('{kiteDayShort}', 18),
      pnl('{kitePct}', 12))),
  when('hasCurve', curve(54)),
  when('mv0', row({ gap: 6 }, mover(0), mover(1), mover(2), mover(3))),
  row({ gap: 8 },
    column({ grow: true }, text('Invested {kiteInvested}', { size: 12, color: GREY })),
    when('kiteTotUp', text('{kiteTotal} overall', { size: 12, weight: 'semibold', mono: true, color: C.pass })),
    when('!kiteTotUp', text('{kiteTotal} overall', { size: 12, weight: 'semibold', mono: true, color: C.fail }))));

/**
 * Market pulse. Before the open: a countdown and today's Kite login, so the 6 AM logout becomes a
 * morning ritual. During the day: a big move with its curve. At the bell: how the day closed.
 */
const market = column({ gap: 12 },
  when('pPre', column({ gap: 12 },
    row({ gap: 8, align: 'baseline' },
      text('Market opens in', { size: 14, color: GREY }),
      spacer(),
      timer('{openAt}', { style: { size: 30, weight: 'semibold' } })),
    when('pIn', text('Logged in · portfolio {kiteValue}', { size: 13, color: GREY })),
    when('!pIn', text('Kite signed you out at 6. Log in now and the island follows your portfolio all day.', { size: 13, color: GREY, lines: 2 })),
    row({ gap: 10 },
      when('!pIn', wide(button('market:login', 'Log in to Kite', { color: '#FFFFFF', textColor: '#000000' }))),
      wide(button('market:dismiss', 'Later', { color: '#FFFFFF', tint: true }))))),
  when('!pPre', column({ gap: 10 },
    row({ gap: 12, align: 'end' },
      column({ gap: 1, grow: true },
        text('{pTitle}', { size: 13, color: GREY }),
        pnl('{kiteDay}', 22)),
      column({ gap: 1, align: 'end' },
        text('{pBest}', { size: 12, weight: 'semibold', color: C.pass }),
        text('{pWorst}', { size: 12, weight: 'semibold', color: C.fail }))),
    when('hasCurve', curve(46)),
    row({ gap: 10 },
      wide(button('market:holdings', 'Holdings', { color: '#FFFFFF', textColor: '#000000' })),
      wide(button('market:dismiss', 'Done', { color: '#FFFFFF', tint: true }))))));

const drop = column({ gap: 12 },
  // The header already carries the glyph; the body is the words.
  column({ gap: 1 },
    text('{dropName}', { size: 16, weight: 'semibold', lines: 1 }),
    text('{dropMeta}', { size: 13, color: GREY, lines: 2 })),
  row({ gap: 10 },
    when('dropFile', wide(button('drop:save', 'Save', { icon: 'download', color: C.desk, textColor: '#06101F' }))),
    when('dropSaved', wide(button('drop:open', 'Open', { color: C.desk, textColor: '#06101F' }))),
    when('dropText', wide(button('drop:copy', 'Copy', { color: C.desk, textColor: '#06101F' }))),
    when('dropLink', wide(button('drop:link', 'Open link', { color: C.desk, tint: true }))),
    wide(button('drop:dismiss', 'Dismiss', { color: '#FFFFFF', tint: true }))));

const ci = column({ gap: 12 },
  row({ gap: 12 },
    column({ gap: 2, grow: true },
      text('{ciTitle}', { size: 16, weight: 'semibold', lines: 1 }),
      row({ gap: 5 }, g('branch', 13, GREY), text('{ciWhere}', { size: 13, color: GREY, lines: 1 }))),
    when('ciRun', timer('{ciStart}', { countUp: true, style: { size: 22, weight: 'semibold', color: C.run } })),
    when('ciPass', text('Passed', { size: 20, weight: 'semibold', color: C.pass })),
    when('ciFail', text('Failed', { size: 20, weight: 'semibold', color: C.fail }))),
  when('ciRun', bar('{ciP}', { height: 5, color: C.run, track: '#2A2A2E' })),
  when('ciPass', bar(1, { height: 5, color: C.pass })),
  when('ciFail', bar(1, { height: 5, color: C.fail })),
  row({ gap: 10 },
    column({ grow: true }, text('{ciJobs}', { size: 12, color: GREY })),
    column({ width: 104 }, button('ci:open', 'Open', { color: '#FFFFFF', tint: true }))));

const nudge = column({ gap: 12 },
  row({ gap: 12 },
    stack(ring('{protP}', { size: 46, thickness: 4.5, color: C.protein, track: '#26262A' }), g('barbell', 18, C.protein)),
    column({ gap: 1, grow: true },
      text('{prot} of {protGoal} g protein', { size: 16, weight: 'semibold' }),
      text('{protHint}', { size: 13, color: GREY, lines: 2 }))),
  row({ gap: 10 },
    wide(button('protein:log', '{pickLabel}', { color: C.protein, textColor: '#0D0E26' })),
    wide(button('protein:later', 'Later', { color: '#FFFFFF', tint: true }))));

const working = column({ gap: 12 },
  row({ gap: 12 },
    stack(ring('{fiveP}', { size: 46, thickness: 4, color: C.claude, track: '#26262A' }), text('{fiveH}', { size: 12, weight: 'semibold', mono: true })),
    column({ gap: 2, grow: true },
      text('{task}', { size: 15, weight: 'medium', lines: 2 }),
      when('resetAt', row({ gap: 4 }, text('5h limit resets in', { size: 12, color: GREY }), timer('{resetAt}', { style: { size: 12, color: GREY } }))))),
  text('{claudeLine}', { size: 12, color: GREY }));

/** Your day, row by row: each row shows only if the active profile includes it (Settings → Profiles). */
const day = column({ gap: 14 },
  row({ gap: 10 },
    when('rWeather', sky('{sky}', { size: 34 })),
    when('rWeather', column({ gap: 0 }, text('{temp}', { size: 18, weight: 'semibold' }), text('{wx}', { size: 12, color: GREY, lines: 1 }))),
    spacer(),
    column({ gap: 0, align: 'end' }, text('{dateLabel}', { size: 13, weight: 'semibold' }), text('{deskLine}', { size: 12, color: GREY, lines: 1 }))),
  when('rPortfolio', portfolio),
  when('rStats', row({ gap: 4 },
    when('rSteps', stat('{stepsP}', 'steps', C.steps, '{stepsLabel}', 'steps')),
    when('rKcal', stat('{kcalP}', 'flame', C.kcal, '{kcal}', 'kcal')),
    when('rProtein', stat('{protP}', 'barbell', C.protein, '{prot}g', 'protein')),
    when('rWater', stat('{waterP}', 'water', C.water, '{water}/{waterGoal}', 'water')))),
  // Claude's limits as one line: the 5-hour window, when it resets, and the week.
  when('rClaude', row({ gap: 8 },
    g('claude', 14, C.claude),
    column({ grow: true }, text('{claudeRow}', { size: 13, lines: 1 })),
    text('{weekRow}', { size: 12, color: GREY, mono: true }))),
  // Your Zerodha portfolio, once you've logged in today: value on the left, the day's move on the right.
  when('rKite', row({ gap: 8 },
    icon('trend', { size: 14, color: GREY }),
    column({ grow: true }, text('Portfolio {kiteValue}', { size: 13, lines: 1 })),
    when('hasCurve', column({ width: 54 }, curve(16, false))),
    pnl('{kiteDay}', 13))),
  when('rNews', row({ gap: 8 },
    g('hn', 14, C.hn),
    column({ grow: true }, text('{newsTitle}', { size: 13, lines: 1 })),
    text('{newsPts}', { size: 12, color: GREY, mono: true }))),
  when('rEmpty', text('{profile} shows nothing here right now.', { size: 13, color: GREY })),
  when('rButtons', row({ gap: 8 },
    when('rBWater', wide(button('water:add', 'Water', { icon: 'plus', color: C.water, tint: true }))),
    when('rBFood', wide(button('food:log', 'Food', { icon: 'plus', color: C.kcal, tint: true }))),
    when('rBRead', wide(button('news:read', 'Read', { icon: 'forward', color: C.hn, tint: true }))),
    when('rBSwitch', wide(button('profile:next', '{nextProfile}', { icon: 'refresh', color: '#FFFFFF', tint: true }))))));

const release = column({ gap: 12 },
  column({ gap: 1 },
    text('{relTag}', { size: 17, weight: 'semibold', lines: 1 }),
    text('{relRepo} · new release', { size: 13, color: GREY, lines: 1 })),
  row({ gap: 10 },
    wide(button('release:open', 'Release notes', { color: '#FFFFFF', textColor: '#000000' })),
    wide(button('release:dismiss', 'Later', { color: '#FFFFFF', tint: true }))));

/** The resting island's ring: whichever number you picked in Settings. */
const idleRing = (key: string, p: string, color: string) => when(key, ring(p, { size: 20, thickness: 2.5, color, track: '#2A2A2E' }));

export const template: IslandTemplate = {
  compact: {
    leading: column({ gap: 0 },
      when('mAsk', fx(g('claude', 18, C.claude), 'pulse')),
      when('mDrop', g('file', 18, C.desk)),
      when('mCiRun', fx(g('branch', 18, C.run), 'pulse')),
      when('mCiPass', g('pass', 18, C.pass)),
      when('mCiFail', g('fail', 18, C.fail)),
      when('mProtein', fx(g('barbell', 18, C.protein), 'wiggle')),
      when('mClaude', fx(g('claude', 18, C.claude), 'spin')),
      when('mRelease', g('github', 18, '#FFFFFF')),
      when('pPreC', fx(icon('bell', { size: 18, color: '#FFFFFF' }), 'wiggle')),
      when('pLiveC', icon('trend', { size: 18, color: '#FFFFFF' })),
      idleRing('dSteps', '{stepsP}', C.steps), idleRing('dClaude', '{fiveP}', C.claude), idleRing('dKcal', '{kcalP}', C.kcal), idleRing('dProt', '{protP}', C.protein),
      when('dKiteUp', column({ width: 30 }, line('{kiteCurve}', { height: 14, color: C.pass, fill: false, thickness: 1.6 }))),
      when('dKiteDown', column({ width: 30 }, line('{kiteCurve}', { height: 14, color: C.fail, fill: false, thickness: 1.6 })))),
    trailing: column({ gap: 0 },
      when('mAsk', text('{askShort}', { size: 15, weight: 'semibold', color: C.claude })),
      when('mDrop', text('{dropShort}', { size: 15, weight: 'semibold', color: C.desk })),
      when('mCiRun', timer('{ciStart}', { countUp: true, style: { size: 15, weight: 'semibold', color: C.run } })),
      when('mCiPass', text('Passed', { size: 15, weight: 'semibold', color: C.pass })),
      when('mCiFail', text('Failed', { size: 15, weight: 'semibold', color: C.fail })),
      when('mProtein', text('{prot}g', { size: 15, weight: 'semibold', mono: true, color: C.protein })),
      when('mClaude', text('{fiveH}', { size: 15, weight: 'semibold', mono: true, color: C.claude })),
      when('mRelease', text('{relTagShort}', { size: 15, weight: 'semibold', mono: true })),
      when('pPreC', timer('{openAt}', { style: { size: 15, weight: 'semibold' } })),
      when('pLiveC', pnl('{kiteDayShort}', 15)),
      when('dSteps', text('{stepsLabel}', { size: 15, weight: 'semibold', mono: true })),
      when('dClaude', text('{fiveH}', { size: 15, weight: 'semibold', mono: true, color: C.claude })),
      when('dKcal', text('{kcal}', { size: 15, weight: 'semibold', mono: true, color: C.kcal })),
      when('dProt', text('{prot}g', { size: 15, weight: 'semibold', mono: true, color: C.protein })),
      when('dKiteUp', text('{kiteDayShort}', { size: 15, weight: 'semibold', mono: true, color: C.pass })),
      when('dKiteDown', text('{kiteDayShort}', { size: 15, weight: 'semibold', mono: true, color: C.fail }))),
  },
  expanded: column({ gap: 0 },
    when('mAsk', ask), when('mDrop', drop), when('mCi', ci), when('mMarket', market), when('mRelease', release), when('mProtein', nudge), when('mClaude', working), when('mDay', day)),
  // The notification (required for the over-apps service) reads these, not the sections above.
  lockScreen: column(text('{nTitle}'), text('{nBody}'), bar('{stepsP}')),
  theme: { accent: C.steps, radius: 38 },
  motion: 'minimal',
  link: 'halodaily://home',
};

export type Mode = 'ask' | 'drop' | 'ci' | 'market' | 'release' | 'protein' | 'claude' | 'day';

export interface View {
  saved: Saved;
  desk: Desk | null;
  status: DeskStatus;
  now: number;
  story: Story | undefined;
  /** The drop the user dismissed, and where a saved one landed. */
  dismissed: string;
  savedUri: string;
  /** The protein slot showing its reminder, if any. */
  nudge: string | null;
  /** A market moment waiting for you (pre-open, a big move, the closing bell). */
  pulse: Pulse;
  /** A release you haven't seen yet. */
  release: Release | null;
  alertSeq: number;
  /** Where you are in Claude's questions: which one, and the answers picked so far on a multi-select. */
  asking: { qi: number; picks: number[] };
}

/**
 * The 5-hour and weekly windows: from your Claude account when it answered recently (it counts every
 * device), else from the desk's statusline.
 */
export function limitsOf(s: Saved, desk: Desk | null, now = Date.now()): { five: Window | null; week: Window | null } {
  const cloud = s.claudeUsage;
  if (cloud && now - cloud.at < 15 * 60_000) return { five: cloud.five, week: cloud.week };
  if (desk && (desk.fiveHourPct != null || desk.weekPct != null)) {
    return {
      five: desk.fiveHourPct == null ? null : { pct: desk.fiveHourPct, resetsAt: desk.fiveHourResetsAt },
      week: desk.weekPct == null ? null : { pct: desk.weekPct, resetsAt: desk.weekResetsAt },
    };
  }
  return { five: cloud?.five ?? null, week: cloud?.week ?? null };
}

export function modeOf(v: View): Mode {
  const d = v.status === 'live' ? v.desk : null;
  const on = v.saved.prefs.island;
  if (on.ask && d?.pending) return 'ask';
  if (on.drop && d?.drop && d.drop.id !== v.dismissed && v.now - d.drop.at < 5 * 60_000) return 'drop';
  if (on.ci && d?.gh?.ci) return 'ci';
  if (on.market && v.pulse) return 'market';
  if (on.release && v.release) return 'release';
  if (on.protein && v.nudge) return 'protein';
  if (on.claude && d?.working && v.now - d.lastEventAt < 10 * 60_000) return 'claude';
  return 'day';
}

const hm = (ms: number) => `${Math.floor(ms / 3.6e6)}h ${Math.floor((ms % 3.6e6) / 60_000)}m`;
const pct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n)}%`);
const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

/** Island state for the current moment. Flags pick one section; everything else is just text. */
export function toIsland(v: View): IslandState {
  const { saved: s, desk, now } = v;
  const live = v.status === 'live' && desk ? desk : null;
  const mode = modeOf(v);
  const steps = stepsToday(s);
  const prot = protein(s);
  const pick = proteinPick(s);
  const ciState = live?.gh?.ci;
  const drop = live?.drop;
  const link = drop?.kind === 'text' && /^https?:\/\/\S+$/.test(drop.text.trim());
  const usage = live?.usage;
  const { five } = limitsOf(s, live, now);
  const claudeLine = usage ? `${compact(usage.todayTokens)} tokens today · ${usage.sessions} sessions · ${Math.floor(usage.activeMin / 60)}h ${usage.activeMin % 60}m` : '';
  const prof = activeProfile(s);
  const idle = prof.idle;
  const has = (r: Row) => prof.rows.includes(r);
  // Only today's numbers: a portfolio from before Kite's 6 AM logout is yesterday's news.
  const pf = livePortfolio(s, now);
  const curveNow = liveCurve(s, now);
  const clock = marketClock(now);
  const movers = pf?.movers ?? [];
  const flags = Object.fromEntries((['ask', 'drop', 'ci', 'market', 'release', 'protein', 'claude', 'day'] as Mode[]).map((m) => [`m${m[0].toUpperCase()}${m.slice(1)}`, mode === m]));
  const qs = live?.pending?.questions;
  const q = qs?.[v.asking.qi];
  const options = Object.fromEntries([0, 1, 2, 3].flatMap((i) => [[`o${i}`, q?.options[i] ?? ''], [`o${i}On`, v.asking.picks.includes(i)]]));

  return {
    ...flags,
    // Day view rows, per the active profile; a row with nothing to show stays hidden.
    rWeather: has('weather') && !!s.wx,
    rSteps: has('steps'), rKcal: has('kcal'), rProtein: has('protein'), rWater: has('water'),
    rStats: has('steps') || has('kcal') || has('protein') || has('water'),
    rClaude: has('claude') && !!five,
    rKite: has('kite') && !!pf,
    rNews: has('news') && !!v.story,
    rBWater: has('bWater'), rBFood: has('bFood'), rBRead: has('bRead') && !!v.story, rBSwitch: has('bSwitch') && s.prefs.profiles.length > 1,
    rButtons: has('bWater') || has('bFood') || (has('bRead') && !!v.story) || (has('bSwitch') && s.prefs.profiles.length > 1),
    rEmpty: !((has('portfolio') && pf) || (has('weather') && s.wx) || has('steps') || has('kcal') || has('protein') || has('water') || (has('claude') && five) || (has('kite') && pf) || (has('news') && v.story)),
    profile: prof.name,
    nextProfile: s.prefs.profiles[(s.prefs.profile + 1) % s.prefs.profiles.length]?.name ?? '',
    claudeRow: five ? `Claude ${pct(five.pct)}${five.resetsAt > now ? ` · resets in ${hm(five.resetsAt - now)}` : ''}` : '',
    weekRow: limitsOf(s, live, now).week ? `week ${pct(limitsOf(s, live, now).week!.pct)}` : '',
    dSteps: mode === 'day' && (idle === 'steps' || (idle === 'kite' && !pf)),
    dClaude: mode === 'day' && idle === 'claude',
    dKcal: mode === 'day' && idle === 'kcal',
    dProt: mode === 'day' && idle === 'protein',
    // Day P&L on the resting island; falls back to steps until today's Kite login.
    dKiteUp: mode === 'day' && idle === 'kite' && !!pf && pf.dayPnl >= 0,
    dKiteDown: mode === 'day' && idle === 'kite' && !!pf && pf.dayPnl < 0,
    hasKite: !!pf,
    kiteUp: !!pf && pf.dayPnl >= 0,
    kiteValue: pf ? rupees(pf.value) : '',
    kiteDay: pf ? `${rupees(pf.dayPnl, true)} · ${pf.dayPct >= 0 ? '+' : '−'}${Math.abs(pf.dayPct).toFixed(2)}%` : '',
    kiteDayShort: pf ? rupees(pf.dayPnl, true) : '',
    kiteCurve: pf && curveNow ? sparkline(curveNow.pts) : '',
    hasCurve: !!pf && (curveNow?.pts.length ?? 0) > 1,
    rPortfolio: has('portfolio') && !!pf,
    mktOpen: clock.open,
    mktLabel: clock.label,
    mktAt: clock.at,
    kiteWho: s.kiteDemo ? 'Sample' : s.kite?.user ?? '',
    kiteFull: pf ? `₹${Math.round(pf.value).toLocaleString('en-IN')}` : '',
    kitePct: pf ? `${pf.dayPct >= 0 ? '▲' : '▼'} ${Math.abs(pf.dayPct).toFixed(2)}%` : '',
    kiteInvested: pf ? rupees(pf.invested) : '',
    kiteTotal: pf ? rupees(pf.pnl, true) : '',
    kiteTotUp: !!pf && pf.pnl >= 0,
    ...Object.fromEntries([0, 1, 2, 3].flatMap((i) => [[`mv${i}`, !!movers[i]], [`mv${i}s`, movers[i]?.symbol ?? ''], [`mv${i}p`, movers[i] ? `${movers[i].pct >= 0 ? '+' : '−'}${Math.abs(movers[i].pct).toFixed(1)}%` : ''], [`mv${i}u`, (movers[i]?.pct ?? 0) >= 0]])),
    // Market pulse
    pPre: v.pulse?.kind === 'pre',
    pPreC: mode === 'market' && v.pulse?.kind === 'pre',
    pLiveC: mode === 'market' && v.pulse?.kind !== 'pre',
    pIn: !!pf,
    openAt: nextOpen(now),
    pTitle: v.pulse?.kind === 'close' ? 'Market closed · your day' : v.pulse?.kind === 'move' ? `Portfolio ${(v.pulse.step ?? 0) > 0 ? 'up' : 'down'} ${Math.abs(pf?.dayPct ?? 0).toFixed(1)}% today` : '',
    pBest: pf?.movers[0] && pf.movers[0].pct > 0 ? `▲ ${pf.movers[0].symbol} ${pf.movers[0].pct.toFixed(1)}%` : '',
    pWorst: pf?.movers.length && pf.movers[pf.movers.length - 1].pct < 0 ? `▼ ${pf.movers[pf.movers.length - 1].symbol} ${Math.abs(pf.movers[pf.movers.length - 1].pct).toFixed(1)}%` : '',
    relTag: v.release?.tag ?? '',
    relTagShort: (v.release?.tag ?? '').replace(/^v/, '').slice(0, 9),
    relRepo: v.release?.repo.split('/')[1] ?? '',
    mCiRun: mode === 'ci' && ciState?.status !== 'completed',
    mCiPass: mode === 'ci' && ciState?.conclusion === 'success',
    mCiFail: mode === 'ci' && ciState?.conclusion === 'failure',
    // Day
    dateLabel: new Date(now).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
    deskLine: five ? `Claude ${pct(five.pct)}${usage ? ` · ${compact(usage.todayTokens)}` : ''}` : v.status === 'error' ? 'Desk offline' : '',
    hasWx: !!s.wx,
    sky: s.wx?.sky ?? 'cloudy',
    temp: s.wx ? `${s.wx.temp}°` : '',
    wx: s.wx ? `${s.wx.label} · ${s.wx.city}` : '',
    stepsP: Math.min(1, steps / s.goals.steps),
    stepsLabel: steps.toLocaleString('en-IN'),
    kcalP: Math.min(1, kcal(s) / s.goals.kcal),
    kcal: kcal(s).toLocaleString('en-IN'),
    protP: Math.min(1, prot / s.goals.protein),
    prot,
    protGoal: s.goals.protein,
    water: s.water,
    waterGoal: s.goals.water,
    waterP: Math.min(1, s.water / s.goals.water),
    hasNews: !!v.story,
    newsTitle: v.story?.title ?? '',
    newsPts: v.story ? `▲${v.story.points}` : '',
    // Protein reminder
    pickLabel: pick ? `+ ${pick.name} · ${pick.protein}g` : '+ Protein',
    protHint: `${Math.max(0, s.goals.protein - prot)} g to go today. ${pick ? `${pick.name} gets you ${pick.protein} g closer.` : ''}`,
    // Claude
    askTool: live?.pending?.tool ?? '',
    askShort: q ? 'Choose' : 'Allow?',
    // Claude's questions
    ...options,
    isQ: !!q,
    qHeader: q?.header || 'Claude asks',
    qStep: qs ? `${v.asking.qi + 1}/${qs.length}` : '',
    qMany: (qs?.length ?? 0) > 1,
    qText: q?.question ?? '',
    qHint: q?.multiSelect ? 'Pick any' : 'Pick one',
    qMulti: !!q?.multiSelect,
    qDone: v.asking.picks.length ? `Done · ${v.asking.picks.length}` : 'Done',
    task: live?.task ?? '',
    fiveH: pct(five?.pct),
    fiveP: (five?.pct ?? 0) / 100,
    resetAt: five && five.resetsAt > now ? five.resetsAt : 0,
    claudeLine,
    // Drop
    dropName: drop?.kind === 'text' ? (link ? 'Link from your PC' : 'Text from your PC') : drop?.name ?? '',
    dropMeta: drop ? (drop.kind === 'text' ? drop.text.slice(0, 90) : v.savedUri ? 'Saved to Downloads/Halo' : `${size(drop.size)} · from your PC`) : '',
    dropShort: drop?.kind === 'text' ? (link ? 'Link' : 'Text') : '1 file',
    dropFile: drop?.kind === 'file' && !v.savedUri,
    dropSaved: drop?.kind === 'file' && !!v.savedUri,
    dropText: drop?.kind === 'text' && !link,
    dropLink: !!link,
    // CI
    ciTitle: ciState?.title ?? '',
    ciWhere: ciState ? `${ciState.repo} · ${ciState.branch}` : '',
    ciStart: ciState?.startedAt ?? now,
    ciP: ciState?.total ? Math.max(0.08, ciState.done / ciState.total) : 0.08,
    ciJobs: ciState ? (ciState.total ? `${ciState.done} of ${ciState.total} workflows done` : 'Waiting for runners') : '',
    // Notification
    nTitle: mode === 'ask' ? (q ? 'Claude has a question' : 'Claude wants to run a command') : mode === 'ci' ? `${ciState?.repo}: ${ciState?.status === 'completed' ? (ciState.conclusion === 'success' ? 'CI passed' : 'CI failed') : 'CI running'}` : `${steps.toLocaleString('en-IN')} steps · ${kcal(s)} kcal · ${prot} g protein`,
    nBody: mode === 'ask' ? q?.question ?? live?.pending?.tool ?? '' : mode === 'claude' ? live?.task ?? '' : five ? `Claude ${pct(five.pct)} of 5h limit${claudeLine ? ' · ' + claudeLine : ''}` : 'Halo',
    // Bumped by the app for moments that need you; it only grows, so clearing never pops the island.
    alertSeq: v.alertSeq,
  };
}
