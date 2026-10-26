/**
 * Everything Halo remembers about your day, as one plain object saved to Android prefs. Pure
 * functions only, so the rules (day rollover, step baselines, protein pace) are easy to check:
 * `bun daily/day.check.ts`.
 */

import type { ClaudeAuth, ClaudeUsage } from './claude';
import type { Curve, KiteAuth, Portfolio } from './kite';
import type { DeskLink } from './desk';

export interface Food { t: number; name: string; kcal: number; protein: number }
export interface Story { id: number; title: string; url: string; points: number; comments: number; site: string }
export interface Weather { temp: number; high: number; low: number; sky: string; label: string; city: string }

export type CardId = 'weather' | 'steps' | 'claude' | 'food' | 'water' | 'kite' | 'github' | 'npm' | 'releases' | 'news' | 'desk';
export type Moment = 'ask' | 'drop' | 'ci' | 'market' | 'release' | 'protein' | 'claude';
export interface Release { repo: string; tag: string; url: string; at: number }
export interface Npm { name: string; week: number; day: number; version: string; month: number[] }

/** Rows the island's day view can show. Buttons are rows too, so a profile can drop them. */
export type Row = 'portfolio' | 'weather' | 'steps' | 'kcal' | 'protein' | 'water' | 'claude' | 'kite' | 'news' | 'bWater' | 'bFood' | 'bRead' | 'bSwitch';
export const ROWS: Record<Row, string> = {
  weather: 'Weather', steps: 'Steps ring', kcal: 'kcal ring', protein: 'Protein ring', water: 'Water ring',
  portfolio: 'Portfolio (full)', claude: 'Claude limits', kite: 'Portfolio (one line)', news: 'Top story',
  bWater: 'Water button', bFood: 'Food button', bRead: 'Read button', bSwitch: 'Switch-profile button',
};
/** A way of using Halo: what the island's day view and the dashboard show, and the resting value. */
export interface Profile { name: string; rows: Row[]; cards: CardId[]; idle: 'steps' | 'claude' | 'kcal' | 'protein' | 'kite' }

/** Everything you can change in Settings. */
export interface Prefs {
  /** Dashboard cards, in this order; off ones are hidden. */
  cards: { id: CardId; on: boolean }[];
  /** Which moments may take over the island. */
  island: Record<Moment, boolean>;
  /** Profiles, and which one is on. */
  profiles: Profile[];
  profile: number;
  reminder: { on: boolean; hours: number[] };
  newsMin: number;
  stepCm: number;
  npm: string[];
  repos: string[];
}

export interface Saved {
  desk: DeskLink;
  overlay: boolean;
  goals: { steps: number; kcal: number; protein: number; water: number };
  day: string;
  /** Step counter bookkeeping: `base` is the counter reading today started from. */
  steps: { base: number; carry: number; last: number; hours: number[] };
  food: Food[];
  water: number;
  /** What you log, learned: name → last kcal/protein and how often. */
  foods: Record<string, { kcal: number; protein: number; n: number }>;
  history: Record<string, { steps: number; kcal: number; protein: number; water: number }>;
  /** Protein reminder slots already fired today ('13', '17', '21'). */
  nudged: string[];
  news: Story[];
  newsAt: number;
  place: { lat: number; lon: number; city: string } | null;
  wx: Weather | null;
  wxAt: number;
  /** Signed in with your Claude account: limits without the PC. */
  claude: ClaudeAuth | null;
  claudeUsage: ClaudeUsage | null;
  prefs: Prefs;
  /** Swiped away: the island only comes back for moments that need you. */
  quiet: boolean;
  /** Zerodha: your API app, today's session, and the last portfolio read. */
  kite: KiteAuth | null;
  kitePf: Portfolio | null;
  /** Today's day-P&L readings, and the market moments you've already seen. */
  kiteCurve: Curve | null;
  kiteSeen: string[];
  /** Show a moving sample portfolio instead of yours: for demos and screen recordings. */
  kiteDemo: boolean;
  npmStats: Npm[];
  npmAt: number;
  releases: Release[];
  releasesAt: number;
}

export const today = (ms = Date.now()) => new Date(ms).toLocaleDateString('en-CA');

/** Common Indian + gym staples to start with; your own logs take over the list quickly. */
const STARTERS: Saved['foods'] = {
  'Chai': { kcal: 90, protein: 3, n: 0 },
  'Eggs ×2': { kcal: 156, protein: 13, n: 0 },
  'Protein shake': { kcal: 130, protein: 25, n: 0 },
  'Paneer 100g': { kcal: 265, protein: 18, n: 0 },
  'Dal rice': { kcal: 450, protein: 14, n: 0 },
  'Roti sabzi': { kcal: 350, protein: 10, n: 0 },
  'Curd bowl': { kcal: 120, protein: 9, n: 0 },
  'Chicken 150g': { kcal: 250, protein: 40, n: 0 },
};

export const fresh = (): Saved => ({
  desk: { addr: '', token: '' },
  overlay: true,
  goals: { steps: 8000, kcal: 2200, protein: 120, water: 8 },
  day: today(),
  steps: { base: -1, carry: 0, last: -1, hours: Array(24).fill(0) },
  food: [],
  water: 0,
  foods: STARTERS,
  history: {},
  nudged: [],
  news: [],
  newsAt: 0,
  place: null,
  wx: null,
  wxAt: 0,
  claude: null,
  claudeUsage: null,
  prefs: defaultPrefs(),
  quiet: false,
  kite: null,
  kitePf: null,
  kiteCurve: null,
  kiteSeen: [],
  kiteDemo: false,
  npmStats: [],
  npmAt: 0,
  releases: [],
  releasesAt: 0,
});

export const CARDS: Record<CardId, string> = { weather: 'Weather', steps: 'Steps', claude: 'Claude Code', food: 'Food', water: 'Water', kite: 'Zerodha', github: 'GitHub', npm: 'npm packages', releases: 'Releases', news: 'Hacker News', desk: 'Desk' };
export const MOMENTS: Record<Moment, string> = { ask: 'Claude asks permission', drop: 'File or text from PC', ci: 'CI runs', market: 'Market bell (open, big moves, close)', release: 'New releases', protein: 'Protein reminder', claude: 'Claude working' };

export const defaultPrefs = (): Prefs => ({
  cards: (Object.keys(CARDS) as CardId[]).map((id) => ({ id, on: true })),
  island: { ask: true, drop: true, ci: true, market: true, release: true, protein: true, claude: true },
  profiles: defaultProfiles(),
  profile: 0,
  reminder: { on: true, hours: [13, 17, 21] },
  newsMin: 50,
  stepCm: 75,
  npm: ['halo-island'],
  repos: ['facebook/react-native', 'expo/expo', 'software-mansion/react-native-reanimated'],
});

const ALL_CARDS = (): CardId[] => ['weather', 'steps', 'claude', 'food', 'water', 'kite', 'github', 'npm', 'releases', 'news', 'desk'];
export const defaultProfiles = (): Profile[] => [
  { name: 'Everything', rows: Object.keys(ROWS) as Row[], cards: ALL_CARDS(), idle: 'steps' },
  { name: 'Work', rows: ['claude', 'news', 'bRead', 'bSwitch'], cards: ['claude', 'github', 'npm', 'releases', 'news', 'desk'], idle: 'claude' },
  { name: 'Markets', rows: ['portfolio', 'bSwitch'], cards: ['kite', 'news'], idle: 'kite' },
  { name: 'Work + Markets', rows: ['portfolio', 'claude', 'bSwitch'], cards: ['claude', 'kite', 'github', 'desk'], idle: 'kite' },
  { name: 'Health', rows: ['weather', 'steps', 'kcal', 'protein', 'water', 'bWater', 'bFood', 'bSwitch'], cards: ['weather', 'steps', 'food', 'water'], idle: 'steps' },
];
export const activeProfile = (s: Saved): Profile => s.prefs.profiles[s.prefs.profile] ?? s.prefs.profiles[0] ?? defaultProfiles()[0];

/** Saved data from an older version: new fields and new cards get their defaults. */
export function migrate(raw: Partial<Saved>): Saved {
  const base = fresh();
  const prefs = { ...base.prefs, ...raw.prefs, island: { ...base.prefs.island, ...raw.prefs?.island }, reminder: { ...base.prefs.reminder, ...raw.prefs?.reminder } };
  const known = new Set(prefs.cards.map((c) => c.id));
  prefs.cards = [...prefs.cards.filter((c) => c.id in CARDS), ...base.prefs.cards.filter((c) => !known.has(c.id))];
  // Before profiles there was one global resting value; it becomes the first profile's.
  const oldIdle = (raw.prefs as { idle?: Profile['idle'] } | undefined)?.idle;
  if (oldIdle && !raw.prefs?.profiles) prefs.profiles = prefs.profiles.map((p, i) => (i === 0 ? { ...p, idle: oldIdle } : p));
  return { ...base, ...raw, prefs } as Saved;
}

export const stepsToday = (s: Saved) => (s.steps.base < 0 ? 0 : s.steps.carry + s.steps.last - s.steps.base);
export const kcal = (s: Saved) => s.food.reduce((a, f) => a + f.kcal, 0);
export const protein = (s: Saved) => s.food.reduce((a, f) => a + f.protein, 0);

/** A new day: yesterday goes to history, today starts empty. Steps since the last reading count today. */
export function roll(s: Saved, now = Date.now()): Saved {
  const d = today(now);
  if (s.day === d) return s;
  const history = { ...s.history, [s.day]: { steps: stepsToday(s), kcal: kcal(s), protein: protein(s), water: s.water } };
  for (const k of Object.keys(history).sort().slice(0, -14)) delete history[k];
  const last = s.steps.last;
  return { ...s, day: d, history, food: [], water: 0, nudged: [], steps: { base: last, carry: 0, last, hours: Array(24).fill(0) } };
}

/** A reading from TYPE_STEP_COUNTER (steps since boot). Handles first launch and reboots. */
export function addSteps(s: Saved, total: number, now = Date.now()): Saved {
  const st = { ...s.steps, hours: [...s.steps.hours] };
  if (st.base < 0 || st.last < 0) {
    st.base = st.last = total;
  } else if (total < st.last) {
    // Rebooted: the counter restarted from zero.
    st.carry += st.last - st.base;
    st.base = 0;
    st.hours[new Date(now).getHours()] += total;
    st.last = total;
  } else {
    st.hours[new Date(now).getHours()] += total - st.last;
    st.last = total;
  }
  return { ...s, steps: st };
}

/** iOS gives today's steps directly (Core Motion since midnight): store them as a counter from 0. */
export function setStepsToday(s: Saved, steps: number, now = Date.now()): Saved {
  const hours = [...s.steps.hours];
  const before = stepsToday(s);
  if (steps > before) hours[new Date(now).getHours()] += steps - before;
  return { ...s, steps: { base: 0, carry: 0, last: steps, hours } };
}

export function logFood(s: Saved, name: string, kcalN: number, proteinN: number, now = Date.now()): Saved {
  const prev = s.foods[name];
  return {
    ...s,
    food: [...s.food, { t: now, name, kcal: kcalN, protein: proteinN }],
    foods: { ...s.foods, [name]: { kcal: kcalN, protein: proteinN, n: (prev?.n ?? 0) + 1 } },
  };
}

export const removeFood = (s: Saved, t: number): Saved => ({ ...s, food: s.food.filter((f) => f.t !== t) });

/** Your most-logged foods first, then the starters. */
export const favourites = (s: Saved, n = 8) =>
  Object.entries(s.foods).sort((a, b) => b[1].n - a[1].n).slice(0, n).map(([name, f]) => ({ name, ...f }));

/** The highest-protein favourite: what the reminder offers as a one-tap fix. */
export const proteinPick = (s: Saved) =>
  favourites(s, 99).filter((f) => f.protein > 0).sort((a, b) => b.protein / Math.max(b.kcal, 1) - a.protein / Math.max(a.kcal, 1))[0];

/**
 * Protein reminder: at each reminder hour (default 1 pm, 5 pm, 9 pm), if you're under the share of
 * your goal you should have reached by then, returns that slot so the island can nudge once.
 */
export function proteinDue(s: Saved, now = Date.now()): string | null {
  const { on, hours } = s.prefs.reminder;
  if (!on || !hours.length) return null;
  const h = new Date(now).getHours();
  const sorted = [...hours].sort((a, b) => a - b);
  // Each check expects an even share of 90% of the goal: 3 checks → 30%, 60%, 90%.
  const i = sorted.findIndex((at) => h >= at && h < at + 2);
  if (i < 0) return null;
  const key = String(sorted[i]);
  if (s.nudged.includes(key)) return null;
  return protein(s) < s.goals.protein * 0.9 * ((i + 1) / sorted.length) ? key : null;
}

export const compact = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n.toLocaleString('en-IN'));
