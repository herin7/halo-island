/** Free, keyless feeds: Hacker News for news, Open-Meteo for weather, ipwho.is to find you once. */
import type { Npm, Release, Saved, Story, Weather } from './day';

const get = (url: string) => {
  const abort = new AbortController();
  const stall = setTimeout(() => abort.abort(), 12_000);
  return fetch(url, { signal: abort.signal }).finally(() => clearTimeout(stall)).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });
};

/** The front page, best first: 12 stories. */
export async function topStories(): Promise<Story[]> {
  const ids: number[] = (await get('https://hacker-news.firebaseio.com/v0/topstories.json')).slice(0, 12);
  const items = await Promise.all(ids.map((id) => get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).catch(() => null)));
  return items.filter(Boolean).map((i) => ({
    id: i.id,
    title: i.title,
    // Ask/Show HN posts have no link: the discussion is the story.
    url: i.url ?? `https://news.ycombinator.com/item?id=${i.id}`,
    points: i.score ?? 0,
    comments: i.descendants ?? 0,
    // RN's URL polyfill has no hostname; a regex does.
    site: i.url ? i.url.replace(/^\w+:\/\/(www\.)?/, '').split(/[/?#:]/)[0] : 'news.ycombinator.com',
  }));
}

export async function locate(): Promise<NonNullable<Saved['place']>> {
  const r = await get('https://ipwho.is/');
  if (!r.success) throw new Error('no location');
  return { lat: r.latitude, lon: r.longitude, city: r.city };
}

/** WMO weather codes → the sky the island draws. */
function sky(code: number, isDay: boolean): [string, string] {
  // ponytail: the sky art has no moon yet, so nights draw soft clouds instead of a sun.
  if (code === 0) return [isDay ? 'clear' : 'cloudy', isDay ? 'Clear' : 'Clear night'];
  if (code <= 2) return [isDay ? 'partly' : 'cloudy', 'Partly cloudy'];
  if (code === 3) return ['cloudy', 'Overcast'];
  if (code <= 48) return ['cloudy', 'Fog'];
  if (code <= 67 || (code >= 80 && code <= 82)) return ['rain', code <= 57 ? 'Drizzle' : 'Rain'];
  if (code <= 77 || code === 85 || code === 86) return ['cloudy', 'Snow'];
  return ['storm', 'Thunderstorm'];
}

export async function weather(place: NonNullable<Saved['place']>): Promise<Weather> {
  const r = await get(`https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`);
  const [s, label] = sky(r.current.weather_code, !!r.current.is_day);
  return { temp: Math.round(r.current.temperature_2m), high: Math.round(r.daily.temperature_2m_max[0]), low: Math.round(r.daily.temperature_2m_min[0]), sky: s, label, city: place.city };
}

/** Weekly/daily downloads, latest version and a 30-day curve for each of your packages. */
export async function npmStats(names: string[]): Promise<Npm[]> {
  return Promise.all(names.map(async (name) => {
    const pkg = encodeURIComponent(name).replace('%40', '@');
    const [week, day, month, latest] = await Promise.all([
      get(`https://api.npmjs.org/downloads/point/last-week/${pkg}`).catch(() => null),
      get(`https://api.npmjs.org/downloads/point/last-day/${pkg}`).catch(() => null),
      get(`https://api.npmjs.org/downloads/range/last-month/${pkg}`).catch(() => null),
      get(`https://registry.npmjs.org/${pkg}/latest`).catch(() => null),
    ]);
    return { name, week: week?.downloads ?? 0, day: day?.downloads ?? 0, version: latest?.version ?? '', month: (month?.downloads ?? []).map((d: { downloads: number }) => d.downloads) };
  }));
}

/** The latest release of each watched repo (unauthenticated GitHub: 60 calls an hour, plenty for a few repos). */
export async function latestReleases(repos: string[]): Promise<Release[]> {
  const out = await Promise.all(repos.map((repo) =>
    get(`https://api.github.com/repos/${repo}/releases/latest`)
      .then((r) => ({ repo, tag: r.tag_name as string, url: r.html_url as string, at: Date.parse(r.published_at) }))
      .catch(() => null)));
  return out.filter((r): r is Release => !!r);
}
