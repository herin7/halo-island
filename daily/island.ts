/**
 * The one island Halo shows, over every app. It always shows the single thing that matters most
 * right now — Claude asking, a file from the PC, CI, the protein reminder, Claude working — and
 * otherwise your day. Only buttons, rings, timers and text: everything here renders natively in
 * the Android overlay too.
 */
import { IslandNode, IslandState, IslandTemplate, bar, button, column, fx, ring, row, sky, spacer, stack, text, timer, when } from 'halo-island';

import type { Window } from './claude';
import { Release, Saved, Story, compact, kcal, protein, proteinPick, stepsToday } from './day';
import type { Desk, DeskStatus } from './desk';
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

const ask = column({ gap: 12 },
  column({ gap: 3, background: '#1C1C1E', radius: 16, padding: 12 },
    text('Claude wants to run', { size: 12, color: GREY }),
    text('{askTool}', { size: 14, weight: 'medium', font: 'monospace', lines: 3 })),
  row({ gap: 10 },
    wide(button('deny', 'Deny', { color: '#FFFFFF', tint: true })),
    wide(button('allow', 'Allow', { color: C.claude, textColor: '#1A0B05', confirm: 'Tap to run' }))));

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

const day = column({ gap: 14 },
  row({ gap: 10 },
    when('hasWx', sky('{sky}', { size: 34 })),
    when('hasWx', column({ gap: 0 }, text('{temp}', { size: 18, weight: 'semibold' }), text('{wx}', { size: 12, color: GREY, lines: 1 }))),
    spacer(),
    column({ gap: 0, align: 'end' }, text('{dateLabel}', { size: 13, weight: 'semibold' }), text('{deskLine}', { size: 12, color: GREY, lines: 1 }))),
  row({ gap: 4 },
    stat('{stepsP}', 'steps', C.steps, '{stepsLabel}', 'steps'),
    stat('{kcalP}', 'flame', C.kcal, '{kcal}', 'kcal'),
    stat('{protP}', 'barbell', C.protein, '{prot}g', 'protein'),
    stat('{waterP}', 'water', C.water, '{water}/{waterGoal}', 'water')),
  when('hasNews', row({ gap: 8 },
    g('hn', 14, C.hn),
    column({ grow: true }, text('{newsTitle}', { size: 13, lines: 1 })),
    text('{newsPts}', { size: 12, color: GREY, mono: true }))),
  row({ gap: 8 },
    wide(button('water:add', 'Water', { icon: 'plus', color: C.water, tint: true })),
    wide(button('food:log', 'Food', { icon: 'plus', color: C.kcal, tint: true })),
    when('hasNews', wide(button('news:read', 'Read', { icon: 'forward', color: C.hn, tint: true })))));

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
      idleRing('dSteps', '{stepsP}', C.steps), idleRing('dClaude', '{fiveP}', C.claude), idleRing('dKcal', '{kcalP}', C.kcal), idleRing('dProt', '{protP}', C.protein)),
    trailing: column({ gap: 0 },
      when('mAsk', text('Allow?', { size: 15, weight: 'semibold', color: C.claude })),
      when('mDrop', text('{dropShort}', { size: 15, weight: 'semibold', color: C.desk })),
      when('mCiRun', timer('{ciStart}', { countUp: true, style: { size: 15, weight: 'semibold', color: C.run } })),
      when('mCiPass', text('Passed', { size: 15, weight: 'semibold', color: C.pass })),
      when('mCiFail', text('Failed', { size: 15, weight: 'semibold', color: C.fail })),
      when('mProtein', text('{prot}g', { size: 15, weight: 'semibold', mono: true, color: C.protein })),
      when('mClaude', text('{fiveH}', { size: 15, weight: 'semibold', mono: true, color: C.claude })),
      when('mRelease', text('{relTagShort}', { size: 15, weight: 'semibold', mono: true })),
      when('dSteps', text('{stepsLabel}', { size: 15, weight: 'semibold', mono: true })),
      when('dClaude', text('{fiveH}', { size: 15, weight: 'semibold', mono: true, color: C.claude })),
      when('dKcal', text('{kcal}', { size: 15, weight: 'semibold', mono: true, color: C.kcal })),
      when('dProt', text('{prot}g', { size: 15, weight: 'semibold', mono: true, color: C.protein }))),
  },
  expanded: column({ gap: 0 },
    when('mAsk', ask), when('mDrop', drop), when('mCi', ci), when('mRelease', release), when('mProtein', nudge), when('mClaude', working), when('mDay', day)),
  // The notification (required for the over-apps service) reads these, not the sections above.
  lockScreen: column(text('{nTitle}'), text('{nBody}'), bar('{stepsP}')),
  theme: { accent: C.steps, radius: 38 },
  motion: 'minimal',
  link: 'halodaily://home',
};

export type Mode = 'ask' | 'drop' | 'ci' | 'release' | 'protein' | 'claude' | 'day';

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
  /** A release you haven't seen yet. */
  release: Release | null;
  alertSeq: number;
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
  if (on.release && v.release) return 'release';
  if (on.protein && v.nudge) return 'protein';
  if (on.claude && d?.working && v.now - d.lastEventAt < 10 * 60_000) return 'claude';
  return 'day';
}

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
  const idle = s.prefs.idle;
  const flags = Object.fromEntries((['ask', 'drop', 'ci', 'release', 'protein', 'claude', 'day'] as Mode[]).map((m) => [`m${m[0].toUpperCase()}${m.slice(1)}`, mode === m]));

  return {
    ...flags,
    dSteps: mode === 'day' && idle === 'steps',
    dClaude: mode === 'day' && idle === 'claude',
    dKcal: mode === 'day' && idle === 'kcal',
    dProt: mode === 'day' && idle === 'protein',
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
    nTitle: mode === 'ask' ? 'Claude wants to run a command' : mode === 'ci' ? `${ciState?.repo}: ${ciState?.status === 'completed' ? (ciState.conclusion === 'success' ? 'CI passed' : 'CI failed') : 'CI running'}` : `${steps.toLocaleString('en-IN')} steps · ${kcal(s)} kcal · ${prot} g protein`,
    nBody: mode === 'ask' ? live?.pending?.tool ?? '' : mode === 'claude' ? live?.task ?? '' : five ? `Claude ${pct(five.pct)} of 5h limit${claudeLine ? ' · ' + claudeLine : ''}` : 'Halo',
    // Bumped by the app for moments that need you; it only grows, so clearing never pops the island.
    alertSeq: v.alertSeq,
  };
}
