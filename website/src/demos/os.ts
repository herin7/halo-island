/**
 * Island OS for the web: a launcher in the expanded island and six apps that run entirely inside
 * it through `screens`. Adapted from example/os.ts (which pulls React Native fonts), with the
 * website's own flows: rupee wallet with confirm, stepper timer, cancellable ride.
 */
import { IslandNode, IslandState, IslandTemplate, bars, button, chips, column, icon, image, line, pet, ring, row, slider, spacer, text, timer, toggle, track, when } from 'halo-island';

const GREY = '#98989F';

export const APPS = [
  { id: 'music', label: 'Music', icon: 'music-notes', color: '#FF375F' },
  { id: 'wallet', label: 'Wallet', icon: 'coins', color: '#30D158' },
  { id: 'home', label: 'Home', icon: 'house', color: '#FF9F0A' },
  { id: 'timer', label: 'Timer', icon: 'timer', color: '#FFB547' },
  { id: 'ride', label: 'Ride', icon: 'car-profile', color: '#E5E5EA' },
  { id: 'halo', label: 'Halo', icon: 'heart', color: '#FF5DA2' },
] as const;

export const TRACKS = [
  { track: 'Midnight City', artist: 'M83 · Hurry Up, We’re Dreaming', art: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=200&q=70', dur: 243 },
  { track: 'Kesariya', artist: 'Arijit Singh · Brahmastra', art: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&q=70', dur: 268 },
  { track: 'Blinding Lights', artist: 'The Weeknd · After Hours', art: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&q=70', dur: 200 },
];

const back = column({ width: 36 }, button('back', undefined, { icon: 'back', shape: 'circle', color: '#FFFFFF', tint: true }));
const head = (title: string, color: string, right?: IslandNode) => row({ gap: 12 }, back, text(title, { size: 18, weight: 'semibold', color }), spacer(), right);
const tile = (a: (typeof APPS)[number]) => button(`go:${a.id}`, a.label, { icon: a.icon, color: a.color, textColor: a.id === 'ride' ? '#000000' : '#FFFFFF', shape: 'tile' });
const disc = (bg: string, child: IslandNode, size = 44) => column({ width: size, height: size, radius: size / 2, background: bg, align: 'center', justify: 'center' }, child);

const launcher = column({ gap: 14 },
  row({ justify: 'between', align: 'end' },
    column({ gap: 0 }, text('{greeting}', { size: 24, weight: 'semibold' }), text('Six apps. Zero screens.', { size: 13, color: GREY })),
    column({ gap: 0, align: 'end' }, text('{clock}', { size: 22, weight: 'semibold', mono: true }), text('{date}', { size: 12, color: GREY }))),
  row({ gap: 8 }, ...APPS.slice(0, 3).map(tile)),
  row({ gap: 8 }, ...APPS.slice(3).map(tile)),
);

const music = column({ gap: 14 },
  head('Music', '#FF375F', when('playing', column({ width: 34 }, bars('0.5,0.9,0.6,1,0.4,0.8', { height: 16, gap: 2, color: '#FF375F', animate: true })))),
  row({ gap: 14 },
    image('{art}', { size: 64, radius: 16, glow: true }),
    column({ gap: 3, grow: true }, text('{track}', { size: 19, weight: 'semibold' }), text('{artist}', { size: 13, color: GREY }))),
  column({ gap: 6 },
    slider('pos', { color: '#FFFFFF', height: 8 }),
    row({ justify: 'between' }, text('{posLabel}', { size: 12, color: GREY, mono: true }), text('-{remLabel}', { size: 12, color: GREY, mono: true }))),
  row({ justify: 'center', gap: 22 },
    button('music:prev', undefined, { icon: 'skip-back', shape: 'circle', color: '#FFFFFF', tint: true }),
    button('music:toggle', undefined, { icon: '{playIcon}', shape: 'circle', color: '#FFFFFF', textColor: '#000000' }),
    button('music:next', undefined, { icon: 'skip-forward', shape: 'circle', color: '#FFFFFF', tint: true })),
);

const wallet = column({ gap: 14 },
  head('Wallet', '#30D158', text('{chg}', { size: 14, weight: 'semibold', color: '#30D158', mono: true })),
  row({ gap: 12 },
    disc('#E8B931', text('Au', { size: 16, weight: 'semibold', color: '#3A2A00' })),
    column({ gap: 1 }, text('Digital gold', { size: 13, weight: 'bold', color: GREY }), text('₹{price}/g', { size: 22, weight: 'semibold', mono: true })),
    column({ grow: true }, line('{spark}', { height: 44, color: '#30D158', fill: true }))),
  row({ justify: 'between', padding: 14, radius: 18, gradient: ['#1C1C1E', '#16241B'] },
    text('You own {grams} g', { size: 14, color: GREY }),
    text('₹{bal}', { size: 15, weight: 'semibold', mono: true })),
  chips('amt', ['₹100', '₹200', '₹500'], { values: ['100', '200', '500'], color: '#30D158' }),
  button('wallet:buy', 'Buy ₹{amt}', { icon: 'bolt', color: '#30D158', textColor: '#000000', confirm: 'Pay ₹{amt}? Tap again' }),
);

const paid = column({ gap: 10, align: 'center' },
  pet('happy', { size: 56, color: '#FFFFFF' }),
  text('₹{amt} of gold, yours', { size: 20, weight: 'semibold', align: 'center' }),
  text('+{gramsAdded} g · balance ₹{bal}', { size: 13, color: GREY, mono: true, align: 'center' }),
  row({ gap: 10 }, button('back', 'Buy more', { color: '#30D158', tint: true }), button('close', 'Done', { icon: 'check', color: '#30D158', textColor: '#000000' })),
);

const home = column({ gap: 12 },
  head('Home', '#FF9F0A', text('{homeSummary}', { size: 13, weight: 'semibold', color: GREY })),
  row({ gap: 8 },
    toggle('light', 'Lights', { icon: 'bulb', color: '#FFD60A' }),
    toggle('fan', 'Fan', { icon: 'refresh', color: '#5AC8FA' }),
    toggle('lock', 'Lock', { icon: 'lock', color: '#30D158' })),
  row({ gap: 10 }, slider('bright', { icon: 'sun', color: '#FFD60A', height: 44 }), column({ width: 44, align: 'end' }, text('{brightPct}', { size: 15, weight: 'semibold', mono: true }))),
);

const timerScreen = column({ gap: 14 },
  head('Timer', '#FFB547', when('streak', text('{streak} done today', { size: 13, weight: 'bold', color: GREY }))),
  when('!timerOn', column({ gap: 14 },
    row({ justify: 'between' },
      column({ width: 48 }, button('timer:minus', undefined, { icon: 'minus', shape: 'circle', color: '#FFB547', tint: true })),
      column({ gap: 0, align: 'center' },
        row({ align: 'baseline', gap: 4 }, text('{mins}', { size: 60, weight: 'semibold', mono: true }), text('min', { size: 18, weight: 'bold', color: GREY })),
        text('Tea, pasta, a short sprint', { size: 12, color: GREY })),
      column({ width: 48 }, button('timer:plus', undefined, { icon: 'plus', shape: 'circle', color: '#FFB547', tint: true }))),
    button('timer:start', 'Start', { icon: 'play', color: '#FFB547', textColor: '#000000' }))),
  when('timerOn', column({ gap: 16 },
    row({ gap: 18 },
      ring('{timerP}', { size: 80, thickness: 9, color: '#FFB547' }),
      column({ gap: 2, grow: true }, timer('{timerEnd}', { style: { size: 44, weight: 'semibold' } }), text('{timerLabel}', { size: 13, color: GREY }))),
    row({ gap: 10 },
      button('timer:add', '+1 min', { color: '#FFB547', tint: true }),
      button('timer:stop', 'Stop', { icon: 'stop', color: '#FF453A', tint: true, confirm: 'Stop timer?' })))),
);

const ride = column({ gap: 14 },
  head('Ride', '#FFFFFF', when('rideOn', text('{rideEta}', { size: 15, weight: 'semibold', mono: true }))),
  when('!rideOn', column({ gap: 14 },
    row({ gap: 12 },
      disc('#2C2C2E', icon('location', { size: 20, color: '#FFFFFF' }), 40),
      column({ gap: 1, grow: true }, text('Indiranagar Metro', { size: 16, weight: 'bold' }), text('12 min · 4.2 km from Home', { size: 12, color: GREY }))),
    chips('rideType', ['Auto ₹89', 'Go ₹142', 'XL ₹230'], { values: ['Auto', 'Go', 'XL'], color: '#FFFFFF' }),
    button('ride:book', 'Book {rideType}', { icon: 'car', color: '#FFFFFF', textColor: '#000000' }))),
  when('rideOn', column({ gap: 14 },
    row({ justify: 'between', align: 'start' },
      column({ gap: 3, grow: true }, text('{rideStatus}', { size: 20, weight: 'semibold', lines: 2 }), text('{rideCar}', { size: 12, color: GREY })),
      when('pin', column({ background: '#FFFFFF', radius: 12, padding: 8, gap: 0, align: 'center' },
        text('PIN', { size: 10, weight: 'semibold', color: '#000000' }), text('{pin}', { size: 18, weight: 'semibold', color: '#000000', mono: true })))),
    track('{rideP}', 'car', { color: '#FFFFFF', track: '#2C2C2E', height: 4 }),
    row({ gap: 10 },
      when('driver', button('ride:call', 'Call {driver}', { icon: 'phone', color: '#FFFFFF', textColor: '#000000' })),
      button('ride:cancel', 'Cancel', { color: '#FF453A', tint: true, confirm: 'Cancel ride?' })))),
);

const cancelled = column({ gap: 10, align: 'center' },
  pet('sad', { size: 52, color: '#FFFFFF' }),
  text('Ride cancelled', { size: 20, weight: 'semibold' }),
  text('No fee, Asha has been told.', { size: 13, color: GREY }),
  row({ gap: 10 }, button('back', 'Book again', { color: '#FFFFFF', tint: true }), button('close', 'Done', { color: '#FFFFFF', textColor: '#000000' })),
);

const halo = column({ gap: 12, align: 'center' },
  row({ gap: 12 }, back, spacer(), text('Halo', { size: 18, weight: 'semibold', color: '#FF5DA2' }), spacer(), column({ width: 36 })),
  pet('{mood}', { size: 60, color: '#FFFFFF' }),
  text('{petLine}', { size: 20, weight: 'semibold', align: 'center' }),
  chips('petMood', ['Happy', 'Love', 'Sleepy', 'Wink', 'Wow'], { values: ['happy', 'love', 'sleepy', 'wink', 'surprised'], color: '#FF5DA2' }),
);

export const osTemplate: IslandTemplate = {
  compact: {
    leading: pet('{mood}', { size: 20 }),
    trailing: row({ gap: 6 },
      when('tTimer', row({ gap: 6 }, ring('{timerP}', { size: 16, thickness: 2.5, color: '#FFB547' }), timer('{timerEnd}', { style: { size: 15, weight: 'semibold', color: '#FFB547' } }))),
      when('tRide', row({ gap: 6 }, icon('car', { size: 16, color: '#FFFFFF' }), text('{rideEta}', { size: 15, weight: 'semibold', mono: true }))),
      when('tMusic', row({ gap: 8 }, image('{art}', { size: 20, radius: 6 }), column({ width: 26 }, bars('0.5,0.9,0.6,1,0.4', { height: 14, gap: 2, color: '#FF375F', animate: true })))),
      when('tHi', text('Island OS', { size: 15, weight: 'semibold', color: '#FFFFFF' }))),
  },
  expanded: launcher,
  screens: { music, wallet, paid, home, timer: timerScreen, ride, cancelled, halo },
  theme: { accent: '#8B7CFF', radius: 44 },
};

const SPARK = [0.32, 0.3, 0.38, 0.35, 0.42, 0.4, 0.48, 0.45, 0.52, 0.5, 0.6, 0.56, 0.62, 0.66, 0.63, 0.72, 0.7, 0.78];
export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function initialOS(): IslandState {
  const now = new Date();
  const h = now.getHours();
  const t = TRACKS[0];
  return {
    petMood: 'idle', petLine: 'Move around. I’m watching.',
    greeting: h < 5 ? 'Up late?' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Up late?',
    clock: now.toTimeString().slice(0, 5), date: now.toDateString().slice(0, 10),
    trackIndex: 0, ...t, playing: false, playIcon: 'play', pos: 0.18, posLabel: fmt(0.18 * t.dur), remLabel: fmt(0.82 * t.dur),
    price: '7,412.50', priceNum: 7412.5, chg: '+1.84%', spark: SPARK.join(','), amt: '200', grams: '1.284', gramsNum: 1.284, bal: '9,517.65',
    light: true, fan: false, lock: true, bright: 0.7, brightPct: '70%', homeSummary: '1 on · Locked',
    mins: 5, timerOn: false, timerP: 1, timerEnd: 0, timerTotal: 1, timerLabel: '', streak: 0,
    rideType: 'Go', rideOn: false, rideP: 0,
  };
}
