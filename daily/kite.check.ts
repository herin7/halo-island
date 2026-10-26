// Run: bun daily/kite.check.ts
const assert = { equal: (a: unknown, b: unknown) => { if (a !== b) throw new Error(`expected ${String(b)}, got ${String(a)}`); } };

import { addPoint, nextOpen, nextSixAm, pulse, requestToken, rupees, sparkline, summarize } from './kite';

// The redirect only counts when it succeeded.
assert.equal(requestToken('https://127.0.0.1/halo?action=login&type=login&status=success&request_token=abc123'), 'abc123');
assert.equal(requestToken('https://127.0.0.1/halo?request_token=abc123&status=cancelled'), null);
assert.equal(requestToken('https://kite.zerodha.com/connect/login?v=3&api_key=k'), null);

// Session ends at the next 6 AM: later today if before 6, else tomorrow.
const t = (h: number, d = 26) => new Date(2026, 9, d, h, 0).getTime();
assert.equal(nextSixAm(t(5)), t(6));
assert.equal(nextSixAm(t(9)), t(6, 27));

// Two holdings: 10 × ₹110 (bought ₹100, +₹2 today), 5 × ₹190 (bought ₹200, −₹10 today).
const p = summarize([
  { tradingsymbol: 'INFY', quantity: 10, average_price: 100, last_price: 110, close_price: 108, pnl: 100, day_change: 2, day_change_percentage: 1.85 },
  { tradingsymbol: 'TCS', quantity: 4, t1_quantity: 1, average_price: 200, last_price: 190, close_price: 200, pnl: -50, day_change: -10, day_change_percentage: -5 },
], [{ pnl: 120, quantity: 0 }, { pnl: -20, quantity: 2 }], 5000);
assert.equal(p.value, 2050);
assert.equal(p.invested, 2000);
assert.equal(p.pnl, 50);
assert.equal(p.dayPnl, -30); // 20 − 50
assert.equal(p.dayPct.toFixed(2), (-30 / 2080 * 100).toFixed(2));
assert.equal(p.positionsPnl, 100);
assert.equal(p.positions, 1); // the closed one doesn't count
assert.equal(p.movers[0].symbol, 'INFY');

assert.equal(rupees(1240000), '₹12.40L');
assert.equal(rupees(-860, true), '−₹860');
assert.equal(rupees(3210, true), '+₹3,210');

console.log('kite.check ok');

// Market pulse.
const mon = (h: number, m = 0) => new Date(2026, 9, 26, h, m).getTime(); // Mon 26 Oct 2026
const pf0 = { ...p, dayPct: 0.4 };
assert.equal(pulse(null, [], mon(9, 5))?.kind, 'pre'); // countdown even before today's login
assert.equal(pulse(null, ['2026-10-26:pre'], mon(9, 5)), null); // dismissed stays dismissed
assert.equal(pulse(pf0, [], mon(11)), null); // a calm day stays quiet
assert.equal(pulse({ ...p, dayPct: -1.7 }, [], mon(11))?.key, '2026-10-26:move-1');
assert.equal(pulse({ ...p, dayPct: 3.2 }, ['2026-10-26:move2'], mon(11)), null);
assert.equal(pulse(pf0, [], mon(15, 40))?.kind, 'close');
assert.equal(pulse(pf0, [], new Date(2026, 9, 25, 9, 5).getTime()), null); // Sunday
assert.equal(new Date(nextOpen(mon(16))).getDate(), 27);
assert.equal(new Date(nextOpen(new Date(2026, 9, 30, 16).getTime())).getDay(), 1); // Fri evening → Mon

let c = addPoint(null, '2026-10-26', 100);
c = addPoint(c, '2026-10-26', -100);
assert.equal(sparkline(c.pts), '1.000,0.000');
assert.equal(addPoint(c, '2026-10-27', 5).pts.length, 1);

console.log('pulse ok');
