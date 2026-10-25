// Run: bun daily/day.check.ts
const assert = { equal: (a: unknown, b: unknown) => { if (a !== b) throw new Error(`expected ${String(b)}, got ${String(a)}`); } };

import { addSteps, fresh, logFood, migrate, protein, proteinDue, roll, stepsToday } from './day';

const at = (h: number, d = 25) => new Date(2026, 9, d, h, 0).getTime();

// Steps: first reading is the baseline, then deltas, then a reboot keeps the count.
let s = { ...fresh(), day: '2026-10-25' };
s = addSteps(s, 10_000, at(8));
assert.equal(stepsToday(s), 0);
s = addSteps(s, 10_500, at(9));
assert.equal(stepsToday(s), 500);
assert.equal(s.steps.hours[9], 500);
s = addSteps(s, 200, at(10)); // rebooted
assert.equal(stepsToday(s), 700);

// Rollover archives yesterday and keeps counting from the last reading.
s = roll(s, at(7, 26));
assert.equal(s.history['2026-10-25'].steps, 700);
assert.equal(stepsToday(s), 0);
s = addSteps(s, 450, at(8, 26));
assert.equal(stepsToday(s), 250);

// Protein reminder: once per slot, only when behind pace.
s = logFood(s, 'Eggs ×2', 156, 13, at(9, 26));
assert.equal(protein(s), 13);
assert.equal(proteinDue(s, at(12, 26)), null);
assert.equal(proteinDue(s, at(13, 26)), '13'); // 13 g < 30% of 120
s = { ...s, nudged: ['13'] };
assert.equal(proteinDue(s, at(14, 26)), null);
s = logFood(s, 'Protein shake', 130, 60, at(16, 26));
assert.equal(proteinDue(s, at(17, 26)), null); // 73 g ≥ 60% of 120

// Custom reminder hours: two checks → 45% then 90%; off means never.
let r = { ...fresh(), prefs: { ...fresh().prefs, reminder: { on: true, hours: [20, 12] } } };
r = logFood(r, 'Shake', 130, 60, at(9));
assert.equal(proteinDue(r, at(12)), null); // 60 g ≥ 54 g (45% of 120)
assert.equal(proteinDue(r, at(20)), '20'); // 60 g < 108 g (90%)
assert.equal(proteinDue({ ...r, prefs: { ...r.prefs, reminder: { on: false, hours: [20] } } }, at(20)), null);

// Old saves gain new fields and cards, and keep the user's choices.
const old = migrate({ water: 3, prefs: { cards: [{ id: 'news', on: false }] } } as never);
assert.equal(old.water, 3);
assert.equal(old.prefs.cards[0].id, 'news');
assert.equal(old.prefs.cards[0].on, false);
assert.equal(old.prefs.cards.length, 10);
assert.equal(old.prefs.island.ask, true);

console.log('day.check ok');
