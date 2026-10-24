/**
 * Island OS: a whole phone's worth of apps that live inside the island. One template, eight
 * screens; every operation (play, buy, book, ask) happens in the island and is handled in
 * useIslandOS.ts through plain action strings.
 */
import { IslandNode, IslandState, IslandTemplate, bars, button, chips, column, fx, image, line, pet, ring, row, slider, spacer, text, timer, toggle, track, when, arc } from 'halo-island';

import { C } from './theme';

const GREY = '#98989F';

export const APPS = [
  { id: 'music', label: 'Music', icon: 'music-notes', color: '#FF375F' },
  { id: 'wallet', label: 'Wallet', icon: 'coins', color: '#30D158' },
  { id: 'home', label: 'Home', icon: 'house', color: '#FF9F0A' },
  { id: 'focus', label: 'Focus', icon: 'timer', color: '#FFB547' },
  { id: 'ride', label: 'Ride', icon: 'car-profile', color: '#E5E5EA' },
  { id: 'ai', label: 'Ask', icon: 'sparkle', color: '#8B7CFF' },
  { id: 'weather', label: 'Weather', icon: 'sun', color: '#5AC8FA' },
  { id: 'pet', label: 'Halo', icon: 'heart', color: '#FF5DA2' },
] as const;

export const TRACKS = [
  { track: 'Midnight City', artist: 'M83 · Hurry Up, We’re Dreaming', art: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&q=70', dur: 243 },
  { track: 'Kesariya', artist: 'Arijit Singh · Brahmastra', art: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=70', dur: 268 },
  { track: 'Blinding Lights', artist: 'The Weeknd · After Hours', art: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&q=70', dur: 200 },
];

/** Screen header: a round back button, the title, and whatever sits on the right. */
const head = (title: string, color: string, right?: IslandNode) =>
  row({ gap: 12 },
    column({ width: 36 }, button('back', undefined, { icon: 'back', shape: 'circle', color: '#FFFFFF', tint: true })),
    text(title, { size: 18, weight: 'semibold', color }),
    spacer(),
    right);

const tile = (a: (typeof APPS)[number]) => button(`go:${a.id}`, a.label, { icon: a.icon, color: a.color, textColor: a.id === 'ride' ? '#000000' : '#FFFFFF', shape: 'tile' });

const launcher = column({ gap: 16 },
  row({ justify: 'between', align: 'end' },
    column({ gap: 0 },
      text('{greeting}', { size: 24, weight: 'semibold' }),
      text('{subtitle}', { size: 13, color: GREY })),
    column({ gap: 0, align: 'end' },
      text('{clock}', { size: 22, weight: 'semibold', mono: true }),
      text('{date}', { size: 12, color: GREY }))),
  row({ justify: 'between' }, ...APPS.slice(0, 4).map(tile)),
  row({ justify: 'between' }, ...APPS.slice(4).map(tile)),
);

const music = column({ gap: 14 },
  head('Music', '#FF375F', when('playing', column({ width: 34 }, bars('0.5,0.9,0.6,1,0.4,0.8', { height: 16, gap: 2, color: '#FF375F', animate: true })))),
  row({ gap: 14 },
    image('{art}', { size: 60, radius: 12 }),
    column({ gap: 3, grow: true },
      text('{track}', { size: 20, weight: 'semibold' }),
      text('{artist}', { size: 13, color: GREY }))),
  column({ gap: 6 },
    slider('pos', { color: '#FFFFFF', height: 8 }),
    row({ justify: 'between' }, text('{posLabel}', { size: 12, color: GREY, mono: true }), text('-{remLabel}', { size: 12, color: GREY, mono: true }))),
  row({ gap: 8 },
    button('music:prev', undefined, { icon: 'skip-back', shape: 'circle', color: '#FFFFFF', tint: true }),
    button('music:toggle', undefined, { icon: '{playIcon}', shape: 'circle', color: '#FFFFFF', textColor: '#000000' }),
    button('music:next', undefined, { icon: 'skip-forward', shape: 'circle', color: '#FFFFFF', tint: true })),
);

const wallet = column({ gap: 14 },
  head('Wallet', '#30D158', text('{chg}', { size: 14, weight: 'semibold', color: '#30D158', mono: true })),
  row({ gap: 12 },
    column({ width: 46, height: 46, radius: 23, background: '#F7931A', align: 'center', justify: 'center' }, text('₿', { size: 26, weight: 'semibold', color: '#FFFFFF' })),
    column({ gap: 1 },
      text('Bitcoin', { size: 14, weight: 'bold', color: GREY }),
      text('${price}', { size: 24, weight: 'semibold', mono: true })),
    column({ grow: true }, line('{spark}', { height: 46, color: '#30D158', fill: true }))),
  row({ justify: 'between', padding: 14, radius: 18, gradient: ['#1C1C1E', '#16241B'] },
    row({ gap: 4 }, text('Your', { size: 14, color: GREY }), text('BTC', { size: 14, weight: 'bold', color: '#F7931A' }), text('balance', { size: 14, color: GREY })),
    text('${bal}', { size: 15, weight: 'semibold', mono: true })),
  when('!bought', chips('amt', ['$100', '$200', '$500', '$1K'], { values: ['100', '200', '500', '1000'], color: '#30D158' })),
  when('!bought', row({ gap: 10 },
    button('wallet:sell', 'Sell ${amt}', { color: '#3A3A3C', textColor: '#FFFFFF', confirm: 'Sell ${amt}?' }),
    button('wallet:buy', 'Buy ${amt}', { color: '#30D158', textColor: '#000000', confirm: 'Tap to pay ${amt}' }))),
  when('bought', row({ gap: 12, padding: 12, radius: 20, background: '#30D15824' },
    column({ width: 40, height: 40, radius: 20, background: '#30D158', align: 'center', justify: 'center' }, { type: 'icon', name: 'check', size: 22, color: '#000000' }),
    column({ gap: 1, grow: true }, text('{doneTitle}', { size: 15, weight: 'semibold' }), text('{doneSub}', { size: 12, color: GREY })),
    column({ width: 76 }, button('wallet:done', 'Done', { color: '#30D158', tint: true })))),
);

const home = column({ gap: 12 },
  head('Home', '#FF9F0A', text('{homeSummary}', { size: 13, weight: 'semibold', color: GREY })),
  row({ gap: 10 },
    toggle('light', 'Lights', { icon: 'bulb', color: '#FFD60A' }),
    toggle('fan', 'Fan', { icon: 'refresh', color: '#5AC8FA' }),
    toggle('lock', 'Lock', { icon: 'lock', color: '#30D158' })),
  row({ gap: 10 }, slider('bright', { icon: 'sun', color: '#FFD60A', height: 44 }), column({ width: 44, align: 'end' }, text('{brightPct}', { size: 15, weight: 'semibold', mono: true }))),
  row({ gap: 10 }, slider('temp', { icon: 'thermo', color: '#FF9F0A', height: 44 }), column({ width: 44, align: 'end' }, text('{tempLabel}', { size: 15, weight: 'semibold', mono: true }))),
);

const focus = column({ gap: 14 },
  head('Focus', '#FFB547', when('streak', text('{streak} today', { size: 13, weight: 'bold', color: GREY }))),
  when('!focusOn', column({ gap: 14 },
    row({ justify: 'between' },
      column({ width: 48 }, button('focus:minus', undefined, { icon: 'minus', shape: 'circle', color: '#FFB547', tint: true })),
      column({ gap: 0, align: 'center' },
        row({ align: 'baseline', gap: 4 }, text('{mins}', { size: 64, weight: 'semibold', mono: true }), text('min', { size: 18, weight: 'bold', color: GREY })),
        text('Deep work · no notifications', { size: 12, color: GREY })),
      column({ width: 48 }, button('focus:plus', undefined, { icon: 'plus', shape: 'circle', color: '#FFB547', tint: true }))),
    chips('mins', ['15', '25', '45', '60'], { color: '#FFB547' }),
    button('focus:start', 'Start focus', { icon: 'play', color: '#FFB547', textColor: '#000000' }))),
  when('focusOn', column({ gap: 16 },
    row({ gap: 18 },
      ring('{focusP}', { size: 72, thickness: 6, color: '#FFB547', track: '#2C2C2E' }),
      column({ gap: 2, grow: true },
        timer('{focusEnd}', { style: { size: 46, weight: 'semibold' } }),
        text('{focusLabel}', { size: 13, color: GREY }))),
    row({ gap: 10 },
      button('focus:add', '+5 min', { color: '#FFB547', tint: true }),
      button('focus:stop', 'End', { icon: 'stop', color: '#FF453A', tint: true, confirm: 'End early?' })))),
);

const ride = column({ gap: 14 },
  head('Ride', '#FFFFFF', when('rideOn', text('{rideEta}', { size: 15, weight: 'semibold', mono: true }))),
  when('!rideOn', column({ gap: 14 },
    row({ gap: 12 },
      column({ width: 40, height: 40, radius: 20, background: '#2C2C2E', align: 'center', justify: 'center' }, { type: 'icon', name: 'location', size: 20, color: '#FFFFFF' }),
      column({ gap: 1, grow: true }, text('Indiranagar Metro', { size: 16, weight: 'bold' }), text('12 min · 4.2 km from Home', { size: 12, color: GREY }))),
    chips('rideType', ['Auto ₹89', 'Go ₹142', 'XL ₹230'], { values: ['Auto', 'Go', 'XL'], color: '#FFFFFF' }),
    button('ride:book', 'Book {rideType}', { icon: 'car', color: '#FFFFFF', textColor: '#000000' }))),
  when('rideOn', column({ gap: 14 },
    row({ justify: 'between', align: 'start' },
      column({ gap: 3, grow: true }, text('{rideStatus}', { size: 21, weight: 'semibold', lines: 2 }), text('{rideCar}', { size: 12, color: GREY })),
      when('pin', column({ background: '#FFFFFF', radius: 12, padding: 8, gap: 0, align: 'center' },
        text('PIN', { size: 10, weight: 'semibold', color: '#000000' }),
        text('{pin}', { size: 18, weight: 'semibold', color: '#000000', mono: true })))),
    track('{rideP}', 'car', { color: '#FFFFFF', track: '#2C2C2E', height: 4 }),
    row({ gap: 10 },
      when('driver', button('ride:call', 'Call {driver}', { icon: 'phone', color: '#FFFFFF', textColor: '#000000' })),
      button('ride:cancel', 'Cancel', { color: '#FF453A', tint: true, confirm: 'Cancel ride?' })))),
);

const ai = column({ gap: 14 },
  head('Ask Halo', '#B9AEFF', when('aiThinking', fx(text('thinking…', { size: 13, weight: 'bold', color: '#B9AEFF' }), 'shimmer'))),
  row({ gap: 12, align: 'start', padding: 14, radius: 20, background: '#8B7CFF1F' },
    pet('{mood}', { size: 22, color: '#D9D2FF' }),
    column({ grow: true }, text('{answer}', { size: 15, lines: 6, color: '#F2F0FF' }))),
  chips('prompt', ['Plan my day', 'Fun fact', 'Haiku'], { values: ['plan', 'fact', 'haiku'], color: '#B9AEFF' }),
);

const weather = column({ gap: 10 },
  head('Weather', '#5AC8FA', text('Bengaluru', { size: 13, weight: 'semibold', color: GREY })),
  row({ justify: 'between', align: 'end' },
    text('24°', { size: 64, weight: 'semibold' }),
    column({ gap: 2, align: 'end' }, text('Partly cloudy', { size: 16, weight: 'bold' }), text('H 28°  L 19°  ·  UV 6', { size: 13, color: GREY }))),
  arc('{sun}', { height: 46, colors: ['#FF9F0A', '#FFD60A', '#FFF3B0'], thickness: 4 }),
  row({ justify: 'between' }, text('6:12', { size: 12, color: GREY, mono: true }), text('Golden hour in {golden}', { size: 12, weight: 'bold', color: '#FFD60A' }), text('18:21', { size: 12, color: GREY, mono: true })),
  bars('0.45,0.5,0.6,0.72,0.8,0.86,0.9,0.84,0.7,0.6,0.52,0.48', { height: 34, gap: 4, color: '#5AC8FA', active: 7 }),
);

const petScreen = column({ gap: 14, align: 'center' },
  row({ gap: 12 }, column({ width: 36 }, button('back', undefined, { icon: 'back', shape: 'circle', color: '#FFFFFF', tint: true })), spacer(), text('Halo', { size: 18, weight: 'semibold', color: '#FF5DA2' }), spacer(), column({ width: 36 })),
  pet('{mood}', { size: 64, color: '#FFFFFF' }),
  text('{petLine}', { size: 18, weight: 'semibold', align: 'center' }),
  chips('petMood', ['Happy', 'Love', 'Sleepy', 'Wink', 'Wow'], { values: ['happy', 'love', 'sleepy', 'wink', 'surprised'], color: '#FF5DA2' }),
);

export const osTemplate: IslandTemplate = {
  compact: {
    leading: pet('{mood}', { size: 20 }),
    trailing: row({ gap: 6 },
      when('tFocus', row({ gap: 6 }, ring('{focusP}', { size: 16, thickness: 2.5, color: '#FFB547' }), timer('{focusEnd}', { style: { size: 15, weight: 'semibold', color: '#FFB547' } }))),
      when('tRide', row({ gap: 6 }, { type: 'icon', name: 'car', size: 16, color: '#FFFFFF' }, text('{rideEta}', { size: 15, weight: 'semibold', mono: true }))),
      when('tMusic', row({ gap: 8 }, image('{art}', { size: 20, radius: 6 }), column({ width: 26 }, bars('0.5,0.9,0.6,1,0.4', { height: 14, gap: 2, color: '#FF375F', animate: true })))),
      when('tHi', text('{hello}', { size: 15, weight: 'semibold', color: '#FFFFFF' }))),
  },
  minimal: pet('{mood}', { size: 16 }),
  expanded: launcher,
  screens: { music, wallet, home, focus, ride, ai, weather, pet: petScreen },
  theme: { accent: C.violet, radius: 44 },
  motion: 'island',
};

const GREETINGS: [number, string][] = [[5, 'Up late?'], [12, 'Good morning'], [17, 'Good afternoon'], [22, 'Good evening'], [24, 'Up late?']];

export function initialOS(): IslandState {
  const now = new Date();
  const hour = now.getHours();
  const t = TRACKS[0];
  return {
    mood: 'idle', petMood: 'idle', hello: 'hi',
    greeting: GREETINGS.find(([h]) => hour < h)![1],
    subtitle: 'Eight apps. Zero screens.',
    clock: now.toTimeString().slice(0, 5),
    date: now.toDateString().slice(0, 10),
    // Music
    trackIndex: 0, ...t, playing: false, playIcon: 'play', pos: 0.18, posLabel: fmt(0.18 * t.dur), remLabel: fmt(0.82 * t.dur),
    // Wallet
    price: '81,959.82', priceNum: 81959.82, chg: '+7.22%', spark: SPARK.join(','), amt: '200', bal: '23,497.32', balNum: 23497.32, bought: false,
    // Home
    light: true, fan: false, lock: true, bright: 0.7, brightPct: '70%', temp: 0.43, tempLabel: '22°', homeSummary: '1 on · Locked',
    // Focus
    mins: '25', focusOn: false, focusP: 1, focusEnd: 0, focusLabel: '', streak: 0,
    // Ride
    rideType: 'Go', rideOn: false, rideP: 0,
    // AI
    prompt: '', answer: 'Hi! I live up here. Pick a prompt and I’ll think out loud.', aiThinking: false,
    // Weather
    sun: 0.62, golden: '1h 40m',
    // Pet
    petLine: 'Touch anywhere. I’m watching.',
    tHi: true,
  };
}

const SPARK = [0.32, 0.3, 0.38, 0.35, 0.42, 0.4, 0.48, 0.45, 0.52, 0.5, 0.6, 0.56, 0.62, 0.66, 0.63, 0.72, 0.7, 0.78];

export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
