/**
 * Zerodha Kite on the island, with the free Kite Connect Personal API: holdings, positions and
 * funds (no market-data feed; holdings carry their own last and close prices, enough for value and
 * day P&L). Your own API key and secret from developers.kite.trade stay on this phone. Kite ends
 * every session at 6 AM (exchange rule), so you log in once a day, inside the app.
 */
const API = 'https://api.kite.trade';

export interface KiteAuth { apiKey: string; apiSecret: string; token: string; user: string; expiresAt: number }
export interface Mover { symbol: string; pct: number }
export interface Portfolio {
  value: number;
  invested: number;
  pnl: number;
  dayPnl: number;
  /** Day change as a share of yesterday's value. */
  dayPct: number;
  holdings: number;
  /** Today's P&L on open positions (intraday / F&O). */
  positionsPnl: number;
  positions: number;
  cash: number | null;
  /** Biggest moves today, best first. */
  movers: Mover[];
  at: number;
}

export const loginUrl = (apiKey: string) => `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(apiKey)}`;

/** The registered redirect URL comes back with `request_token=…&status=success`. */
export function requestToken(url: string): string | null {
  const m = url.match(/[?&]request_token=([^&#]+)/);
  return m && /[?&]status=success/.test(url) ? decodeURIComponent(m[1]) : null;
}

/** The next 6:00 AM after `now`, when Kite ends the session. */
export function nextSixAm(now = Date.now()) {
  const d = new Date(now);
  d.setHours(6, 0, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** `sha256` comes from platform.ts (Hermes has no WebCrypto). */
export async function exchange(apiKey: string, apiSecret: string, request: string, sha256: (s: string) => Promise<string>): Promise<KiteAuth> {
  const body = `api_key=${encodeURIComponent(apiKey)}&request_token=${encodeURIComponent(request)}&checksum=${await sha256(apiKey + request + apiSecret)}`;
  const res = await fetch(`${API}/session/token`, { method: 'POST', headers: { 'X-Kite-Version': '3', 'content-type': 'application/x-www-form-urlencoded' }, body });
  const r = await res.json();
  if (!res.ok || !r.data?.access_token) throw new Error(r.message ?? `Kite said ${res.status}`);
  return { apiKey, apiSecret, token: r.data.access_token, user: r.data.user_shortname || r.data.user_name || r.data.user_id, expiresAt: nextSixAm() };
}

export class KiteExpired extends Error {}

async function get(a: KiteAuth, path: string) {
  const res = await fetch(`${API}${path}`, { headers: { 'X-Kite-Version': '3', authorization: `token ${a.apiKey}:${a.token}` } });
  const r = await res.json().catch(() => ({}));
  if (res.status === 403 || r.error_type === 'TokenException') throw new KiteExpired('Kite session ended');
  if (!res.ok) throw new Error(r.message ?? `Kite said ${res.status}`);
  return r.data;
}

interface Holding { tradingsymbol: string; quantity: number; t1_quantity?: number; average_price: number; last_price: number; close_price: number; pnl: number; day_change: number; day_change_percentage: number }
interface Position { pnl: number; quantity: number }

/** Totals from Kite's raw holdings and positions. Pure, so it's easy to check. */
export function summarize(holdings: Holding[], positions: Position[], cash: number | null, now = Date.now()): Portfolio {
  let value = 0, invested = 0, pnl = 0, dayPnl = 0;
  for (const h of holdings) {
    const qty = h.quantity + (h.t1_quantity ?? 0);
    value += qty * h.last_price;
    invested += qty * h.average_price;
    pnl += h.pnl;
    dayPnl += qty * h.day_change;
  }
  const yesterday = value - dayPnl;
  const movers = holdings
    .filter((h) => h.day_change_percentage)
    .sort((a, b) => b.day_change_percentage - a.day_change_percentage)
    .map((h) => ({ symbol: h.tradingsymbol, pct: h.day_change_percentage }));
  return {
    value, invested, pnl, dayPnl,
    dayPct: yesterday > 0 ? (dayPnl / yesterday) * 100 : 0,
    holdings: holdings.length,
    positionsPnl: positions.reduce((a, p) => a + p.pnl, 0),
    positions: positions.filter((p) => p.quantity !== 0).length,
    cash,
    // ponytail: top 2 gainers + top 2 losers is all the card shows.
    movers: movers.length > 4 ? [...movers.slice(0, 2), ...movers.slice(-2)] : movers,
    at: now,
  };
}

export async function portfolio(a: KiteAuth): Promise<Portfolio> {
  const [holdings, positions, margins] = await Promise.all([
    get(a, '/portfolio/holdings'),
    get(a, '/portfolio/positions'),
    get(a, '/user/margins/equity').catch(() => null),
  ]);
  return summarize(holdings ?? [], positions?.day ?? [], margins?.available?.live_balance ?? margins?.net ?? null);
}

/** ₹12.4L, ₹3,210, −₹860: Indian grouping, short for big numbers. */
export function rupees(n: number, sign = false) {
  const s = sign ? (n > 0 ? '+' : n < 0 ? '−' : '') : n < 0 ? '−' : '';
  const v = Math.abs(n);
  const body = v >= 1e7 ? `${(v / 1e7).toFixed(2)}Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(2)}L` : Math.round(v).toLocaleString('en-IN');
  return `${s}₹${body}`;
}

/** Market hours (NSE, Mon–Fri 9:15–15:30 local): refresh often then, rarely otherwise. */
export function marketOpen(now = Date.now()) {
  const d = new Date(now);
  const m = d.getHours() * 60 + d.getMinutes();
  return d.getDay() > 0 && d.getDay() < 6 && m >= 555 && m <= 930;
}

// region Market pulse: the island's moments around the trading day

/** Day P&L readings through the session, from our own polling: the curve Kite's free plan doesn't sell. */
export interface Curve { day: string; pts: number[] }

/** Adds a reading; a new day starts a new curve. Keeps it small: one point per poll, at most 80. */
export function addPoint(c: Curve | null, day: string, dayPnl: number): Curve {
  const pts = c?.day === day ? [...c.pts, dayPnl] : [dayPnl];
  return { day, pts: pts.slice(-80) };
}

/** The curve scaled 0–1 for the island's sparkline, with zero (yesterday's close) kept on the chart. */
export function sparkline(pts: number[]): string {
  if (pts.length < 2) return '';
  const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts);
  const span = hi - lo || 1;
  return pts.map((p) => ((p - lo) / span).toFixed(3)).join(',');
}

export type Pulse = { kind: 'pre' | 'close' | 'move'; key: string; step?: number } | null;

/** ±1.5% steps: crossing 1.5%, 3%, 4.5%… each pops the island once. */
export const MOVE_STEP = 1.5;

/**
 * What the market wants from you right now (weekdays only; ponytail: NSE holidays aren't known,
 * a holiday just shows a quiet pre-open):
 * pre-open 9:00–9:15, the closing bell 15:30–16:00, or a big move during the session.
 */
export function pulse(pf: Portfolio | null, seen: string[], now = Date.now()): Pulse {
  const d = new Date(now);
  if (d.getDay() === 0 || d.getDay() === 6) return null;
  const m = d.getHours() * 60 + d.getMinutes();
  const day = d.toLocaleDateString('en-CA');
  const fresh = (p: Pulse) => (p && !seen.includes(p.key) ? p : null);
  if (m >= 540 && m < 555) return fresh({ kind: 'pre', key: `${day}:pre` });
  if (m >= 930 && m < 960 && pf) return fresh({ kind: 'close', key: `${day}:close` });
  if (marketOpen(now) && pf) {
    const step = Math.floor(Math.abs(pf.dayPct) / MOVE_STEP) * Math.sign(pf.dayPct);
    if (step) return fresh({ kind: 'move', key: `${day}:move${step}`, step });
  }
  return null;
}

/** The next 9:15 open from `now` (today, or the next weekday). */
export function nextOpen(now = Date.now()) {
  const d = new Date(now);
  d.setHours(9, 15, 0, 0);
  while (d.getTime() <= now || d.getDay() === 0 || d.getDay() === 6) { d.setDate(d.getDate() + 1); d.setHours(9, 15, 0, 0); }
  return d.getTime();
}

// endregion

// region Preview: a believable sample portfolio for demos and screen recordings

const SAMPLE = [
  { symbol: 'RELIANCE', qty: 40, avg: 2410, close: 2905 }, { symbol: 'HDFCBANK', qty: 60, avg: 1480, close: 1652 },
  { symbol: 'INFY', qty: 80, avg: 1390, close: 1878 }, { symbol: 'TCS', qty: 20, avg: 3350, close: 4112 },
  { symbol: 'ITC', qty: 300, avg: 312, close: 468 }, { symbol: 'TATAMOTORS', qty: 120, avg: 620, close: 958 },
];
/** A smooth, deterministic wander through the session: the same moment always shows the same prices. */
// The market moves together (one shared swing) and each stock adds a little of its own.
const market = (m: number) => Math.sin(m / 40) * 0.009 + Math.sin(m / 13) * 0.003 + (m / 375) * 0.008;
const wander = (seed: number, minute: number) => market(minute) * (0.8 + (seed % 3) * 0.2) + Math.sin(minute / 9 + seed * 2.1) * 0.004;
const sessionMinute = (now: number) => {
  const d = new Date(now);
  return Math.max(0, Math.min(375, d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 - 555));
};

export function samplePortfolio(now = Date.now()): Portfolio {
  const m = sessionMinute(now);
  const holdings = SAMPLE.map((h, i) => {
    const last = +(h.close * (1 + wander(i + 1, m))).toFixed(2);
    return { tradingsymbol: h.symbol, quantity: h.qty, average_price: h.avg, last_price: last, close_price: h.close, pnl: (last - h.avg) * h.qty, day_change: last - h.close, day_change_percentage: ((last - h.close) / h.close) * 100 };
  });
  return summarize(holdings, [], 84_250, now);
}

/** The sample's day-P&L curve from the open until now, one point every 5 minutes. */
export function sampleCurve(now = Date.now()): Curve {
  const end = sessionMinute(now);
  const pts: number[] = [];
  const open = new Date(now); open.setHours(9, 15, 0, 0);
  for (let m = 0; m <= end; m += 5) pts.push(samplePortfolio(open.getTime() + m * 60_000).dayPnl);
  pts.push(samplePortfolio(now).dayPnl);
  return { day: new Date(now).toLocaleDateString('en-CA'), pts: pts.slice(-80) };
}

// endregion

/** The portfolio to show right now: the sample in preview, else today's real one (Kite logs out at 6 AM). */
export function livePortfolio(s: { kite: KiteAuth | null; kitePf: Portfolio | null; kiteDemo?: boolean }, now = Date.now()): Portfolio | null {
  if (s.kiteDemo) return samplePortfolio(now);
  return s.kite?.token && now < s.kite.expiresAt ? s.kitePf : null;
}
export const liveCurve = (s: { kiteCurve: Curve | null; kiteDemo?: boolean }, now = Date.now()) => (s.kiteDemo ? sampleCurve(now) : s.kiteCurve);

/** "closes in" / "opens in" for the market line. */
export function marketClock(now = Date.now()) {
  const d = new Date(now);
  const close = new Date(now); close.setHours(15, 30, 0, 0);
  return marketOpen(now) ? { open: true, label: 'Market open · closes in', at: close.getTime() } : { open: false, label: d.getDay() === 0 || d.getDay() === 6 ? 'Weekend · opens in' : 'Market closed · opens in', at: nextOpen(now) };
}
