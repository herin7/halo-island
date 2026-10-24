/**
 * Every live activity in the showcase: template + first state + a story of timed updates + what
 * its buttons do. Plain data over the `halo-island` builders, shared by the app and the website.
 *
 * Layout follows Apple's Live Activity anatomy: compact is one glyph and one value; expanded is
 * leading mark · title · trailing value, then at most one visual and one row of controls.
 * Characters appear only where they carry meaning (the quiz and focus pet react to you).
 * Design rules: docs/design/brief.md.
 */
import {
  IslandNode, IslandState, IslandTemplate,
  arc, bar, bars, button, chips, column, fx, icon, image, line, lottie, pet, ring, row, stack, steps, svg, text, timer, track, when,
} from 'halo-island';

import { brand } from './brands';

/** Wait, then patch the state — computed when the beat plays, so times are always fresh. */
export type Beat = [delayMs: number, patch: IslandState | ((s: IslandState) => IslandState), alert?: boolean];

export type Group = 'Daily' | 'EdTech' | 'Work' | 'Health' | 'Money' | 'Sport' | 'Travel' | 'Focus' | 'Games';

export interface Scenario {
  id: string;
  group: Group;
  title: string;
  /** What the island tracks, in a few plain words. */
  about: string;
  /** Brand color: the card's accent. */
  color: string;
  /** Glyph that stands for it on cards (glyphs.ts or a built-in icon). */
  glyph: string;
  template: IslandTemplate;
  initial: () => IslandState;
  story: Beat[];
  /** What the island's buttons and inputs do: return a state patch (or nothing). */
  handle?: (action: string, state: IslandState) => IslandState | void;
  /** A moment, not an activity: shown in-app and dismissed. */
  toast?: boolean;
}

const GREY = '#98989F';
const FILL = '#2C2C2E';
const MIN = 60_000;

// region Building blocks

/** The leading mark: a glyph on a tinted disc, like an app's symbol in a Live Activity. */
const mark = (name: string, color: string, size = 44) =>
  column({ width: size, height: size, radius: size / 2, background: color + '2E', align: 'center', justify: 'center' }, icon(name, { size: Math.round(size * 0.5), color }));
/** Hero number with a small unit on one baseline. */
const hero = (value: string, unit: string, color: string, size = 34) =>
  row({ align: 'baseline', gap: 3 }, text(value, { size, weight: 'semibold', color, mono: true }), text(unit, { size: Math.round(size * 0.42), weight: 'semibold', color }));
/** Compact trailing: a number and its unit. */
const tail = (value: string, unit: string, color: string) =>
  row({ align: 'baseline', gap: 2 }, text(value, { size: 16, weight: 'semibold', color, mono: true }), text(unit, { size: 12, weight: 'semibold', color }));
/** Title over a muted line. */
const label = (title: string, sub: string, align: 'start' | 'end' = 'start') =>
  column({ gap: 1, align, grow: align === 'start' }, text(title, { size: 16, weight: 'semibold', align, lines: 1 }), text(sub, { size: 13, color: GREY, align, lines: 1 }));
/** A button sharing its row's width with its siblings. */
const wide = (node: IslandNode) => column({ grow: true }, node);
const round = (node: IslandNode) => column({ width: 44 }, node);
const glyph = (name: string, color: string, size = 18) => icon(name, { size, color });

/** Claude Code's mark, drawn as an eight-spoke burst. */
const BURST = 'M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3L5.3 18.7';

// endregion

export const scenarios: Scenario[] = [
  // region Daily
  {
    id: 'swiggy',
    group: 'Daily',
    title: 'Swiggy',
    about: 'Your order, riding home',
    color: '#FC8019',
    glyph: 'moped',
    template: {
      compact: { leading: glyph('{vehicle}', '#FC8019', 20), trailing: column({ gap: 0 }, when('!delivered', tail('{eta}', 'min', '#FC8019')), when('delivered', glyph('check', '#30D158', 18))) },
      expanded: column({ gap: 16 },
        row({ gap: 12 }, label('{status}', '{items}'), when('!delivered', hero('{eta}', 'min', '#FC8019')), when('delivered', glyph('check', '#30D158', 28))),
        when('!delivered', track('{progress}', 'moped', { end: 'house', markerSize: 16, height: 4, color: '#FC8019', track: FILL })),
        when('delivered', bar(1, { height: 4, color: '#FC8019' })),
        when('rider', row({ gap: 10 },
          wide(button('call', 'Call {rider}', { icon: 'phone', color: '#FC8019', tint: true })),
          round(button('chat', undefined, { icon: 'chat-circle', color: '#FC8019', tint: true })))),
      ),
      theme: { accent: '#FC8019' },
    },
    initial: () => ({ status: 'Order confirmed', items: 'Meghana Foods · 2 items', eta: 32, progress: 0.04, vehicle: 'cooking-pot' }),
    story: [
      [2400, { status: 'Packing your biryani', eta: 26, progress: 0.18 }],
      [2600, { status: 'Ravi picked it up', eta: 18, progress: 0.38, rider: 'Ravi', vehicle: 'moped' }, true],
      [2600, { status: 'Ravi is 2 km away', eta: 9, progress: 0.66 }],
      [2600, { status: 'Arriving now', eta: 2, progress: 0.92 }],
      [2600, { status: 'Delivered', items: 'Enjoy your meal', eta: 0, progress: 1, rider: '', vehicle: 'house', delivered: true }, true],
    ],
  },
  {
    id: 'uber',
    group: 'Daily',
    title: 'Uber',
    about: 'PIN, plate, car closing in',
    color: '#FFFFFF',
    glyph: 'car-profile',
    template: {
      compact: { leading: glyph('car-profile', '#FFFFFF', 20), trailing: text('{etaLabel}', { size: 16, weight: 'semibold', mono: true }) },
      expanded: column({ gap: 16 },
        row({ gap: 12 },
          label('{status}', '{car} · {plate}'),
          when('pin', column({ background: FILL, radius: 12, padding: 8, gap: 0, align: 'center', width: 62 },
            text('PIN', { size: 10, weight: 'semibold', color: GREY }), text('{pin}', { size: 19, weight: 'semibold', mono: true })))),
        track('{progress}', 'car-profile', { end: 'map-pin', markerSize: 16, height: 4, color: '#FFFFFF', track: FILL }),
        when('driver', row({ gap: 10 },
          wide(button('call', 'Call {driver}', { icon: 'phone', color: '#FFFFFF', textColor: '#000000' })),
          round(button('chat', undefined, { icon: 'chat-circle', color: '#FFFFFF', tint: true })))),
      ),
      theme: { accent: '#FFFFFF' },
    },
    initial: () => ({ status: 'Finding your ride', car: 'Uber Go', plate: 'Matching drivers', etaLabel: 'Finding', progress: 0 }),
    story: [
      [2400, { status: 'Pickup in 6 min', car: 'White Swift Dzire', plate: 'KA 01 AB 1234', driver: 'Asha', pin: '4821', etaLabel: '6 min', progress: 0.2 }, true],
      [2600, { status: 'Pickup in 3 min', etaLabel: '3 min', progress: 0.58 }],
      [2600, { status: 'Asha is here', etaLabel: 'Here', progress: 1 }, true],
    ],
  },
  // endregion

  // region EdTech
  {
    id: 'streak',
    group: 'EdTech',
    title: 'Daily lesson',
    about: 'Keep the streak alive',
    color: '#58CC02',
    glyph: 'fire',
    template: {
      compact: { leading: glyph('fire', '#FF9600', 20), trailing: tail('{streak}', 'd', '#FF9600') },
      expanded: column({ gap: 16 },
        row({ gap: 12 },
          label('{streak} day streak', 'Spanish · lesson {lesson} of 5'),
          column({ align: 'end', gap: 0 }, text('{xp}', { size: 24, weight: 'semibold', mono: true, color: '#58CC02' }), text('XP today', { size: 12, color: GREY }))),
        steps('{lesson}', 5, { height: 4, color: '#58CC02', track: FILL }),
        row({ gap: 10 }, wide(button('practice', '{cta}', { color: '#58CC02', textColor: '#0B2400' }))),
      ),
      theme: { accent: '#58CC02' },
    },
    initial: () => ({ streak: 41, lesson: 2, xp: 30, goal: 0.4, cta: 'Continue lesson 3' }),
    story: [
      [2500, { lesson: 3, xp: 45, goal: 0.6, cta: 'Continue lesson 4' }],
      [2500, { lesson: 4, xp: 60, goal: 0.8, cta: 'One more saves your streak' }, true],
    ],
    handle: (action, s) => {
      if (action !== 'practice') return;
      const lesson = Math.min(5, Number(s.lesson) + 1);
      return lesson === 5
        ? { lesson, xp: Number(s.xp) + 20, goal: 1, streak: Number(s.streak) + 1, cta: 'Streak saved · see you tomorrow' }
        : { lesson, xp: Number(s.xp) + 15, goal: lesson / 5, cta: `Continue lesson ${lesson + 1}` };
    },
  },
  {
    id: 'class',
    group: 'EdTech',
    title: 'Live class',
    about: 'Countdown, then join live',
    color: '#FF6B3D',
    glyph: 'video-camera',
    template: {
      compact: {
        leading: glyph('video-camera', '#FF6B3D', 20),
        trailing: column({ gap: 0 },
          when('!live', timer('{startsAt}', { style: { size: 16, weight: 'semibold', color: '#FF6B3D' } })),
          when('live', fx(text('LIVE', { size: 14, weight: 'bold', color: '#FF453A' }), 'pulse'))),
      },
      expanded: column({ gap: 16 },
        row({ gap: 12 },
          label('Rotational Motion', 'Physics · Neha ma’am'),
          column({ align: 'end', gap: 0 },
            when('!live', timer('{startsAt}', { style: { size: 28, weight: 'semibold', color: '#FF6B3D' } })),
            when('live', fx(text('LIVE', { size: 15, weight: 'bold', color: '#FF453A' }), 'pulse')),
            text('{waiting} waiting', { size: 12, color: GREY }))),
        row({ gap: 10 },
          wide(button('join', '{cta}', { color: '#FF6B3D', textColor: '#1E0A00' })),
          round(button('remind', undefined, { icon: 'bell', color: '#FF6B3D', tint: true }))),
      ),
      theme: { accent: '#FF6B3D' },
    },
    initial: () => ({ startsAt: Date.now() + 14 * MIN, waiting: '12.4k', live: false, cta: 'Join when it starts' }),
    story: [
      [600, () => ({ startsAt: Date.now() + 9_000 })],
      [2400, { waiting: '13.1k' }],
      [6500, { live: true, waiting: '14.2k', cta: 'Join class' }, true],
    ],
  },
  {
    id: 'quiz',
    group: 'EdTech',
    title: 'Flashcards',
    about: 'Answer in the island, the pet reacts',
    color: '#8B7CFF',
    glyph: 'brain',
    template: {
      compact: { leading: pet('{mood}', { size: 22 }), trailing: tail('{score}', '/{total}', '#8B7CFF') },
      expanded: column({ gap: 14 },
        row({ gap: 12, align: 'start' },
          column({ gap: 4, grow: true },
            text('Biology · {q} of {total}', { size: 13, weight: 'semibold', color: '#8B7CFF' }),
            text('{question}', { size: 18, weight: 'semibold', lines: 2 })),
          pet('{mood}', { size: 40 })),
        chips('answer', ['{a}', '{b}', '{c}'], { values: ['a', 'b', 'c'], color: '#8B7CFF' }),
        when('verdict', text('{verdict}', { size: 14, weight: 'semibold', color: '{verdictColor}' })),
        row({ gap: 10 }, wide(button('check', '{cta}', { color: '#8B7CFF', textColor: '#FFFFFF' }))),
      ),
      theme: { accent: '#8B7CFF' },
    },
    initial: () => ({ ...QUIZ[0], q: 1, score: 0, total: QUIZ.length, mood: 'idle', cta: 'Check', answer: '' }),
    story: [],
    handle: (action, s) => {
      if (action === 'change:answer') return { mood: 'thinking', verdict: '' };
      if (action !== 'check') return;
      const i = Number(s.q) - 1;
      if (s.cta === 'Next') {
        const next = QUIZ[i + 1];
        return next ? { ...next, q: i + 2, mood: 'idle', verdict: '', cta: 'Check', answer: '' } : { mood: 'love', verdict: `Done · ${s.score} of ${s.total}`, verdictColor: '#8B7CFF', cta: 'Restart' };
      }
      if (s.cta === 'Restart') return { ...QUIZ[0], q: 1, score: 0, mood: 'idle', verdict: '', cta: 'Check', answer: '' };
      if (!s.answer) return { mood: 'surprised', verdict: 'Pick an answer first', verdictColor: GREY };
      const right = s.answer === QUIZ[i].right;
      return { mood: right ? 'happy' : 'sad', score: Number(s.score) + (right ? 1 : 0), verdict: right ? 'Correct · +10 XP' : `It’s ${QUIZ[i][QUIZ[i].right as 'a']}`, verdictColor: right ? '#30D158' : '#FF6961', cta: 'Next' };
    },
  },
  // endregion

  // region Work
  {
    id: 'claude',
    group: 'Work',
    title: 'Claude Code',
    about: 'Usage, resets, approve tool calls',
    color: '#D97757',
    glyph: 'terminal-window',
    template: {
      compact: {
        leading: svg(BURST, { size: 18, color: '#D97757', stroke: 2.6 }),
        // A waiting approval never hides behind a percentage.
        trailing: column({ gap: 0 }, when('!pending', tail('{session}', '%', '#D97757')), when('pending', fx(text('Allow?', { size: 15, weight: 'semibold', color: '#D97757' }), 'pulse'))),
      },
      expanded: column({ gap: 14 },
        row({ gap: 12 },
          stack(ring('{sessionP}', { size: 44, thickness: 4, color: '#D97757', track: FILL }), text('{session}', { size: 13, weight: 'semibold', mono: true })),
          column({ gap: 1, grow: true },
            text('Session', { size: 16, weight: 'semibold' }),
            row({ gap: 4, align: 'baseline' }, text('Resets in', { size: 13, color: GREY }), timer('{resetsAt}', { style: { size: 13, color: GREY } }))),
          column({ align: 'end', gap: 1 }, text('{week}%', { size: 16, weight: 'semibold', mono: true }), text('this week', { size: 12, color: GREY }))),
        when('!pending', row({ gap: 8 }, icon('terminal-window', { size: 16, color: GREY }), fx(text('{task}', { size: 14, color: '#E5E5EA', lines: 1 }), 'shimmer'))),
        when('pending', column({ gap: 12 },
          column({ gap: 2, background: FILL, radius: 14, padding: 12 },
            text('Allow this command?', { size: 12, color: GREY }),
            text('{tool}', { size: 14, weight: 'medium', font: 'monospace', lines: 2 })),
          row({ gap: 10 },
            wide(button('deny', 'Deny', { color: '#FFFFFF', tint: true })),
            wide(button('allow', 'Allow', { color: '#D97757', textColor: '#1A0B05', confirm: 'Tap to run' }))))),
      ),
      theme: { accent: '#D97757' },
    },
    initial: () => ({ session: 41, sessionP: 0.41, week: 23, resetsAt: Date.now() + 2 * 60 * MIN + 14 * MIN, task: 'Reading src/host.tsx', pending: false }),
    story: [
      [2400, { task: 'Editing host.tsx', session: 48, sessionP: 0.48 }],
      [2600, { task: 'Running bun test', session: 55, sessionP: 0.55, week: 25 }],
      [2600, { pending: true, tool: 'git push origin v2-living-island' }, true],
    ],
    handle: (action, s) => {
      if (action === 'allow') return { pending: false, task: 'Pushed v2-living-island', session: Number(s.session) + 3, sessionP: (Number(s.session) + 3) / 100 };
      if (action === 'deny') return { pending: false, task: 'Waiting for your next prompt' };
    },
  },
  {
    id: 'codex',
    group: 'Work',
    title: 'Codex',
    about: 'Credits left and daily burn',
    color: '#10A37F',
    glyph: 'robot',
    template: {
      compact: { leading: glyph('robot', '#10A37F', 20), trailing: tail('{credits}', 'cr', '{tone}') },
      expanded: column({ gap: 14 },
        row({ gap: 12 }, label('Pro plan', 'Renews in {renews} days'), hero('{credits}', 'credits', '{tone}', 28)),
        bars('{daily}', { height: 36, gap: 6, color: '#10A37F', track: FILL, active: '{today}' }),
        when('low', row({ gap: 10 }, wide(button('topup', 'Top up 500 credits', { color: '#10A37F', textColor: '#00140E', confirm: 'Pay $20?' })))),
      ),
      theme: { accent: '#10A37F' },
    },
    initial: () => ({ credits: '1,240', tone: '#10A37F', renews: 6, daily: '0.3,0.5,0.8,0.4,0.6,0.2,0.1', today: 6 }),
    story: [
      [2400, { credits: '980', daily: '0.3,0.5,0.8,0.4,0.6,0.5,0.1' }],
      [2400, { credits: '410', daily: '0.3,0.5,0.8,0.4,0.6,0.9,0.1' }],
      [2400, { credits: '120', tone: '#FF9F0A', low: true, daily: '0.3,0.5,0.8,0.4,0.6,1,0.1' }, true],
    ],
    handle: (action) => (action === 'topup' ? { credits: '620', tone: '#10A37F', low: false } : undefined),
  },
  // endregion

  // region Health & focus
  {
    id: 'mumma',
    group: 'Health',
    title: 'Mumma',
    about: 'Water and meals, from mom',
    color: '#64D2FF',
    glyph: 'drop',
    template: {
      compact: { leading: glyph('drop', '#64D2FF', 18), trailing: tail('{glasses}', '/8', '#64D2FF') },
      expanded: column({ gap: 16 },
        row({ gap: 12 },
          stack(ring('{water}', { size: 44, thickness: 4, color: '#64D2FF', track: FILL }), text('{glasses}', { size: 15, weight: 'semibold', mono: true })),
          label('{line}', '{glasses} of 8 glasses · {meals} of 4 meals')),
        row({ gap: 10 },
          wide(button('glass', 'Drank a glass', { icon: 'plus', color: '#64D2FF', textColor: '#00202E' })),
          wide(button('ate', 'Ate {meal}', { icon: 'fork-knife', color: '#FFB340', tint: true }))),
      ),
      theme: { accent: '#64D2FF' },
    },
    initial: () => ({ line: 'Paani pi lo, beta', glasses: 3, water: 3 / 8, meals: 1, meal: 'lunch' }),
    story: [
      [3500, { line: 'Lunch time. Khana kha liya?' }, true],
    ],
    handle: (action, s) => {
      if (action === 'glass') {
        const glasses = Math.min(8, Number(s.glasses) + 1);
        return { glasses, water: glasses / 8, line: glasses === 8 ? 'All 8. Shabaash!' : glasses >= 6 ? 'Almost there, beta' : 'Good. One more soon' };
      }
      if (action === 'ate') {
        const meals = Math.min(4, Number(s.meals) + 1);
        return { meals, meal: ['breakfast', 'lunch', 'snack', 'dinner'][Math.min(3, meals)], line: 'Proud of you' };
      }
    },
  },
  {
    id: 'meds',
    group: 'Health',
    title: 'Medicine',
    about: 'Take or snooze from the island',
    color: '#FF375F',
    glyph: 'pill',
    template: {
      compact: { leading: glyph('pill', '#FF375F', 18), trailing: text('{when}', { size: 15, weight: 'semibold', color: '#FF375F' }) },
      expanded: column({ gap: 16 },
        row({ gap: 12 }, label('{name}', '{dose}'), column({ width: 56 }, steps('{taken}', 3, { height: 4, color: '#FF375F', track: FILL }))),
        row({ gap: 10 },
          wide(button('snooze', 'Snooze 10 min', { color: '#FFFFFF', tint: true })),
          wide(button('take', 'Taken', { icon: 'check', color: '#FF375F', textColor: '#FFFFFF' }))),
      ),
      theme: { accent: '#FF375F' },
    },
    initial: () => ({ name: 'Vitamin D3', dose: '1 capsule after lunch', when: 'Now', taken: 1 }),
    story: [],
    handle: (action, s) => (action === 'take' ? { taken: Number(s.taken) + 1, when: 'Done', dose: 'Next: Omega-3 at 9 pm' } : action === 'snooze' ? { when: '10m' } : undefined),
  },
  {
    id: 'focus',
    group: 'Focus',
    title: 'Focus',
    about: 'Pomodoro, the pet naps on breaks',
    color: '#FF9F0A',
    glyph: 'timer',
    template: {
      compact: { leading: pet('{mood}', { size: 22 }), trailing: timer('{endsAt}', { style: { size: 16, weight: 'semibold', color: '#FF9F0A' } }) },
      expanded: column({ gap: 16 },
        row({ gap: 14 },
          pet('{mood}', { size: 44 }),
          column({ gap: 0, grow: true },
            text('{phase} · {round} of 4', { size: 13, color: GREY }),
            timer('{endsAt}', { style: { size: 40, weight: 'semibold', color: '#FF9F0A' } }))),
        row({ gap: 10 },
          wide(button('skip', 'Skip', { color: '#FFFFFF', tint: true })),
          wide(button('stop', 'End', { color: '#FF9F0A', tint: true, confirm: 'End session?' }))),
      ),
      theme: { accent: '#FF9F0A' },
    },
    initial: () => ({ endsAt: Date.now() + 25 * MIN, mood: 'focused', phase: 'Deep work', round: 2 }),
    story: [],
    handle: (action, s) => (action === 'skip'
      ? (s.phase === 'Deep work' ? { phase: 'Break', mood: 'sleepy', endsAt: Date.now() + 5 * MIN } : { phase: 'Deep work', mood: 'focused', round: Number(s.round) + 1, endsAt: Date.now() + 25 * MIN })
      : undefined),
  },
  // endregion

  // region Sport, music, travel, money
  {
    id: 'ipl',
    group: 'Sport',
    title: 'IPL Live',
    about: 'Score and run rate, ball by ball',
    color: '#0A84FF',
    glyph: 'broadcast',
    template: {
      compact: {
        leading: row({ gap: 5 }, column({ width: 6, height: 6, radius: 3, background: '#FF453A' }), text('MI', { size: 15, weight: 'bold' })),
        trailing: text('{runs}/{wkts}', { size: 16, weight: 'semibold', mono: true }),
      },
      expanded: column({ gap: 14 },
        row({ gap: 12 },
          column({ gap: 1, grow: true },
            row({ gap: 6 }, column({ width: 6, height: 6, radius: 3, background: '#FF453A' }), text('MI vs CSK · {overs} ov', { size: 13, color: GREY })),
            text('{batter}', { size: 16, weight: 'semibold', lines: 1 })),
          stack(column({ align: 'end', gap: 0 }, hero('{runs}/{wkts}', '', '#FFFFFF', 30), text('CRR {crr}', { size: 12, color: GREY })), when('six', lottie('lottie:confetti', { size: 90, loop: false })))),
        bars('{perOver}', { active: '{over}', color: '#0A84FF', track: FILL, height: 32, gap: 4 }),
      ),
      theme: { accent: '#0A84FF' },
    },
    initial: () => ({ runs: 92, wkts: 1, overs: '8.5', over: 9, crr: '10.42', batter: 'Rohit 42 (30)', perOver: '0.4,0.7,0.3,0.9,0.5,0.6,1,0.8,0.5,0,0,0,0,0,0,0,0,0,0,0' }),
    story: [
      [2400, { runs: 98, overs: '8.6', batter: 'Rohit 48 (31) · SIX', six: true, perOver: '0.4,0.7,0.3,0.9,0.5,0.6,1,0.8,0.9,0,0,0,0,0,0,0,0,0,0,0' }, true],
      [2600, { runs: 99, overs: '9.1', over: 10, six: false, batter: 'Rohit 49 (32)', perOver: '0.4,0.7,0.3,0.9,0.5,0.6,1,0.8,0.9,0.1,0,0,0,0,0,0,0,0,0,0' }],
      [2400, { runs: 103, overs: '9.2', crr: '11.03', batter: 'Rohit 53 (33) · fifty', perOver: '0.4,0.7,0.3,0.9,0.5,0.6,1,0.8,0.9,0.5,0,0,0,0,0,0,0,0,0,0' }],
    ],
  },
  {
    id: 'spotify',
    group: 'Sport',
    title: 'Spotify',
    about: 'Artwork, live waveform, controls',
    color: '#1DB954',
    glyph: 'music-notes',
    template: {
      compact: {
        leading: image('https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=70', { size: 22, radius: 6 }),
        trailing: column({ width: 28, gap: 0 }, bars('0.5,0.9,0.6,1,0.4', { height: 14, gap: 2, color: '#1DB954', animate: true })),
      },
      expanded: column({ gap: 14 },
        row({ gap: 12 },
          image('https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=70', { size: 52, radius: 12 }),
          label('{title}', '{artist}'),
          svg(brand.spotify, { size: 20, color: '#1DB954' })),
        bar('{progress}', { color: '#FFFFFF', track: '#3A3A3C', height: 4 }),
        row({ justify: 'center', gap: 28 },
          button('previous', undefined, { icon: 'skip-back', color: '#000000', textColor: '#FFFFFF', shape: 'circle' }),
          button('toggle', undefined, { icon: '{playIcon}', color: '#000000', textColor: '#FFFFFF', shape: 'circle' }),
          button('next', undefined, { icon: 'skip-forward', color: '#000000', textColor: '#FFFFFF', shape: 'circle' })),
      ),
      theme: { accent: '#1DB954' },
    },
    initial: () => ({ title: 'Kesariya', artist: 'Arijit Singh', progress: 0.1, playIcon: 'pause' }),
    story: [[3000, { progress: 0.22 }], [3000, { progress: 0.34 }]],
    handle: (action, s) => (action === 'toggle' ? { playIcon: s.playIcon === 'pause' ? 'play' : 'pause' }
      : action === 'next' ? { title: 'Apna Bana Le', artist: 'Arijit Singh', progress: 0 }
        : action === 'previous' ? { title: 'Kesariya', artist: 'Arijit Singh', progress: 0 } : undefined),
  },
  {
    id: 'indigo',
    group: 'Travel',
    title: 'IndiGo',
    about: 'Gate, boarding time, the flight arc',
    color: '#5E8BFF',
    glyph: 'airplane-tilt',
    template: {
      compact: {
        leading: glyph('airplane-tilt', '#5E8BFF', 18),
        trailing: row({ gap: 6, align: 'baseline' }, text('{gate}', { size: 15, weight: 'semibold', color: '#5E8BFF' }), timer('{boardAt}', { style: { size: 16, weight: 'semibold' } })),
      },
      expanded: column({ gap: 10 },
        row({ justify: 'between', align: 'end' },
          column({ gap: 0 }, text('BLR', { size: 26, weight: 'semibold' }), text('Bengaluru', { size: 12, color: GREY })),
          column({ gap: 0, align: 'center' }, text('6E 2134', { size: 12, color: GREY }), text('Gate {gate}', { size: 15, weight: 'semibold', color: '#5E8BFF' })),
          column({ gap: 0, align: 'end' }, text('DEL', { size: 26, weight: 'semibold' }), text('New Delhi', { size: 12, color: GREY }))),
        arc('{progress}', { height: 36, colors: ['#5E8BFF', '#5E8BFF'], thickness: 3, marker: 'airplane-tilt', markerSize: 18 }),
        row({ justify: 'between', align: 'baseline' },
          text('{status}', { size: 14, color: GREY }),
          timer('{boardAt}', { style: { size: 20, weight: 'semibold' } })),
      ),
      theme: { accent: '#5E8BFF' },
    },
    initial: () => ({ gate: 'G24', status: 'Boarding in', boardAt: Date.now() + 38 * MIN, progress: 0.18 }),
    story: [
      [3000, { gate: 'G27', status: 'Gate changed · boarding in' }, true],
      [3500, () => ({ status: 'Boarding now', boardAt: Date.now() + MIN, progress: 0.35 }), true],
    ],
  },
  {
    id: 'gold',
    group: 'Money',
    title: 'Buy gold',
    about: 'Pick an amount, confirm, done',
    color: '#FFD60A',
    glyph: 'coins',
    template: {
      compact: { leading: glyph('coins', '#FFD60A', 18), trailing: text('₹{price}', { size: 15, weight: 'semibold', mono: true, color: '#FFD60A' }) },
      expanded: column({ gap: 14 },
        row({ gap: 12 },
          column({ gap: 1, grow: true },
            text('24K gold', { size: 16, weight: 'semibold' }),
            row({ gap: 6 }, text('per gram', { size: 13, color: GREY }), text('▲ {change}', { size: 13, weight: 'semibold', color: '#30D158' }))),
          text('₹{price}', { size: 26, weight: 'semibold', mono: true })),
        line('{trend}', { height: 34, color: '#FFD60A' }),
        chips('amount', ['₹100', '₹500', '₹1,000'], { values: ['100', '500', '1000'], color: '#FFD60A' }),
        row({ gap: 10 }, wide(button('go:done', 'Buy ₹{amount}', { color: '#FFD60A', textColor: '#2A1E00', confirm: 'Pay ₹{amount}?' }))),
      ),
      screens: {
        done: column({ gap: 8, align: 'center' },
          lottie('lottie:checkmark', { size: 64, loop: false }),
          text('₹{amount} of gold is yours', { size: 18, weight: 'semibold', align: 'center' }),
          text('{grams} g added to your vault', { size: 13, color: GREY, align: 'center' }),
          row({ gap: 10 }, wide(button('back', 'Done', { color: '#FFFFFF', tint: true })))),
      },
      theme: { accent: '#FFD60A' },
    },
    initial: () => ({ price: '7,416', change: '1.9%', amount: '500', trend: '0.2,0.25,0.22,0.35,0.4,0.38,0.5,0.55,0.52,0.65,0.7,0.78' }),
    story: [[2200, { price: '7,421', trend: '0.2,0.25,0.22,0.35,0.4,0.38,0.5,0.55,0.52,0.65,0.7,0.78,0.82' }]],
    handle: (action, s) => (action === 'go:done' ? { grams: (Number(s.amount) / 7416).toFixed(3) } : undefined),
  },
  {
    id: 'upi',
    group: 'Money',
    title: 'UPI sent',
    about: 'A payment, in and out',
    color: '#30D158',
    glyph: 'check',
    toast: true,
    template: {
      compact: { leading: glyph('check', '#30D158', 18), trailing: text('₹{amount}', { size: 16, weight: 'semibold', mono: true }) },
      expanded: row({ gap: 12 },
        label('Paid {payee}', 'UPI ref {ref}'),
        hero('₹{amount}', '', '#30D158', 26)),
      theme: { accent: '#30D158' },
    },
    initial: () => ({ amount: '2,499', payee: 'Asha’s Cafe', ref: '4031 2291' }),
    story: [],
  },
  // endregion

  // region Games
  {
    id: 'clan',
    group: 'Games',
    title: 'Clan raid',
    about: 'Troops training, then raid',
    color: '#FFB020',
    glyph: 'sword',
    template: {
      compact: {
        leading: glyph('{mark}', '#FFB020', 18),
        trailing: column({ gap: 0 },
          when('!ready', timer('{readyAt}', { style: { size: 16, weight: 'semibold', color: '#FFB020' } })),
          when('ready', text('Ready', { size: 15, weight: 'semibold', color: '#FFB020' }))),
      },
      expanded: column({ gap: 14 },
        row({ gap: 12 },
          label('{headline}', '{troops} of 320 troops · shield {shield}'),
          when('!ready', timer('{readyAt}', { style: { size: 22, weight: 'semibold', color: '#FFB020' } }))),
        bar('{army}', { height: 4, color: '#FFB020', track: FILL }),
        when('ready', row({ gap: 10 }, wide(button('raid', 'Raid', { icon: 'sword', color: '#FFB020', textColor: '#2A1700', confirm: 'Attack now?' })))),
      ),
      theme: { accent: '#FFB020' },
    },
    initial: () => ({ headline: 'Dragons training', mark: 'shield', readyAt: Date.now() + 18 * MIN, army: 0.72, troops: 230, shield: '2h' }),
    story: [
      [600, () => ({ readyAt: Date.now() + 8_000 })],
      [3000, { army: 0.86, troops: 276 }],
      [5200, { army: 1, troops: 320, ready: true, headline: 'Army ready', mark: 'crown' }, true],
    ],
    handle: (action) => (action === 'raid' ? { headline: 'Three stars · +1,240 gold', mark: 'trophy', ready: false, readyAt: Date.now() + 30 * MIN, army: 0.1, troops: 32 } : undefined),
  },
  // endregion
];

const QUIZ = [
  { question: 'Which organelle makes ATP?', a: 'Nucleus', b: 'Mitochondria', c: 'Ribosome', right: 'b' },
  { question: 'What carries oxygen in blood?', a: 'Haemoglobin', b: 'Insulin', c: 'Keratin', right: 'a' },
  { question: 'Photosynthesis happens in…', a: 'Chloroplasts', b: 'Vacuoles', c: 'Lysosomes', right: 'a' },
];

export const groups: Group[] = ['Daily', 'EdTech', 'Work', 'Health', 'Focus', 'Money', 'Sport', 'Travel', 'Games'];
