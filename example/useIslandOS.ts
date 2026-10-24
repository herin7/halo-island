/**
 * The brains behind Island OS. The island only emits action strings ("music:toggle",
 * "change:amt", "ride:book"); this hook answers by patching state. One 1s clock drives music,
 * the BTC ticker, the focus ring and the clock.
 */
import { IslandState, LiveIsland, island, onAction } from 'halo-island';
import { useEffect, useRef } from 'react';

import { TRACKS, fmt, initialOS, osTemplate } from './os';

const OS_ID = 'os';
const ANSWERS: Record<string, string> = {
  plan: '9:30 deep work (25 min focus) · 1:00 lunch walk · 4:00 inbox zero · 7:00 gym. I’ll nudge you from up here.',
  fact: 'Octopuses have three hearts, and two of them stop beating when they swim. Relatable.',
  haiku: 'A pill of black glass / wakes, stretches into a world — / then folds back to sleep.',
};
const PET_LINES: Record<string, string> = {
  idle: 'Touch anywhere. I’m watching.', happy: 'Best. Day. Ever.', love: 'You’re my favourite human.',
  sleepy: 'Five more minutes…', wink: 'Our little secret.', surprised: 'Whoa, what was that?!',
};

/** Which compact trailing shows: focus beats ride beats music beats "hi". */
function derive(s: IslandState): IslandState {
  const mood = s.flash || (s.aiThinking ? 'thinking' : s.focusOn ? 'focused' : s.asleep ? 'sleepy' : s.playing && s.petMood === 'idle' ? 'happy' : s.petMood || 'idle');
  const tFocus = !!s.focusOn;
  const tRide = !tFocus && !!s.rideOn;
  const tMusic = !tFocus && !tRide && !!s.playing;
  return { mood, tFocus, tRide, tMusic, tHi: !tFocus && !tRide && !tMusic };
}

let live: LiveIsland | null = null;
let lastTouch = Date.now();

/** Patches the OS island, re-deriving mood and the compact trailing. */
function set(patch: IslandState, alert?: boolean) {
  if (!live) return;
  const next = { ...live.state, ...patch };
  live.update({ ...patch, ...derive(next) }, alert ? { alert: true } : undefined);
}

let flashTimer: ReturnType<typeof setTimeout> | undefined;
/** A mood for a moment (happy after a purchase, surprised when woken), then back to normal. */
function flash(mood: string, ms = 2200) {
  clearTimeout(flashTimer);
  set({ flash: mood });
  flashTimer = setTimeout(() => set({ flash: '' }), ms);
}

/** Root touch handler calls this: wakes the pet if it dozed off. */
export function poke() {
  lastTouch = Date.now();
  if (live?.state.asleep) { set({ asleep: false }); flash('surprised', 1100); }
}

/** Opens the island on its launcher (an alert pops it open). */
export const openOS = () => set({}, true);
export const setPetMood = (petMood: string) => { set({ petMood, petLine: PET_LINES[petMood] ?? PET_LINES.idle }); flash(petMood, 1600); };
/** Brings the OS back to the front after a showcase took the island. */
export const osId = OS_ID;

export function useIslandOS() {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stream = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    const start = initialOS();
    // In-app only: it's an app, not a Live Activity, and it updates every second.
    live = island(osTemplate).start({ ...start, ...derive(start) }, { id: OS_ID, system: false });
    // Say hi, then show off the launcher once.
    const hello = setTimeout(() => flash('happy', 1800), 900);
    return () => { clearTimeout(hello); live?.end(); live = null; };
  }, []);

  // The clock.
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      if (!live) return;
      const s = live.state;
      const patch: IslandState = {};
      const now = new Date();
      if (n++ % 10 === 0) patch.clock = now.toTimeString().slice(0, 5);
      if (s.playing) {
        const dur = Number(s.dur);
        const pos = Number(s.pos) + 1 / dur;
        if (pos >= 1) Object.assign(patch, trackPatch(Number(s.trackIndex) + 1));
        else Object.assign(patch, { pos: Math.round(pos * 1000) / 1000, posLabel: fmt(pos * dur), remLabel: fmt((1 - pos) * dur) });
      }
      if (n % 2 === 0) {
        const price = Number(s.priceNum) * (1 + (Math.random() - 0.42) * 0.0016);
        const spark = String(s.spark).split(',').map(Number).slice(1);
        spark.push(Math.min(0.95, Math.max(0.05, spark[spark.length - 1] + (price - Number(s.priceNum)) / 400)));
        Object.assign(patch, { priceNum: price, price: money(price), chg: `+${(7.22 + (price - 81959.82) / 819.6).toFixed(2)}%`, spark: spark.map((v) => v.toFixed(3)).join(',') });
      }
      if (s.focusOn) {
        const left = Number(s.focusEnd) - Date.now();
        if (left <= 0) {
          Object.assign(patch, { focusOn: false, focusP: 1, streak: Number(s.streak) + 1, focusLabel: '' });
          set(patch, true);
          flash('love', 3000);
          return;
        }
        patch.focusP = Math.round((left / Number(s.focusTotal)) * 1000) / 1000;
      }
      // Nobody around for a while: the pet dozes off.
      if (!s.asleep && !s.focusOn && Date.now() - lastTouch > 25000) patch.asleep = true;
      if (Object.keys(patch).length) set(patch);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Every in-island operation lands here.
  useEffect(() => onAction((id, action, s) => {
    if (id !== OS_ID) return;
    lastTouch = Date.now();
    const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    switch (action) {
      // Music
      case 'music:toggle': return set({ playing: !s.playing, playIcon: s.playing ? 'play' : 'pause' });
      case 'music:next': return set({ ...trackPatch(Number(s.trackIndex) + 1), playing: true, playIcon: 'pause' });
      case 'music:prev': return set({ ...trackPatch(Number(s.trackIndex) + TRACKS.length - 1), playing: true, playIcon: 'pause' });
      case 'change:pos': {
        const dur = Number(s.dur), pos = Number(s.pos);
        return set({ posLabel: fmt(pos * dur), remLabel: fmt((1 - pos) * dur) });
      }
      // Wallet
      case 'wallet:buy':
      case 'wallet:sell': {
        const amt = Number(s.amt), buy = action === 'wallet:buy';
        const btc = (amt / Number(s.priceNum)).toFixed(5);
        const bal = Number(s.balNum) + (buy ? amt : -amt);
        flash(buy ? 'love' : 'happy', 2600);
        return set({ bought: true, doneTitle: `${buy ? 'Bought' : 'Sold'} ${btc} BTC`, doneSub: `$${amt} at $${s.price} · just now`, balNum: bal, bal: money(bal) });
      }
      case 'wallet:done': return set({ bought: false });
      // Home
      case 'change:light':
      case 'change:fan':
      case 'change:lock': {
        const count = [s.light, s.fan].filter(Boolean).length;
        return set({ homeSummary: `${count} on · ${s.lock ? 'Locked' : 'Unlocked'}` });
      }
      case 'change:bright': return set({ brightPct: `${Math.round(Number(s.bright) * 100)}%` });
      case 'change:temp': return set({ tempLabel: `${Math.round(16 + Number(s.temp) * 14)}°` });
      // Focus
      case 'focus:minus': return set({ mins: String(Math.max(5, Number(s.mins) - 5)) });
      case 'focus:plus': return set({ mins: String(Math.min(120, Number(s.mins) + 5)) });
      case 'focus:start': {
        const total = Number(s.mins) * 60_000;
        flash('focused', 900);
        return set({ focusOn: true, focusEnd: Date.now() + total, focusTotal: total, focusP: 1, focusLabel: `${s.mins} min · notifications held` });
      }
      case 'focus:add': return set({ focusEnd: Number(s.focusEnd) + 300_000, focusTotal: Number(s.focusTotal) + 300_000 });
      case 'focus:stop': flash('sad', 1600); return set({ focusOn: false, focusP: 1 });
      // Ride
      case 'ride:book': {
        clearTimers(timers.current);
        set({ rideOn: true, rideStatus: 'Finding your driver…', rideCar: `Uber ${s.rideType} · matching nearby`, rideEta: '…', rideP: 0.04, pin: '', driver: '' });
        later(2200, () => { flash('happy'); set({ rideStatus: 'Asha is 4 min away', rideCar: 'Swift Dzire · White · KA 05 MN 2231', pin: '4821', driver: 'Asha', rideEta: '4 min', rideP: 0.2 }, true); });
        later(5200, () => set({ rideStatus: 'Asha is 2 min away', rideEta: '2 min', rideP: 0.55 }));
        later(8200, () => set({ rideStatus: 'Asha is around the corner', rideEta: '1 min', rideP: 0.82 }));
        later(11000, () => { flash('surprised', 1500); set({ rideStatus: 'Asha is here', rideEta: 'Here', rideP: 1 }, true); });
        return;
      }
      case 'ride:cancel': clearTimers(timers.current); flash('sad', 1600); return set({ rideOn: false, rideP: 0 });
      case 'ride:call': return flash('wink', 1200);
      // AI
      case 'change:prompt': {
        clearInterval(stream.current);
        set({ aiThinking: true, answer: '' });
        later(1100, () => {
          const words = (ANSWERS[String(s.prompt)] ?? '').split(' ');
          let i = 0;
          set({ aiThinking: false });
          stream.current = setInterval(() => {
            i++;
            set({ answer: words.slice(0, i).join(' ') });
            if (i >= words.length) { clearInterval(stream.current); flash('happy', 1500); }
          }, 70);
        });
        return;
      }
      // Pet
      case 'change:petMood': return setPetMood(String(s.petMood));
    }
  }), []);

  useEffect(() => () => { clearTimers(timers.current); clearInterval(stream.current); }, []);
}

function trackPatch(i: number): IslandState {
  const index = i % TRACKS.length;
  const t = TRACKS[index];
  return { trackIndex: index, ...t, pos: 0, posLabel: '0:00', remLabel: fmt(t.dur) };
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clearTimers = (list: ReturnType<typeof setTimeout>[]) => { list.forEach(clearTimeout); list.length = 0; };
