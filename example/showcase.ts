import { IslandState, IslandTemplate, arc, bar, bars, button, column, fx, image, row, svg, text, timeline, timer, when } from 'halo-island';

import { brand } from './brands';

/** One beat of a story: wait, then patch state (optionally as an alert). */
type Beat = [delayMs: number, patch: IslandState, alert?: boolean];

export interface Scenario {
  id: string;
  title: string;
  /** What the island tracks, in a few plain words. */
  about: string;
  template: IslandTemplate;
  initial: () => IslandState;
  story: Beat[];
  /** A moment, not an activity: shown in-app and dismissed. */
  toast?: boolean;
}

/** Kimbo's typeface. One family, weights do the work. */
const MANROPE = { regular: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold', heavy: 'Manrope_800ExtraBold' };

const ALBUM = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=70';
const RENDER = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&q=70';
const SPARKLE = 'M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z';
const GREY = '#8E8E93';

/** Big number with a small unit on one baseline: 12 min, ₹2,499 sent, 24,331.25. */
const big = (value: string, unit: string, color: string, size = 46) =>
  row({ align: 'baseline', gap: 4 }, text(value, { size, weight: 'heavy', color, mono: true }), text(unit, { size: Math.round(size * 0.38), weight: 'bold', color }));

export const scenarios: Scenario[] = [
  {
    id: 'swiggy',
    title: 'Swiggy',
    about: 'Food delivery, stage by stage',
    template: {
      compact: { leading: svg(brand.swiggy, { size: 22, color: '#FC8019' }), trailing: text('{eta} min', { weight: 'heavy', color: '#FC8019', size: 16 }) },
      expanded: column({ gap: 16 },
        row({ justify: 'between', align: 'end' },
          big('{eta}', 'min', '#FC8019'),
          column({ gap: 2, align: 'end' }, text('{status}', { size: 15, weight: 'bold' }), text('{items}', { size: 13, color: GREY }))),
        timeline('{stage}', ['check', 'bag', 'navigate', 'location'], { color: '#FC8019', ink: '#000000', size: 34 }),
        when('rider', row({ gap: 10 },
          button('call', 'Call {rider}', { icon: 'phone', color: '#FC8019', tint: true }),
          button('chat', undefined, { icon: 'chat', color: '#FC8019', tint: true }))),
      ),
      theme: { accent: '#FC8019', fonts: MANROPE },
      link: 'haloexample://order',
    },
    initial: () => ({ status: 'Order confirmed', items: 'Meghana Foods · 2 items', eta: 32, stage: 1 }),
    story: [
      [2500, { status: 'Packed and ready', eta: 26, stage: 2 }],
      [3000, { status: 'Ravi is on the way', eta: 18, stage: 2.5, rider: 'Ravi' }, true],
      [2500, { eta: 9, stage: 3.2 }],
      [2500, { status: 'Ravi is at your door', eta: 1, stage: 4 }, true],
    ],
  },
  {
    id: 'uber',
    title: 'Uber',
    about: 'Pickup with PIN, car and live distance',
    template: {
      compact: { leading: svg(brand.uber, { size: 16, width: 42, color: '#FFFFFF' }), trailing: text('{etaLabel}', { weight: 'heavy', size: 16 }) },
      expanded: column({ gap: 14 },
        row({ justify: 'between', align: 'start' },
          column({ gap: 3, grow: true }, text('{status}', { size: 22, weight: 'heavy' }), text('{car} · {plate}', { size: 13, color: GREY })),
          when('pin', column({ background: '#FFFFFF', radius: 12, padding: 8, gap: 0, align: 'center' },
            text('PIN', { size: 10, weight: 'heavy', color: '#000000' }), text('{pin}', { size: 18, weight: 'heavy', color: '#000000', mono: true })))),
        bar('{progress}', { color: '#FFFFFF', track: '#2C2C2E', height: 6 }),
        when('driver', row({ gap: 10 },
          button('call', 'Call {driver}', { icon: 'phone', color: '#FFFFFF', textColor: '#000000' }),
          button('chat', undefined, { icon: 'chat', color: '#FFFFFF', tint: true }),
          button('sos', undefined, { icon: 'shield', color: '#FF453A', tint: true }))),
      ),
      theme: { accent: '#FFFFFF', fonts: MANROPE },
    },
    initial: () => ({ status: 'Finding your ride', car: 'Uber Go', plate: 'Matching nearby drivers', etaLabel: 'Matching', progress: 0 }),
    story: [
      [2500, { status: 'Pickup in 6 min', car: 'Toyota Etios · White', plate: 'KA 01 AB 1234', driver: 'Asha', pin: '4821', etaLabel: '6 min', progress: 0.2 }, true],
      [2500, { status: 'Pickup in 3 min', etaLabel: '3 min', progress: 0.6 }],
      [2500, { status: 'Asha is here', etaLabel: 'Here', progress: 1 }, true],
    ],
  },
  {
    id: 'cricket',
    title: 'IPL Live',
    about: 'Score, run rate, an alert on every six',
    template: {
      compact: {
        leading: row({ gap: 5 }, text('IPL', { weight: 'heavy', size: 16 }), fx(text('Live', { weight: 'heavy', size: 16, color: '#FF453A' }), 'shimmer')),
        trailing: text('{runs}/{wkts}', { weight: 'heavy', size: 16, mono: true }),
      },
      expanded: column({ gap: 14 },
        row({ justify: 'between', align: 'end' },
          big('{runs}/{wkts}', '{overs} ov', '#FFFFFF', 48),
          column({ gap: 2, align: 'end' }, text('CRR {crr}', { size: 13, weight: 'bold', color: '#FF9F0A' }), text('{batter}', { size: 13, color: GREY }))),
        bars('{perOver}', { active: '{over}', color: '#FF9F0A', height: 44, gap: 4 }),
      ),
      theme: { accent: '#FF9F0A', fonts: MANROPE },
    },
    initial: () => ({ runs: 92, wkts: 1, overs: '8.5', over: 9, crr: '10.42', batter: 'Rohit 42 (30)', perOver: '0.4,0.7,0.3,0.9,0.5,0.6,1,0.8,0.5,0,0,0,0,0,0,0,0,0,0,0' }),
    story: [
      [2400, { runs: 98, overs: '8.6', batter: 'Rohit 48 (31)' }, true],
      [2400, { runs: 99, overs: '9.1', over: 10, perOver: '0.4,0.7,0.3,0.9,0.5,0.6,1,0.8,0.7,0.1,0,0,0,0,0,0,0,0,0,0' }],
      [2400, { runs: 103, overs: '9.2', crr: '11.03', perOver: '0.4,0.7,0.3,0.9,0.5,0.6,1,0.8,0.7,0.5,0,0,0,0,0,0,0,0,0,0' }],
    ],
  },
  {
    id: 'indigo',
    title: 'IndiGo',
    about: 'Journey arc, gate, boarding countdown',
    template: {
      compact: { leading: svg(brand.indigo, { size: 20, color: '#7B93FF' }), trailing: row({ gap: 6 }, text('{gate}', { weight: 'heavy', color: '#7B93FF', size: 16 }), timer('{boardAt}', { style: { weight: 'heavy', size: 16 } })) },
      expanded: column({ gap: 4 },
        row({ justify: 'between' }, text('BLR', { size: 15, weight: 'heavy', color: GREY }), text('6E 2134', { size: 13, weight: 'bold', color: GREY }), text('DEL', { size: 15, weight: 'heavy', color: GREY })),
        arc('{progress}', { height: 52, colors: ['#3A5BFF', '#7B93FF', '#C9B8FF'], thickness: 5 }),
        column({ gap: 2, align: 'center' },
          timer('{boardAt}', { style: { size: 40, weight: 'heavy', align: 'center' } }),
          text('{status}', { size: 14, weight: 'semibold', color: GREY, align: 'center' })),
      ),
      theme: { accent: '#7B93FF', fonts: MANROPE },
    },
    initial: () => ({ gate: 'G24', status: 'Boarding at gate G24', boardAt: Date.now() + 38 * 60_000, progress: 0.18 }),
    story: [
      [3000, { gate: 'G27', status: 'Gate changed to G27' }, true],
      [3500, { status: 'Boarding now · G27', boardAt: Date.now() + 60_000, progress: 0.35 }, true],
    ],
  },
  {
    id: 'spotify',
    title: 'Spotify',
    about: 'Artwork light, waveform, controls',
    template: {
      compact: {
        leading: image(ALBUM, { size: 24, radius: 7 }),
        trailing: column({ width: 34, gap: 0 }, bars('0.5,0.9,0.6,1,0.4,0.8', { height: 18, gap: 2, color: '#1DB954', animate: true })),
      },
      expanded: column({ gap: 16 },
        row({ gap: 14 },
          image(ALBUM, { size: 64, radius: 14, glow: true }),
          column({ gap: 3, grow: true }, text('{title}', { size: 19, weight: 'heavy' }), text('{artist}', { size: 14, color: GREY })),
          svg(brand.spotify, { size: 22, color: '#1DB954' })),
        bar('{progress}', { color: '#FFFFFF', track: '#3A3A3C', height: 4 }),
        row({ justify: 'center', gap: 22 },
          button('previous', undefined, { icon: 'previous', color: '#000000', textColor: '#FFFFFF' }),
          button('toggle', undefined, { icon: '{playIcon}', color: '#FFFFFF', textColor: '#000000' }),
          button('next', undefined, { icon: 'next', color: '#000000', textColor: '#FFFFFF' })),
      ),
      theme: { accent: '#1DB954', fonts: MANROPE },
    },
    initial: () => ({ title: 'Kesariya', artist: 'Arijit Singh · Brahmastra', progress: 0.1, playIcon: 'pause' }),
    story: [[3000, { progress: 0.22 }], [3000, { progress: 0.34 }]],
  },
  {
    id: 'strava',
    title: 'Strava',
    about: 'Run timer, pace per kilometre',
    template: {
      compact: { leading: svg(brand.strava, { size: 20, color: '#FC4C02' }), trailing: timer('{startedAt}', { countUp: true, style: { weight: 'heavy', color: '#FC4C02', size: 16 } }) },
      expanded: column({ gap: 14 },
        row({ justify: 'between', align: 'end' },
          timer('{startedAt}', { countUp: true, style: { size: 44, weight: 'heavy' } }),
          column({ gap: 2, align: 'end' }, text('{km} km', { size: 18, weight: 'heavy', color: '#FC4C02', mono: true }), text('{pace} /km', { size: 13, color: GREY }))),
        bars('{splits}', { color: '#FC4C02', height: 36, gap: 6 }),
        row({ gap: 10 },
          button('pause', 'Pause', { icon: 'pause', color: '#FC4C02', tint: true }),
          button('end', 'Finish', { icon: 'stop', color: '#FFFFFF', tint: true })),
      ),
      theme: { accent: '#FC4C02', fonts: MANROPE },
    },
    initial: () => ({ startedAt: Date.now() - 12 * 60_000, km: '2.10', pace: "5'42\"", splits: '0.7,0.85,0.6' }),
    story: [[2500, { km: '2.21' }], [2500, { km: '2.34', pace: "5'38\"", splits: '0.7,0.85,0.6,0.4' }]],
  },
  {
    id: 'kite',
    title: 'Kite',
    about: 'NIFTY intraday, buy or sell in place',
    template: {
      compact: { leading: svg(brand.zerodha, { size: 20, color: '#387ED1' }), trailing: text('{price}', { weight: 'heavy', mono: true, color: '#30D158', size: 16 }) },
      expanded: column({ gap: 14 },
        row({ justify: 'between', align: 'end' },
          column({ gap: 0 }, text('NIFTY 50', { size: 12, weight: 'heavy', color: GREY }), text('{price}', { size: 36, weight: 'heavy', mono: true })),
          text('▲ {change}', { size: 15, weight: 'heavy', color: '#30D158', mono: true })),
        bars('{intraday}', { color: '#30D158', height: 36, gap: 3 }),
        row({ gap: 10 },
          button('buy', 'Buy', { color: '#387ED1', textColor: '#FFFFFF' }),
          button('sell', 'Sell', { color: '#FF453A', tint: true })),
      ),
      theme: { accent: '#387ED1', fonts: MANROPE },
    },
    initial: () => ({ price: '24,312.45', change: '0.80%', intraday: '0.3,0.35,0.32,0.45,0.5,0.48,0.6,0.58,0.7,0.66,0.72,0.8' }),
    story: [
      [1500, { price: '24,318.10', change: '0.82%' }],
      [1500, { price: '24,331.25', change: '0.88%', intraday: '0.3,0.35,0.32,0.45,0.5,0.48,0.6,0.58,0.7,0.66,0.72,0.8,0.9' }],
    ],
  },
  {
    id: 'phonepe',
    title: 'PhonePe',
    about: 'Payment sent, in and out',
    toast: true,
    template: {
      compact: { leading: svg(brand.phonepe, { size: 20, color: '#A475F2' }), trailing: text('₹{amount}', { weight: 'heavy', mono: true, size: 16 }) },
      expanded: column({ gap: 4 },
        big('₹{amount}', 'sent', '#FFFFFF', 40),
        text('to {payee} · UPI {ref}', { color: GREY, size: 14 })),
      theme: { accent: '#A475F2', fonts: MANROPE },
    },
    initial: () => ({ amount: '2,499', payee: "Asha's Cafe", ref: '4031 2291' }),
    story: [],
  },
  {
    id: 'image',
    title: 'Image generation',
    about: 'Progress, then the result appears',
    template: {
      compact: { leading: fx(svg(SPARKLE, { size: 18, color: '#BF5AF2' }), 'spin'), trailing: text('{percent}%', { weight: 'heavy', mono: true, color: '#BF5AF2', size: 16 }) },
      expanded: column({ gap: 16 },
        row({ gap: 14 },
          image('{preview}', { size: 64, radius: 16, glow: true }),
          column({ gap: 3, grow: true }, text('{status}', { size: 18, weight: 'heavy' }), text('A neon city at dusk, isometric', { color: GREY, size: 13, lines: 2 }))),
        bar('{progress}', { color: '#BF5AF2', track: '#2C2C2E', height: 5 }),
        when('preview', button('download', 'Save to Photos', { icon: 'download', color: '#BF5AF2', tint: true })),
      ),
      theme: { accent: '#BF5AF2', fonts: MANROPE },
    },
    initial: () => ({ status: 'Starting', percent: 0, progress: 0, preview: '' }),
    story: [
      [1800, { percent: 34, progress: 0.34, status: 'Laying out shapes' }],
      [1800, { percent: 71, progress: 0.71, status: 'Adding light' }],
      [1800, { percent: 100, progress: 1, status: 'Your image is ready', preview: RENDER }, true],
    ],
  },
];

