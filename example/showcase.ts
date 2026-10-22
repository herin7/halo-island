import { IslandState, IslandTemplate, bar, button, column, fx, icon, image, lottie, ring, row, steps, text, timer, track } from 'halo-island';

/** One beat of a story: wait, then patch state (optionally as an alert). */
type Beat = [delayMs: number, patch: IslandState, alert?: boolean];

export interface Scenario {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  accent: string;
  template: IslandTemplate;
  initial: () => IslandState;
  story: Beat[];
}

const FOOD = {
  curry: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=200&q=70',
  pizza: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200&q=70',
};
const LOTTIE = {
  heart: 'https://raw.githubusercontent.com/airbnb/lottie-android/master/sample-compose/src/main/res/raw/heart.json',
};

const pill = (label: string, bg: string, color = '#F7F7F2') =>
  row({ background: bg, radius: 8, padding: 5, gap: 0 }, text(label, { size: 12, weight: 'bold', color, mono: true }));

const muted = '#9AA09A';

export const scenarios: Scenario[] = [
  {
    id: 'food',
    title: 'Food delivery',
    subtitle: 'Swiggy-style · stages, rider on the road',
    emoji: '🍛',
    accent: '#FC8019',
    template: {
      compact: { leading: fx(text('🛵', { size: 18 }), 'bounce'), trailing: text('{eta}', { weight: 'bold', mono: true, color: '#FC8019' }) },
      expanded: column({ gap: 10 },
        row(image(FOOD.curry, { size: 48, radius: 12 }), column({ gap: 2, grow: true },
          text('{status}', { size: 16, weight: 'bold' }),
          text('{restaurant} · {items}', { color: muted, size: 13 }))),
        track('{progress}', '🛵', { color: '#FC8019' }),
        steps('{stage}', 4, { color: '#FC8019' }),
        row(button('call', 'Call {rider}', { icon: 'phone' }), button('help', 'Help', { color: '#2A2420', textColor: '#F7F7F2' })),
      ),
      theme: { accent: '#FC8019', glow: '#FC8019' },
      link: 'haloexample://order',
    },
    initial: () => ({ status: 'Order placed', restaurant: 'Meghana Foods', items: '2 items', eta: '32 min', rider: 'Ravi', stage: 0.5, progress: 0 }),
    story: [
      [2500, { status: 'Restaurant is cooking 👨‍🍳', stage: 1.4, eta: '28 min' }],
      [3000, { status: 'Ravi picked up your order', stage: 2.2, eta: '18 min', progress: 0.15 }, true],
      [2500, { status: 'On the way', stage: 3, eta: '12 min', progress: 0.45 }],
      [2500, { eta: '6 min', progress: 0.72, stage: 3.5 }],
      [2500, { status: 'Arriving now — get ready!', eta: '1 min', progress: 0.95, stage: 3.9 }, true],
      [2500, { status: 'Delivered 🎉 Enjoy your meal', eta: 'Done', progress: 1, stage: 4 }, true],
    ],
  },
  {
    id: 'dineout',
    title: 'Restaurant order',
    subtitle: 'Zomato-style · live countdown, glowing',
    emoji: '🍕',
    accent: '#E23744',
    template: {
      compact: { leading: image(FOOD.pizza, { size: 24, radius: 12 }), trailing: timer('{arriveAt}', { style: { weight: 'bold', color: '#FF6B7A' } }) },
      expanded: row({ gap: 12 },
        fx(image(FOOD.pizza, { size: 64, radius: 32 }), 'spin'),
        column({ gap: 4, grow: true },
          text('{status}', { size: 16, weight: 'bold' }),
          row({ gap: 6 }, text('Arriving in', { color: muted }), timer('{arriveAt}', { style: { weight: 'heavy', color: '#FF6B7A' } })),
          bar('{progress}', { color: '#E23744' })),
      ),
      theme: { accent: '#E23744', glow: '#E23744', radius: 36 },
    },
    initial: () => ({ status: 'Your pizza is in the oven 🔥', arriveAt: Date.now() + 25 * 60_000, progress: 0.2 }),
    story: [
      [3500, { status: 'Out of the oven, boxing it up', progress: 0.4 }],
      [3500, { status: 'Rider is 2 km away', progress: 0.75 }, true],
    ],
  },
  {
    id: 'quick',
    title: '10-minute delivery',
    subtitle: 'Blinkit / Zepto-style · race the clock',
    emoji: '⚡',
    accent: '#F8CB46',
    template: {
      compact: { leading: fx(text('⚡', { size: 16 }), 'pulse'), trailing: timer('{arriveAt}', { style: { weight: 'heavy', color: '#F8CB46' } }) },
      expanded: column({ gap: 8 },
        row({ justify: 'between' },
          column({ gap: 0 }, text('Arriving in', { color: muted, size: 12 }), timer('{arriveAt}', { style: { size: 34, weight: 'heavy', color: '#F8CB46' } })),
          pill('{items} ITEMS', '#0C831F')),
        text('{status}', { weight: 'semibold' }),
        steps('{stage}', 3, { color: '#F8CB46', height: 5 }),
      ),
      theme: { accent: '#F8CB46', background: '#0B0B08' },
    },
    initial: () => ({ arriveAt: Date.now() + 9 * 60_000 + 40_000, items: 6, status: 'Packing your order', stage: 0.6 }),
    story: [
      [3000, { status: 'Packed! Partner is on the way', stage: 1.5 }, true],
      [3500, { status: 'Around the corner 🏍️', stage: 2.6 }],
    ],
  },
  {
    id: 'ride',
    title: 'Ride',
    subtitle: 'Uber / Ola / Rapido-style · OTP + car on the map',
    emoji: '🚕',
    accent: '#5FCB9C',
    template: {
      compact: { leading: icon('car', { color: '#5FCB9C' }), trailing: text('{eta}', { weight: 'bold', mono: true }) },
      expanded: column({ gap: 10 },
        row({ justify: 'between' },
          column({ gap: 2 }, text('{status}', { size: 16, weight: 'bold' }), text('{driver} · ⭐ {rating}', { color: muted, size: 13 })),
          column({ gap: 4, align: 'end' }, pill('OTP {otp}', '#1E3A2E', '#5FCB9C'), pill('{plate}', '#F7F7F2', '#111111'))),
        track('{progress}', '🚗'),
        row(button('call', 'Call', { icon: 'phone' }), button('share', 'Share trip', { color: '#1E2420', textColor: '#F7F7F2' })),
      ),
    },
    initial: () => ({ status: 'Driver is on the way', driver: 'Asha', rating: '4.9', otp: '4821', plate: 'KA 01 AB 1234', eta: '6 min', progress: 0.1 }),
    story: [
      [2500, { eta: '4 min', progress: 0.35 }],
      [2500, { eta: '2 min', progress: 0.7 }],
      [2500, { status: 'Asha has arrived 📍', eta: 'Here', progress: 1 }, true],
    ],
  },
  {
    id: 'cricket',
    title: 'Live cricket',
    subtitle: 'Cricbuzz-style · every ball, wicket alerts',
    emoji: '🏏',
    accent: '#38BDF8',
    template: {
      compact: {
        leading: row({ gap: 6 }, fx(text('●', { color: '#E5484D', size: 10 }), 'pulse'), text('IND {runs}/{wkts}', { weight: 'bold', mono: true })),
        trailing: text('{overs} ov', { color: muted, mono: true }),
      },
      expanded: column({ gap: 8 },
        row({ justify: 'between' },
          column({ gap: 0 }, text('IND {runs}/{wkts}', { size: 26, weight: 'heavy', mono: true }), text('{overs} overs · CRR {crr}', { color: muted, size: 12 })),
          column({ gap: 0, align: 'end' }, text('AUS 186/7', { weight: 'semibold', color: muted }), text('{need}', { color: '#38BDF8', weight: 'bold', size: 13 }))),
        row({ gap: 6 }, pill('{b1}', '#22262B'), pill('{b2}', '#22262B'), pill('{b3}', '#22262B'), pill('{b4}', '#22262B'), pill('{b5}', '#22262B'), pill('{b6}', '#1D4ED8')),
      ),
      theme: { accent: '#38BDF8' },
    },
    initial: () => ({ runs: 162, wkts: 4, overs: '17.2', crr: '9.35', need: 'Need 25 off 16', b1: '1', b2: '4', b3: '0', b4: '1', b5: '2', b6: '1' }),
    story: [
      [2200, { runs: 168, overs: '17.3', need: 'Need 19 off 15', b1: '4', b2: '0', b3: '1', b4: '2', b5: '1', b6: '6' }, true],
      [2200, { runs: 169, overs: '17.4', need: 'Need 18 off 14', b1: '0', b2: '1', b3: '2', b4: '1', b5: '6', b6: '1' }],
      [2200, { wkts: 5, overs: '17.5', need: 'Need 18 off 13', b1: '1', b2: '2', b3: '1', b4: '6', b5: '1', b6: 'W' }, true],
      [2200, { runs: 173, overs: '17.6', need: 'Need 14 off 12', b1: '2', b2: '1', b3: '6', b4: '1', b5: 'W', b6: '4' }],
    ],
  },
  {
    id: 'flight',
    title: 'Flight',
    subtitle: 'IndiGo-style · gate, seat, boarding countdown',
    emoji: '✈️',
    accent: '#6C8CFF',
    template: {
      compact: { leading: text('✈️ {gate}', { weight: 'bold' }), trailing: timer('{boardAt}', { style: { weight: 'bold', color: '#6C8CFF' } }) },
      expanded: column({ gap: 10 },
        row({ justify: 'between' },
          column({ gap: 0 }, text('BLR', { size: 28, weight: 'heavy' }), text('Bengaluru', { color: muted, size: 12 })),
          column({ align: 'center', gap: 0, grow: true }, fx(text('✈︎', { size: 20, color: '#6C8CFF' }), 'bounce'), text('6E 2134', { color: muted, size: 11 })),
          column({ gap: 0, align: 'end' }, text('DEL', { size: 28, weight: 'heavy' }), text('New Delhi', { color: muted, size: 12 }))),
        row({ justify: 'between' }, pill('GATE {gate}', '#1B2347', '#AFC0FF'), pill('SEAT {seat}', '#1B2347', '#AFC0FF'), pill('{status}', '#6C8CFF', '#0B1020')),
        track('{progress}', '✈️', { color: '#6C8CFF' }),
      ),
      theme: { accent: '#6C8CFF', background: '#05070F' },
    },
    initial: () => ({ gate: '24', seat: '14A', status: 'ON TIME', boardAt: Date.now() + 38 * 60_000, progress: 0 }),
    story: [
      [3000, { gate: '27', status: 'GATE CHANGE' }, true],
      [3500, { status: 'BOARDING', boardAt: Date.now() + 60_000 }, true],
      [3000, { status: 'IN AIR', progress: 0.3 }],
      [3000, { progress: 0.8 }],
    ],
  },
  {
    id: 'train',
    title: 'Train journey',
    subtitle: 'IRCTC / ixigo-style · next station, delays',
    emoji: '🚆',
    accent: '#F59E0B',
    template: {
      compact: { leading: text('🚆 {next}', { weight: 'semibold' }), trailing: text('{delay}', { weight: 'bold', color: '#F59E0B' }) },
      expanded: column({ gap: 8 },
        row({ justify: 'between' }, text('12627 Karnataka Exp', { weight: 'bold' }), pill('{delay}', '#3A2A0A', '#F59E0B')),
        text('Next: {next} · {nextAt}', { color: muted }),
        track('{progress}', '🚆', { color: '#F59E0B' }),
        row({ justify: 'between' }, text('SBC', { color: muted, size: 12, weight: 'bold' }), text('NDLS', { color: muted, size: 12, weight: 'bold' })),
      ),
      theme: { accent: '#F59E0B' },
    },
    initial: () => ({ next: 'Dharmavaram', nextAt: '19:42', delay: 'On time', progress: 0.12 }),
    story: [
      [3000, { delay: '12 min late', progress: 0.2 }, true],
      [3000, { next: 'Anantapur', nextAt: '20:31', progress: 0.27 }],
    ],
  },
  {
    id: 'upi',
    title: 'UPI payment',
    subtitle: 'PhonePe / GPay-style · instant success toast',
    emoji: '💸',
    accent: '#22C55E',
    template: {
      compact: { leading: fx(icon('check', { color: '#22C55E' }), 'pulse'), trailing: text('₹{amount}', { weight: 'heavy', mono: true }) },
      expanded: row({ gap: 12 },
        fx(row({ background: '#123D22', radius: 24, padding: 12 }, icon('check', { size: 24, color: '#22C55E' })), 'pulse'),
        column({ gap: 2, grow: true }, text('₹{amount} paid', { size: 20, weight: 'heavy' }), text('to {payee} · UPI ref {ref}', { color: muted, size: 12 }))),
      theme: { accent: '#22C55E', glow: '#22C55E' },
    },
    initial: () => ({ amount: '2,499', payee: "Asha's Cafe", ref: '4031 2291' }),
    story: [],
  },
  {
    id: 'stocks',
    title: 'Markets',
    subtitle: 'Zerodha-style · ticking index',
    emoji: '📈',
    accent: '#22C55E',
    template: {
      compact: { leading: text('NIFTY', { weight: 'bold', color: muted }), trailing: text('{price} ▲{change}', { weight: 'bold', mono: true, color: '#22C55E' }) },
      expanded: column({ gap: 6 },
        row({ justify: 'between' }, text('NIFTY 50', { weight: 'bold' }), fx(text('● LIVE', { size: 11, weight: 'bold', color: '#E5484D' }), 'shimmer')),
        text('{price}', { size: 30, weight: 'heavy', mono: true }),
        text('▲ {points} ({change})', { color: '#22C55E', weight: 'semibold', mono: true }),
        bar('{dayRange}', { color: '#22C55E' }),
      ),
      theme: { accent: '#22C55E' },
    },
    initial: () => ({ price: '24,312.45', points: '192.30', change: '0.80%', dayRange: 0.62 }),
    story: [
      [1500, { price: '24,318.10', points: '197.95', change: '0.82%', dayRange: 0.66 }],
      [1500, { price: '24,309.80', points: '189.65', change: '0.79%', dayRange: 0.6 }],
      [1500, { price: '24,331.25', points: '211.10', change: '0.88%', dayRange: 0.74 }, true],
    ],
  },
  {
    id: 'ai',
    title: 'AI generation',
    subtitle: 'ChatGPT / Midjourney-style · result pops in',
    emoji: '✨',
    accent: '#C084FC',
    template: {
      compact: { leading: fx(text('✨', { size: 16 }), 'spin'), trailing: text('{percent}', { weight: 'bold', mono: true, color: '#C084FC' }) },
      expanded: row({ gap: 12 },
        image('{preview}', { size: 64, radius: 14 }),
        column({ gap: 6, grow: true },
          text('{status}', { weight: 'bold' }),
          text('"a neon city at dusk, isometric"', { color: muted, size: 12, lines: 2 }),
          bar('{progress}', { color: '#C084FC' }))),
      theme: { accent: '#C084FC', glow: '#C084FC' },
    },
    initial: () => ({ status: 'Dreaming it up…', percent: '0%', progress: 0, preview: '' }),
    story: [
      [1800, { percent: '34%', progress: 0.34, status: 'Sketching shapes…' }],
      [1800, { percent: '71%', progress: 0.71, status: 'Adding light…' }],
      [1800, { percent: '100%', progress: 1, status: 'Your image is ready', preview: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&q=70' }, true],
    ],
  },
  {
    id: 'workout',
    title: 'Workout',
    subtitle: 'Strava / Kimbo-style · rings, live timer',
    emoji: '🏃',
    accent: '#FF7657',
    template: {
      compact: { leading: fx(ring('{progress}', { size: 20, color: '#FF7657' }), 'pulse'), trailing: timer('{startedAt}', { countUp: true, style: { weight: 'bold', color: '#FF7657' } }) },
      expanded: row({ gap: 14 },
        ring('{progress}', { size: 56, thickness: 6, color: '#FF7657' }),
        column({ gap: 2, grow: true },
          timer('{startedAt}', { countUp: true, style: { size: 28, weight: 'heavy' } }),
          text('{km} km · {pace}/km · ❤️ {bpm}', { color: muted, size: 13 })),
        button('end', undefined, { icon: 'stop', color: '#3A2323', textColor: '#EC8585' })),
      theme: { accent: '#FF7657' },
    },
    initial: () => ({ startedAt: Date.now() - 12 * 60_000, km: '2.1', pace: "5'42\"", bpm: 148, progress: 0.42 }),
    story: [
      [2500, { km: '2.2', bpm: 152, progress: 0.44 }],
      [2500, { km: '2.3', bpm: 155, progress: 0.46 }],
    ],
  },
  {
    id: 'music',
    title: 'Now playing',
    subtitle: 'Spotify-style · artwork, controls',
    emoji: '🎧',
    accent: '#1DB954',
    template: {
      compact: { leading: image('https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=120&q=70', { size: 24, radius: 6 }), trailing: fx(icon('music', { color: '#1DB954' }), 'pulse') },
      expanded: column({ gap: 10 },
        row(image('https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&q=70', { size: 52, radius: 10 }),
          column({ gap: 2, grow: true }, text('{title}', { size: 16, weight: 'bold' }), text('{artist}', { color: muted }))),
        bar('{progress}', { color: '#1DB954' }),
        row({ justify: 'center', gap: 16 }, button('toggle', undefined, { icon: '{playIcon}', color: '#1DB954', textColor: '#0B0B0B' }), button('like', undefined, { icon: 'heart', color: '#1E1E1E', textColor: '#1DB954' })),
      ),
      theme: { accent: '#1DB954' },
    },
    initial: () => ({ title: 'Kesariya', artist: 'Arijit Singh', progress: 0.1, playIcon: 'pause' }),
    story: [[3000, { progress: 0.25 }], [3000, { progress: 0.4 }]],
  },
  {
    id: 'live',
    title: 'Live stream',
    subtitle: 'Instagram Live-style · Lottie hearts',
    emoji: '❤️',
    accent: '#F43F5E',
    template: {
      compact: { leading: lottie(LOTTIE.heart, { size: 30 }), trailing: text('{viewers} watching', { weight: 'semibold' }) },
      expanded: row({ gap: 12 },
        lottie(LOTTIE.heart, { size: 64 }),
        column({ gap: 2, grow: true }, text('{host} is live', { size: 16, weight: 'bold' }), text('{viewers} watching · {likes} likes', { color: muted })),
        pill('LIVE', '#F43F5E')),
      theme: { accent: '#F43F5E', glow: '#F43F5E' },
    },
    initial: () => ({ host: 'Asha', viewers: '1.2k', likes: '8.4k' }),
    story: [[2500, { viewers: '1.4k', likes: '9.1k' }], [2500, { viewers: '1.9k', likes: '10.2k' }, true]],
  },
];
