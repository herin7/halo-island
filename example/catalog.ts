/**
 * Every live activity in the showcase: template + first state + a story of timed updates + what
 * its buttons do. Plain data over the `halo-island` builders, shared by the app and the website.
 * Design rules: docs/design/brief.md.
 */
import {
  IslandNode, IslandState, IslandTemplate,
  arc, bar, bars, button, chips, column, fx, image, line, lottie, pet, ring, row, stack, steps, svg, text, timeline, timer, track, when,
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
  /** Brand color: card light and the island's aura. */
  color: string;
  /** The 3D object that stands for it on cards. */
  hero: string;
  template: IslandTemplate;
  initial: () => IslandState;
  story: Beat[];
  /** What the island's buttons and inputs do: return a state patch (or nothing). */
  handle?: (action: string, state: IslandState) => IslandState | void;
  /** A moment, not an activity: shown in-app and dismissed. */
  toast?: boolean;
}

const GREY = '#8E8E93';
const MIN = 60_000;

// region Building blocks

/** A 3D object (registered in media.ts). */
const obj = (name: string, size = 26) => image(name, { size, radius: 0, fit: 'contain' });
/** Hero number with a small unit on one baseline. */
const hero = (value: string, unit: string, color: string, size = 46) =>
  row({ align: 'baseline', gap: 4 }, text(value, { size, weight: 'heavy', color, mono: true }), text(unit, { size: Math.round(size * 0.36), weight: 'bold', color }));
/** Compact trailing: a number and its unit. */
const tail = (value: string, unit: string, color: string) =>
  row({ align: 'baseline', gap: 2 }, text(value, { size: 17, weight: 'heavy', color, mono: true }), text(unit, { size: 11, weight: 'bold', color }));
/** Title over a muted line, right-aligned by default. */
const label = (title: string, sub: string, align: 'start' | 'end' = 'end') =>
  column({ gap: 2, align }, text(title, { size: 15, weight: 'bold', align }), text(sub, { size: 13, color: GREY, align }));
/** A button sharing its row's width with its siblings. */
const wide = (node: IslandNode) => column({ grow: true }, node);
const round = (node: IslandNode) => column({ width: 44 }, node);
const theme = (accent: string, extra?: IslandTemplate['theme']) => ({ accent, aura: accent, ...extra });

/** Claude Code's mark, drawn as an eight-spoke burst. */
const BURST = 'M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3L5.3 18.7';

// endregion

export const scenarios: Scenario[] = [
  // region Daily
  {
    id: 'swiggy',
    group: 'Daily',
    title: 'Swiggy',
    about: 'A scooter rides your order home',
    color: '#FC8019',
    hero: 'scooter',
    template: {
      compact: { leading: obj('{vehicle}', 26), trailing: tail('{eta}', 'min', '#FC8019') },
      expanded: column({ gap: 14 },
        row({ justify: 'between', align: 'end' }, hero('{eta}', 'min', '#FC8019'), label('{status}', '{items}')),
        track('{progress}', 'scooter', { end: 'house', flip: true, markerSize: 34, height: 6, color: '#FC8019' }),
        when('rider', row({ gap: 10 },
          wide(button('call', 'Call {rider}', { icon: 'phone', color: '#FC8019', tint: true })),
          round(button('chat', undefined, { icon: 'chat', color: '#FC8019', tint: true })))),
        when('delivered', row({ gap: 10 }, wide(button('rate', 'Rate Meghana Foods', { icon: 'star', color: '#FC8019', tint: true })))),
      ),
      theme: theme('#FC8019'),
    },
    initial: () => ({ status: 'Order confirmed', items: 'Meghana Foods · 2 items', eta: 32, progress: 0.04, vehicle: 'steaming-bowl' }),
    story: [
      [2400, { status: 'Packing your biryani', eta: 26, progress: 0.18 }],
      [2600, { status: 'Ravi picked it up', eta: 18, progress: 0.38, rider: 'Ravi', vehicle: 'scooter' }, true],
      [2600, { status: 'Ravi is 2 km away', eta: 9, progress: 0.66 }],
      [2600, { status: 'Almost there', eta: 3, progress: 0.9 }],
      [2600, { status: 'Delivered. Enjoy!', eta: 0, progress: 1, rider: '', delivered: true, vehicle: 'house' }, true],
    ],
    handle: (action) => (action === 'rate' ? { status: 'Thanks for rating ★★★★★', delivered: false } : undefined),
  },
  {
    id: 'uber',
    group: 'Daily',
    title: 'Uber',
    about: 'PIN, plate and your car closing in',
    color: '#FFFFFF',
    hero: 'oncoming-automobile',
    template: {
      compact: { leading: obj('oncoming-automobile', 24), trailing: text('{etaLabel}', { size: 17, weight: 'heavy', mono: true }) },
      expanded: column({ gap: 14 },
        row({ justify: 'between', align: 'start' },
          column({ gap: 3, grow: true }, text('{status}', { size: 22, weight: 'heavy' }), text('{car} · {plate}', { size: 13, color: GREY })),
          when('pin', column({ background: '#FFFFFF', radius: 14, padding: 8, gap: 0, align: 'center', width: 64 },
            text('PIN', { size: 10, weight: 'heavy', color: '#000000' }), text('{pin}', { size: 20, weight: 'heavy', color: '#000000', mono: true })))),
        track('{progress}', 'automobile', { end: 'location', flip: true, markerSize: 32, height: 6, color: '#FFFFFF', track: '#2C2C2E' }),
        when('driver', row({ gap: 10 },
          wide(button('call', 'Call {driver}', { icon: 'phone', color: '#FFFFFF', textColor: '#000000' })),
          round(button('chat', undefined, { icon: 'chat', color: '#FFFFFF', tint: true })),
          round(button('sos', undefined, { icon: 'shield', color: '#FF453A', tint: true })))),
      ),
      theme: theme('#FFFFFF', { aura: '#5E8BFF' }),
    },
    initial: () => ({ status: 'Finding your ride', car: 'Uber Go', plate: 'Matching nearby drivers', etaLabel: '…', progress: 0 }),
    story: [
      [2400, { status: 'Pickup in 6 min', car: 'Swift Dzire · White', plate: 'KA 01 AB 1234', driver: 'Asha', pin: '4821', etaLabel: '6 min', progress: 0.2 }, true],
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
    about: 'Keep the streak alive, owl watching',
    color: '#58CC02',
    hero: 'owl',
    template: {
      compact: { leading: row({ gap: 4 }, lottie('lottie:fire-streak', { size: 24 })), trailing: tail('{streak}', 'days', '#FF9600') },
      expanded: column({ gap: 14 },
        row({ gap: 14 },
          stack(ring('{goal}', { size: 68, thickness: 6, color: '#58CC02' }), obj('owl', 40)),
          column({ gap: 4, grow: true },
            text('Spanish · Lesson {lesson} of 5', { size: 15, weight: 'bold' }),
            row({ align: 'baseline', gap: 4 }, text('{xp}', { size: 30, weight: 'heavy', mono: true, color: '#58CC02' }), text('XP today', { size: 13, weight: 'bold', color: GREY })),
            steps('{lesson}', 5, { height: 6, color: '#58CC02' }))),
        row({ gap: 10 }, wide(button('practice', '{cta}', { icon: 'bolt', color: '#58CC02', textColor: '#0B2400' }))),
      ),
      theme: theme('#58CC02'),
    },
    initial: () => ({ streak: 41, lesson: 2, xp: 30, goal: 0.4, cta: 'Continue lesson 3' }),
    story: [
      [2500, { lesson: 3, xp: 45, goal: 0.6, cta: 'Continue lesson 4' }],
      [2500, { lesson: 4, xp: 60, goal: 0.8, cta: 'One more to save the streak' }, true],
    ],
    handle: (action, s) => {
      if (action !== 'practice') return;
      const lesson = Math.min(5, Number(s.lesson) + 1);
      return lesson === 5
        ? { lesson, xp: Number(s.xp) + 20, goal: 1, streak: Number(s.streak) + 1, cta: 'Streak saved! See you tomorrow' }
        : { lesson, xp: Number(s.xp) + 15, goal: lesson / 5, cta: `Continue lesson ${lesson + 1}` };
    },
  },
  {
    id: 'class',
    group: 'EdTech',
    title: 'Live class',
    about: 'Countdown, then LIVE — join from the island',
    color: '#FF6B3D',
    hero: 'woman-teacher',
    template: {
      compact: {
        leading: obj('woman-teacher', 26),
        trailing: column({ gap: 0 }, when('!live', timer('{startsAt}', { style: { size: 17, weight: 'heavy', color: '#FF6B3D' } })), when('live', fx(text('LIVE', { size: 15, weight: 'heavy', color: '#FF453A' }), 'shimmer'))),
      },
      expanded: column({ gap: 14 },
        row({ gap: 12 },
          column({ gap: 3, grow: true }, text('Physics · Rotational Motion', { size: 17, weight: 'heavy' }), text('Neha ma\'am · {waiting} waiting', { size: 13, color: GREY })),
          when('live', fx(row({ gap: 6, background: '#FF453A', radius: 10, padding: 6 }, text('● LIVE', { size: 12, weight: 'heavy', color: '#FFFFFF' })), 'pulse'))),
        when('!live', row({ align: 'baseline', gap: 8 }, text('Starts in', { size: 13, weight: 'bold', color: GREY }), timer('{startsAt}', { style: { size: 40, weight: 'heavy', color: '#FF6B3D' } }))),
        row({ gap: 10 },
          wide(button('join', '{cta}', { icon: 'eye', color: '#FF6B3D', textColor: '#1E0A00' })),
          round(button('remind', undefined, { icon: 'bell', color: '#FF6B3D', tint: true }))),
      ),
      theme: theme('#FF6B3D'),
    },
    initial: () => ({ startsAt: Date.now() + 9_000, waiting: '12.4k', live: false, cta: 'Join when it starts' }),
    story: [
      [3000, (s) => ({ waiting: '13.1k' })],
      [6500, { live: true, waiting: '14.2k', cta: 'Join the live class' }, true],
    ],
  },
  {
    id: 'quiz',
    group: 'EdTech',
    title: 'Flashcard quiz',
    about: 'Answer in the island; the pet reacts',
    color: '#8B7CFF',
    hero: 'brain',
    template: {
      compact: { leading: pet('{mood}', { size: 22 }), trailing: tail('{score}', '/{total}', '#8B7CFF') },
      expanded: column({ gap: 14 },
        column({ gap: 4 },
          text('Q{q} · Biology', { size: 12, weight: 'heavy', color: '#8B7CFF' }),
          text('{question}', { size: 19, weight: 'heavy', lines: 2 })),
        chips('answer', ['{a}', '{b}', '{c}'], { values: ['a', 'b', 'c'], color: '#8B7CFF' }),
        when('verdict', text('{verdict}', { size: 14, weight: 'bold', color: '{verdictColor}' })),
        row({ gap: 10 }, wide(button('check', '{cta}', { color: '#8B7CFF', textColor: '#FFFFFF' }))),
      ),
      theme: theme('#8B7CFF'),
    },
    initial: () => ({ ...QUIZ[0], q: 1, score: 0, total: QUIZ.length, mood: 'idle', cta: 'Check', answer: '' }),
    story: [],
    handle: (action, s) => {
      if (action === 'change:answer') return { mood: 'thinking', verdict: '' };
      if (action !== 'check') return;
      const i = Number(s.q) - 1;
      if (s.cta === 'Next') {
        const next = QUIZ[i + 1];
        return next ? { ...next, q: i + 2, mood: 'idle', verdict: '', cta: 'Check', answer: '' } : { mood: 'love', verdict: `Done! ${s.score}/${s.total}`, verdictColor: '#8B7CFF', cta: 'Restart', q: 0 };
      }
      if (s.cta === 'Restart') return { ...QUIZ[0], q: 1, score: 0, mood: 'idle', verdict: '', cta: 'Check', answer: '' };
      if (!s.answer) return { mood: 'surprised', verdict: 'Pick an answer first', verdictColor: GREY };
      const right = s.answer === QUIZ[i].right;
      return { mood: right ? 'happy' : 'sad', score: Number(s.score) + (right ? 1 : 0), verdict: right ? 'Correct! +10 XP' : `Not quite — it's ${QUIZ[i][QUIZ[i].right as 'a']}`, verdictColor: right ? '#30D158' : '#FF6961', cta: 'Next' };
    },
  },
  // endregion

  // region Work
  {
    id: 'claude',
    group: 'Work',
    title: 'Claude Code',
    about: 'Usage limits, resets, approve tool calls',
    color: '#D97757',
    hero: 'technologist',
    template: {
      compact: { leading: svg(BURST, { size: 20, color: '#D97757', stroke: 2.6 }), trailing: tail('{session}', '%', '#D97757') },
      expanded: column({ gap: 14 },
        row({ gap: 14 },
          stack(ring('{sessionP}', { size: 62, thickness: 6, color: '#D97757' }), text('{session}%', { size: 15, weight: 'heavy', mono: true })),
          column({ gap: 3, grow: true },
            text('Session usage', { size: 13, weight: 'bold', color: GREY }),
            row({ align: 'baseline', gap: 6 }, text('Resets in', { size: 15, weight: 'bold' }), timer('{resetsAt}', { style: { size: 22, weight: 'heavy', color: '#D97757' } })),
            row({ gap: 8 }, bar('{weekP}', { height: 5, color: '#D97757' }), text('week {week}%', { size: 12, weight: 'bold', color: GREY, mono: true })))),
        when('!pending', row({ gap: 10, background: '#1C1C1E', radius: 16, padding: 12 },
          lottie('lottie:typing-dots', { size: 22, width: 34 }),
          text('{task}', { size: 14, weight: 'semibold', lines: 1 }))),
        when('pending', column({ gap: 10 },
          column({ gap: 4, background: '#1C1C1E', radius: 16, padding: 12 },
            text('Claude wants to run', { size: 12, weight: 'bold', color: GREY }),
            text('{tool}', { size: 15, weight: 'bold', font: 'monospace' })),
          row({ gap: 10 },
            wide(button('deny', 'Deny', { color: '#FFFFFF', tint: true })),
            wide(button('allow', 'Allow', { icon: 'check', color: '#D97757', textColor: '#1A0B05', confirm: 'Run it?' }))))),
      ),
      theme: theme('#D97757'),
    },
    initial: () => ({ session: 41, sessionP: 0.41, week: 23, weekP: 0.23, resetsAt: Date.now() + 2 * 60 * MIN + 14 * MIN, task: 'Reading packages/halo-island/src/host.tsx', pending: false }),
    story: [
      [2400, { task: 'Editing host.tsx — rolling digits', session: 48, sessionP: 0.48 }],
      [2600, { task: 'Running bun test (14 tests)', session: 55, sessionP: 0.55, week: 25, weekP: 0.25 }],
      [2600, { pending: true, tool: 'git push origin v2-living-island' }, true],
    ],
    handle: (action, s) => {
      if (action === 'allow') return { pending: false, task: 'Pushed v2-living-island ✓', session: Number(s.session) + 3, sessionP: (Number(s.session) + 3) / 100 };
      if (action === 'deny') return { pending: false, task: 'Waiting for your next prompt' };
    },
  },
  {
    id: 'codex',
    group: 'Work',
    title: 'Codex credits',
    about: 'Credits left, burn by day, low warning',
    color: '#10A37F',
    hero: 'robot',
    template: {
      compact: { leading: obj('robot', 24), trailing: tail('{credits}', 'cr', '{tone}') },
      expanded: column({ gap: 14 },
        row({ justify: 'between', align: 'end' },
          hero('{credits}', 'credits left', '{tone}', 40),
          label('Pro plan', 'renews in {renews} days')),
        bars('{daily}', { height: 40, gap: 5, color: '#10A37F', active: '{today}' }),
        row({ justify: 'between' }, text('Mon', { size: 11, color: GREY, weight: 'bold' }), text('Today', { size: 11, color: GREY, weight: 'bold' })),
        when('low', row({ gap: 10 }, wide(button('topup', 'Top up 500 credits', { icon: 'bolt', color: '#10A37F', confirm: 'Pay $20?' })))),
      ),
      theme: theme('#10A37F'),
    },
    initial: () => ({ credits: 1240, tone: '#10A37F', renews: 6, daily: '0.3,0.5,0.8,0.4,0.6,0.2,0.1', today: 6 }),
    story: [
      [2400, { credits: 980, daily: '0.3,0.5,0.8,0.4,0.6,0.5,0.1' }],
      [2400, { credits: 410, daily: '0.3,0.5,0.8,0.4,0.6,0.9,0.1' }],
      [2400, { credits: 120, tone: '#FF9F0A', low: true, daily: '0.3,0.5,0.8,0.4,0.6,1,0.1' }, true],
    ],
    handle: (action) => (action === 'topup' ? { credits: 620, tone: '#10A37F', low: false } : undefined),
  },
  {
    id: 'deploy',
    group: 'Work',
    title: 'Deploy',
    about: 'Build → test → ship, rocket on green',
    color: '#7EE787',
    hero: 'rocket',
    template: {
      compact: { leading: obj('{icon}', 24), trailing: text('{short}', { size: 15, weight: 'heavy', color: '#7EE787' }) },
      expanded: column({ gap: 14 },
        row({ justify: 'between', align: 'end' },
          column({ gap: 3 }, text('halo-island-web', { size: 17, weight: 'heavy' }), text('main · {sha}', { size: 13, color: GREY, font: 'monospace' })),
          text('{elapsed}', { size: 28, weight: 'heavy', mono: true, color: '#7EE787' })),
        timeline('{stage}', ['tune', 'check', 'send'], { color: '#7EE787', ink: '#002A0B', size: 32 }),
        row({ justify: 'between' }, text('Build', { size: 12, weight: 'bold', color: GREY }), text('Test', { size: 12, weight: 'bold', color: GREY }), text('Deploy', { size: 12, weight: 'bold', color: GREY })),
        when('live', row({ gap: 10 }, wide(button('open', 'Open preview', { icon: 'forward', color: '#7EE787', tint: true })))),
      ),
      theme: theme('#7EE787'),
    },
    initial: () => ({ sha: 'ec720aa', stage: 0.5, elapsed: '0:12', short: 'Build', icon: 'gear' }),
    story: [
      [2200, { stage: 1.5, elapsed: '0:41', short: 'Test' }],
      [2400, { stage: 2.5, elapsed: '1:08', short: 'Ship' }],
      [2400, { stage: 3, elapsed: '1:19', short: 'Live', live: true, icon: 'rocket' }, true],
    ],
  },
  // endregion

  // region Health & focus
  {
    id: 'mumma',
    group: 'Health',
    title: 'Mumma',
    about: 'Water and meals for kids, from mom',
    color: '#4FC3F7',
    hero: 'woman',
    template: {
      compact: { leading: obj('woman', 26), trailing: row({ gap: 4 }, obj('droplet', 16), tail('{glasses}', '/8', '#4FC3F7')) },
      expanded: column({ gap: 14 },
        row({ gap: 14 },
          stack(ring('{water}', { size: 68, thickness: 7, color: '#4FC3F7' }), obj('droplet', 34)),
          column({ gap: 3, grow: true },
            text('{line}', { size: 17, weight: 'heavy', lines: 2 }),
            text('{glasses} of 8 glasses · {meals} of 4 meals', { size: 13, color: GREY }))),
        chips('meal', ['Breakfast', 'Lunch', 'Snack', 'Dinner'], { color: '#FFB74D' }),
        row({ gap: 10 },
          wide(button('glass', 'Drank a glass', { icon: 'plus', color: '#4FC3F7', textColor: '#00202E' })),
          wide(button('ate', 'Ate it', { icon: 'check', color: '#FFB74D', tint: true }))),
      ),
      theme: theme('#4FC3F7'),
    },
    initial: () => ({ line: 'Paani pi lo, beta!', glasses: 3, water: 3 / 8, meals: 1, meal: 'Lunch' }),
    story: [
      [3500, { line: 'Lunch time — what did you eat?' }, true],
    ],
    handle: (action, s) => {
      if (action === 'glass') {
        const glasses = Math.min(8, Number(s.glasses) + 1);
        return { glasses, water: glasses / 8, line: glasses === 8 ? 'All 8! Shabaash! 🎉' : glasses >= 6 ? 'Almost there, beta' : 'Good! One more soon' };
      }
      if (action === 'ate') return { meals: Math.min(4, Number(s.meals) + 1), line: `${s.meal} done. Proud of you!` };
    },
  },
  {
    id: 'meds',
    group: 'Health',
    title: 'Medicine',
    about: 'Take or snooze, right from the island',
    color: '#FF6FA8',
    hero: 'pill',
    template: {
      compact: { leading: obj('pill', 24), trailing: text('{when}', { size: 15, weight: 'heavy', color: '#FF6FA8' }) },
      expanded: column({ gap: 14 },
        row({ gap: 14 }, obj('pill', 52),
          column({ gap: 3, grow: true }, text('{name}', { size: 19, weight: 'heavy' }), text('{dose}', { size: 13, color: GREY }), steps('{taken}', 3, { height: 5, color: '#FF6FA8' }))),
        row({ gap: 10 },
          wide(button('snooze', 'Snooze 10 min', { icon: 'timer', color: '#FFFFFF', tint: true })),
          wide(button('take', 'Taken', { icon: 'check', color: '#FF6FA8', textColor: '#2A0013' }))),
      ),
      theme: theme('#FF6FA8'),
    },
    initial: () => ({ name: 'Vitamin D3', dose: '1 capsule · after lunch', when: 'Now', taken: 1 }),
    story: [],
    handle: (action, s) => (action === 'take' ? { taken: Number(s.taken) + 1, when: 'Done', dose: 'Next: Omega-3 at 9 pm' } : action === 'snooze' ? { when: '10 min' } : undefined),
  },
  {
    id: 'focus',
    group: 'Focus',
    title: 'Focus',
    about: 'Pomodoro with a pet that naps on breaks',
    color: '#FF7A59',
    hero: 'alarm-clock',
    template: {
      compact: { leading: pet('{mood}', { size: 22 }), trailing: timer('{endsAt}', { style: { size: 17, weight: 'heavy', color: '#FF7A59' } }) },
      expanded: column({ gap: 12, align: 'center' },
        pet('{mood}', { size: 44 }),
        timer('{endsAt}', { style: { size: 52, weight: 'heavy', align: 'center' } }),
        text('{phase} · round {round} of 4', { size: 13, weight: 'bold', color: GREY, align: 'center' }),
        row({ gap: 10 },
          wide(button('skip', 'Skip', { icon: 'next', color: '#FFFFFF', tint: true })),
          wide(button('stop', 'End', { icon: 'stop', color: '#FF7A59', tint: true, confirm: 'End session?' }))),
      ),
      theme: theme('#FF7A59'),
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
    about: 'Score, run rate, confetti on a six',
    color: '#FF9F0A',
    hero: 'cricket',
    template: {
      compact: {
        leading: row({ gap: 6 }, obj('cricket', 22), fx(text('LIVE', { size: 13, weight: 'heavy', color: '#FF453A' }), 'shimmer')),
        trailing: text('{runs}/{wkts}', { size: 17, weight: 'heavy', mono: true }),
      },
      expanded: column({ gap: 12 },
        row({ justify: 'between', align: 'end' },
          hero('{runs}/{wkts}', '{overs} ov', '#FFFFFF', 46),
          stack(label('CRR {crr}', '{batter}'), when('six', lottie('lottie:confetti', { size: 90, loop: false })))),
        bars('{perOver}', { active: '{over}', color: '#FF9F0A', height: 44, gap: 4 }),
      ),
      theme: theme('#FF9F0A'),
    },
    initial: () => ({ runs: 92, wkts: 1, overs: '8.5', over: 9, crr: '10.42', batter: 'Rohit 42 (30)', perOver: '0.4,0.7,0.3,0.9,0.5,0.6,1,0.8,0.5,0,0,0,0,0,0,0,0,0,0,0' }),
    story: [
      [2400, { runs: 98, overs: '8.6', batter: 'Rohit 48 (31) · SIX!', six: true, perOver: '0.4,0.7,0.3,0.9,0.5,0.6,1,0.8,0.9,0,0,0,0,0,0,0,0,0,0,0' }, true],
      [2600, { runs: 99, overs: '9.1', over: 10, six: false, batter: 'Rohit 49 (32)', perOver: '0.4,0.7,0.3,0.9,0.5,0.6,1,0.8,0.9,0.1,0,0,0,0,0,0,0,0,0,0' }],
      [2400, { runs: 103, overs: '9.2', crr: '11.03', batter: 'Rohit 53 (33) · 50!', perOver: '0.4,0.7,0.3,0.9,0.5,0.6,1,0.8,0.9,0.5,0,0,0,0,0,0,0,0,0,0' }],
    ],
  },
  {
    id: 'spotify',
    group: 'Sport',
    title: 'Spotify',
    about: 'Artwork light, live waveform, scrub',
    color: '#1DB954',
    hero: 'headphone',
    template: {
      compact: {
        leading: image('https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=70', { size: 24, radius: 7 }),
        trailing: column({ width: 30, gap: 0 }, bars('0.5,0.9,0.6,1,0.4', { height: 16, gap: 2, color: '#1DB954', animate: true })),
      },
      expanded: column({ gap: 14 },
        row({ gap: 14 },
          image('https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=70', { size: 64, radius: 14, glow: true }),
          column({ gap: 3, grow: true }, text('{title}', { size: 19, weight: 'heavy' }), text('{artist}', { size: 14, color: GREY })),
          svg(brand.spotify, { size: 22, color: '#1DB954' })),
        bar('{progress}', { color: '#FFFFFF', track: '#3A3A3C', height: 4 }),
        row({ justify: 'center', gap: 22 },
          button('previous', undefined, { icon: 'previous', color: '#000000', textColor: '#FFFFFF', shape: 'circle' }),
          button('toggle', undefined, { icon: '{playIcon}', color: '#FFFFFF', textColor: '#000000', shape: 'circle' }),
          button('next', undefined, { icon: 'next', color: '#000000', textColor: '#FFFFFF', shape: 'circle' })),
      ),
      theme: theme('#1DB954'),
    },
    initial: () => ({ title: 'Kesariya', artist: 'Arijit Singh · Brahmastra', progress: 0.1, playIcon: 'pause' }),
    story: [[3000, { progress: 0.22 }], [3000, { progress: 0.34 }]],
    handle: (action, s) => (action === 'toggle' ? { playIcon: s.playIcon === 'pause' ? 'play' : 'pause' }
      : action === 'next' ? { title: 'Apna Bana Le', artist: 'Arijit Singh · Bhediya', progress: 0 }
        : action === 'previous' ? { title: 'Kesariya', artist: 'Arijit Singh · Brahmastra', progress: 0 } : undefined),
  },
  {
    id: 'indigo',
    group: 'Travel',
    title: 'IndiGo',
    about: 'A plane rides the arc to boarding',
    color: '#7B93FF',
    hero: 'airplane',
    template: {
      compact: { leading: obj('airplane', 22), trailing: row({ gap: 6, align: 'baseline' }, text('{gate}', { size: 15, weight: 'heavy', color: '#7B93FF' }), timer('{boardAt}', { style: { size: 17, weight: 'heavy' } })) },
      expanded: column({ gap: 4 },
        row({ justify: 'between' }, text('BLR', { size: 15, weight: 'heavy', color: GREY }), text('6E 2134', { size: 13, weight: 'bold', color: GREY }), text('DEL', { size: 15, weight: 'heavy', color: GREY })),
        arc('{progress}', { height: 56, colors: ['#3A5BFF', '#7B93FF', '#C9B8FF'], thickness: 5, marker: 'airplane', markerSize: 30 }),
        column({ gap: 2, align: 'center' },
          timer('{boardAt}', { style: { size: 42, weight: 'heavy', align: 'center' } }),
          text('{status}', { size: 14, weight: 'semibold', color: GREY, align: 'center' })),
      ),
      theme: theme('#7B93FF'),
    },
    initial: () => ({ gate: 'G24', status: 'Boarding at gate G24', boardAt: Date.now() + 38 * MIN, progress: 0.18 }),
    story: [
      [3000, { gate: 'G27', status: 'Gate changed to G27' }, true],
      [3500, () => ({ status: 'Boarding now · G27', boardAt: Date.now() + MIN, progress: 0.35 }), true],
    ],
  },
  {
    id: 'gold',
    group: 'Money',
    title: 'Buy gold',
    about: 'Pick an amount, confirm, done',
    color: '#FFC83D',
    hero: 'coin',
    template: {
      compact: { leading: obj('coin', 22), trailing: text('₹{price}', { size: 15, weight: 'heavy', mono: true, color: '#FFC83D' }) },
      expanded: column({ gap: 12 },
        row({ justify: 'between', align: 'end' },
          column({ gap: 2 }, text('24K gold · per gram', { size: 12, weight: 'bold', color: GREY }), text('₹{price}', { size: 30, weight: 'heavy', mono: true })),
          text('▲ {change}', { size: 14, weight: 'heavy', color: '#30D158' })),
        line('{trend}', { height: 38, color: '#FFC83D' }),
        chips('amount', ['₹100', '₹500', '₹1000'], { values: ['100', '500', '1000'], color: '#FFC83D' }),
        row({ gap: 10 }, wide(button('buy', 'Buy ₹{amount}', { icon: 'bolt', color: '#FFC83D', textColor: '#2A1E00', confirm: 'Pay ₹{amount}?' }))),
      ),
      screens: {
        done: column({ gap: 10, align: 'center' },
          lottie('lottie:checkmark', { size: 72, loop: false }),
          text('₹{amount} of gold is yours', { size: 19, weight: 'heavy', align: 'center' }),
          text('{grams} g added to your vault', { size: 13, color: GREY, align: 'center' }),
          row({ gap: 10 }, wide(button('back', 'Done', { color: '#FFFFFF', tint: true })))),
      },
      theme: theme('#FFC83D'),
    },
    initial: () => ({ price: '7,416', change: '1.9%', amount: '500', trend: '0.2,0.25,0.22,0.35,0.4,0.38,0.5,0.55,0.52,0.65,0.7,0.78' }),
    story: [[2200, { price: '7,421', trend: '0.2,0.25,0.22,0.35,0.4,0.38,0.5,0.55,0.52,0.65,0.7,0.78,0.82' }]],
    handle: (action, s) => (action === 'buy' ? { grams: (Number(s.amount) / 7416).toFixed(3) } : undefined),
  },
  {
    id: 'upi',
    group: 'Money',
    title: 'UPI sent',
    about: 'A payment, in and out',
    color: '#A475F2',
    hero: 'money-wings',
    toast: true,
    template: {
      compact: { leading: obj('money-wings', 24), trailing: text('₹{amount}', { size: 17, weight: 'heavy', mono: true }) },
      expanded: row({ gap: 12 },
        lottie('lottie:coins-falling', { size: 56, loop: false }),
        column({ gap: 3, grow: true }, hero('₹{amount}', 'sent', '#FFFFFF', 34), text('to {payee} · UPI {ref}', { size: 13, color: GREY }))),
      theme: theme('#A475F2'),
    },
    initial: () => ({ amount: '2,499', payee: "Asha's Cafe", ref: '4031 2291' }),
    story: [],
  },
  // endregion

  // region Games
  {
    id: 'clan',
    group: 'Games',
    title: 'Clan raid',
    about: 'Troops training, then Raid!',
    color: '#FFB020',
    hero: 'crossed-swords',
    template: {
      compact: {
        leading: obj('dragon', 26),
        trailing: column({ gap: 0 }, when('!ready', timer('{readyAt}', { style: { size: 17, weight: 'heavy', color: '#FFB020' } })), when('ready', text('Ready!', { size: 15, weight: 'heavy', color: '#FFB020' }))),
      },
      expanded: column({ gap: 12 },
        row({ gap: 12 },
          fx(obj('dragon', 56), 'bounce'),
          column({ gap: 4, grow: true },
            text('{headline}', { size: 18, weight: 'heavy' }),
            row({ gap: 6 }, bar('{army}', { height: 7, color: '#FFB020' }), text('{troops}/320', { size: 12, weight: 'heavy', mono: true, color: GREY })))),
        row({ justify: 'between', background: '#1C1C1E', radius: 16, padding: 10 },
          row({ gap: 4 }, obj('ninja', 22), text('×{ninjas}', { size: 14, weight: 'heavy', mono: true })),
          row({ gap: 4 }, obj('mage', 22), text('×{mages}', { size: 14, weight: 'heavy', mono: true })),
          row({ gap: 4 }, obj('dragon', 22), text('×{dragons}', { size: 14, weight: 'heavy', mono: true })),
          row({ gap: 4 }, obj('shield', 22), text('{shield}', { size: 14, weight: 'heavy', mono: true }))),
        when('ready', row({ gap: 10 }, wide(button('raid', 'Raid!', { icon: 'bolt', color: '#FFB020', textColor: '#2A1700', confirm: 'Attack now?' })))),
      ),
      theme: theme('#FFB020'),
    },
    initial: () => ({ headline: 'Dragons training', readyAt: Date.now() + 8_000, army: 0.72, troops: 230, ninjas: 18, mages: 6, dragons: 3, shield: '2h' }),
    story: [
      [3000, { army: 0.86, troops: 276, ninjas: 22, mages: 8 }],
      [5200, { army: 1, troops: 320, dragons: 5, ready: true, headline: 'Army ready' }, true],
    ],
    handle: (action) => (action === 'raid' ? { headline: '3 stars! +1,240 gold', ready: false, readyAt: Date.now() + 30 * MIN, army: 0.1, troops: 32 } : undefined),
  },
  // endregion
];

const QUIZ = [
  { question: 'Which organelle makes ATP?', a: 'Nucleus', b: 'Mitochondria', c: 'Ribosome', right: 'b' },
  { question: 'What carries oxygen in blood?', a: 'Haemoglobin', b: 'Insulin', c: 'Keratin', right: 'a' },
  { question: 'Photosynthesis happens in…', a: 'Chloroplasts', b: 'Vacuoles', c: 'Lysosomes', right: 'a' },
];

export const groups: Group[] = ['Daily', 'EdTech', 'Work', 'Health', 'Focus', 'Money', 'Sport', 'Travel', 'Games'];
