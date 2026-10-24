/**
 * The brains behind Island OS (web port of example/useIslandOS.ts): the island emits action
 * strings, this answers by patching state — and may return `go:<screen>` to navigate.
 */
import type { IslandState } from 'halo-island';
import { useCallback, useEffect, useRef, useState } from 'react';

import { TRACKS, fmt, initialOS } from './os';

const PET_LINES: Record<string, string> = {
  idle: 'Move around. I’m watching.', happy: 'Best. Day. Ever.', love: 'You’re my favourite human.',
  sleepy: 'Five more minutes…', wink: 'Our little secret.', surprised: 'Whoa, what was that?!',
};

/** Mood and which live activity owns the compact trailing slot: timer, then ride, then music. */
function derive(s: IslandState): IslandState {
  const mood = s.flash || (s.timerOn ? 'focused' : s.asleep ? 'sleepy' : s.playing && s.petMood === 'idle' ? 'happy' : s.petMood || 'idle');
  const tTimer = !!s.timerOn;
  const tRide = !tTimer && !!s.rideOn;
  const tMusic = !tTimer && !tRide && !!s.playing;
  return { ...s, mood, tTimer, tRide, tMusic, tHi: !tTimer && !tRide && !tMusic };
}

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function trackPatch(i: number): IslandState {
  const index = i % TRACKS.length;
  const t = TRACKS[index];
  return { trackIndex: index, ...t, pos: 0, posLabel: '0:00', remLabel: fmt(t.dur) };
}

export function useOS() {
  const [raw, setRaw] = useState<IslandState>(initialOS);
  const ref = useRef(raw);
  ref.current = raw;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastTouch = useRef(Date.now());
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Eager ref so an action fired right after an input's write reads the new value.
  const set = useCallback((patch: IslandState) => { ref.current = { ...ref.current, ...patch }; setRaw(ref.current); }, []);
  const flash = useCallback((mood: string, ms = 2200) => {
    clearTimeout(flashTimer.current);
    set({ flash: mood });
    flashTimer.current = setTimeout(() => set({ flash: '' }), ms);
  }, [set]);
  const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
  const clearLater = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  // One clock: music position, gold ticker, timer ring, wall clock, and dozing off.
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      const s = ref.current;
      const patch: IslandState = {};
      if (n++ % 10 === 0) patch.clock = new Date().toTimeString().slice(0, 5);
      if (s.playing) {
        const dur = Number(s.dur);
        const pos = Number(s.pos) + 1 / dur;
        Object.assign(patch, pos >= 1 ? trackPatch(Number(s.trackIndex) + 1) : { pos: Math.round(pos * 1000) / 1000, posLabel: fmt(pos * dur), remLabel: fmt((1 - pos) * dur) });
      }
      if (n % 2 === 0) {
        const price = Number(s.priceNum) * (1 + (Math.random() - 0.42) * 0.0016);
        const spark = String(s.spark).split(',').map(Number).slice(1);
        spark.push(Math.min(0.95, Math.max(0.05, spark[spark.length - 1] + (price - Number(s.priceNum)) / 40)));
        Object.assign(patch, { priceNum: price, price: money(price), chg: `+${(1.84 + (price - 7412.5) / 74.1).toFixed(2)}%`, spark: spark.map((v) => v.toFixed(3)).join(','), bal: money(Number(s.gramsNum) * price) });
      }
      if (s.timerOn) {
        const left = Number(s.timerEnd) - Date.now();
        if (left <= 0) { Object.assign(patch, { timerOn: false, timerP: 1, streak: Number(s.streak) + 1 }); flash('love', 3000); }
        else patch.timerP = Math.round((left / Number(s.timerTotal)) * 1000) / 1000;
      }
      if (!s.asleep && !s.timerOn && Date.now() - lastTouch.current > 25000) patch.asleep = true;
      if (Object.keys(patch).length) set(patch);
    }, 1000);
    return () => { clearInterval(id); clearLater(); clearTimeout(flashTimer.current); };
  }, []);

  const poke = useCallback(() => {
    lastTouch.current = Date.now();
    if (ref.current.asleep) { set({ asleep: false }); flash('surprised', 1100); }
  }, []);

  const onAction = useCallback((action: string): string | void => {
    const s = ref.current;
    lastTouch.current = Date.now();
    switch (action) {
      case 'music:toggle': return set({ playing: !s.playing, playIcon: s.playing ? 'play' : 'pause' });
      case 'music:next': return set({ ...trackPatch(Number(s.trackIndex) + 1), playing: true, playIcon: 'pause' });
      case 'music:prev': return set({ ...trackPatch(Number(s.trackIndex) + TRACKS.length - 1), playing: true, playIcon: 'pause' });
      case 'change:pos': return set({ posLabel: fmt(Number(s.pos) * Number(s.dur)), remLabel: fmt((1 - Number(s.pos)) * Number(s.dur)) });
      case 'wallet:buy': {
        const amt = Number(s.amt);
        const added = amt / Number(s.priceNum);
        const grams = Number(s.gramsNum) + added;
        set({ gramsNum: grams, grams: grams.toFixed(3), gramsAdded: added.toFixed(3), bal: money(grams * Number(s.priceNum)) });
        flash('love', 2600);
        return 'go:paid';
      }
      case 'change:light':
      case 'change:fan':
      case 'change:lock': return set({ homeSummary: `${[s.light, s.fan].filter(Boolean).length} on · ${s.lock ? 'Locked' : 'Unlocked'}` });
      case 'change:bright': return set({ brightPct: `${Math.round(Number(s.bright) * 100)}%` });
      case 'timer:minus': return set({ mins: Math.max(1, Number(s.mins) - 1) });
      case 'timer:plus': return set({ mins: Math.min(60, Number(s.mins) + 1) });
      case 'timer:start': {
        const total = Number(s.mins) * 60_000;
        flash('focused', 900);
        return set({ timerOn: true, timerEnd: Date.now() + total, timerTotal: total, timerP: 1, timerLabel: `${s.mins} min · it’ll ping you here` });
      }
      case 'timer:add': return set({ timerEnd: Number(s.timerEnd) + 60_000, timerTotal: Number(s.timerTotal) + 60_000 });
      case 'timer:stop': flash('sad', 1600); return set({ timerOn: false, timerP: 1 });
      case 'ride:book': {
        clearLater();
        set({ rideOn: true, rideStatus: 'Finding your driver…', rideCar: `Uber ${s.rideType} · matching nearby`, rideEta: '…', rideP: 0.04, pin: '', driver: '' });
        later(2000, () => { flash('happy'); set({ rideStatus: 'Asha is 4 min away', rideCar: 'Swift Dzire · White · KA 05 MN 2231', pin: '4821', driver: 'Asha', rideEta: '4 min', rideP: 0.2 }); });
        later(5000, () => set({ rideStatus: 'Asha is 2 min away', rideEta: '2 min', rideP: 0.55 }));
        later(8000, () => set({ rideStatus: 'Around the corner', rideEta: '1 min', rideP: 0.82 }));
        later(11000, () => { flash('surprised', 1500); set({ rideStatus: 'Asha is here', rideEta: 'Here', rideP: 1 }); });
        return;
      }
      case 'ride:cancel': clearLater(); flash('sad', 2400); set({ rideOn: false, rideP: 0 }); return 'go:cancelled';
      case 'ride:call': return flash('wink', 1200);
      case 'change:petMood': set({ petLine: PET_LINES[String(s.petMood)] ?? PET_LINES.idle }); return flash(String(s.petMood), 1600);
    }
  }, []);

  return { state: derive(raw), setState: set, onAction, poke, flash };
}
