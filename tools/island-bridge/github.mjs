/**
 * GitHub on the island: today's contributions and streak, PRs waiting for your review, and the
 * CI run for whatever you just pushed (from your events feed, or right away when Claude Code runs
 * `git push`). Token: GITHUB_TOKEN, else `gh auth token`. No token, no GitHub, nothing breaks.
 */
import { execFileSync } from 'node:child_process';

const API = 'https://api.github.com';
let token = process.env.GITHUB_TOKEN ?? '';
if (!token) try { token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}

const gh = (path, init = {}) => fetch(path.startsWith('http') ? path : API + path, {
  ...init,
  headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'halo-bridge', ...init.headers },
  signal: AbortSignal.timeout(15_000),
});

let publish = () => {};
const info = { login: '', today: 0, streak: 0, week: [], reviews: 0, ci: null };
let watching = null; // { repo, sha, since, branch }
let eventsTag = '';
let lastEventId = '';

async function profile() {
  const query = '{ viewer { login contributionsCollection { contributionCalendar { weeks { contributionDays { date contributionCount } } } } } }';
  const res = await gh('/graphql', { method: 'POST', body: JSON.stringify({ query }) });
  const v = (await res.json()).data?.viewer;
  if (!v) return;
  const all = v.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  const today = new Date().toLocaleDateString('en-CA');
  const upto = all.filter((d) => d.date <= today);
  // A streak survives a today that hasn't started yet.
  let streak = 0;
  for (let i = upto.length - 1; i >= 0; i--) {
    if (upto[i].contributionCount > 0) streak++;
    else if (i !== upto.length - 1) break;
  }
  const reviews = await gh(`/search/issues?q=${encodeURIComponent(`is:open is:pr review-requested:${v.login}`)}&per_page=1`).then((r) => r.json());
  Object.assign(info, { login: v.login, today: upto.at(-1)?.contributionCount ?? 0, streak, week: upto.slice(-7).map((d) => d.contributionCount), reviews: reviews.total_count ?? 0 });
  publish({ ...info });
}

/** New pushes by you, from the events feed. A 304 doesn't count against the rate limit. */
async function events() {
  if (!info.login) return;
  const res = await gh(`/users/${info.login}/events?per_page=10`, { headers: eventsTag ? { 'if-none-match': eventsTag } : {} });
  if (res.status !== 200) return;
  eventsTag = res.headers.get('etag') ?? '';
  const list = await res.json();
  const first = !lastEventId;
  const push = list.find((e) => e.type === 'PushEvent' && Number(e.id) > Number(lastEventId) && Date.now() - Date.parse(e.created_at) < 15 * 60_000);
  lastEventId = list[0]?.id ?? lastEventId;
  if (push && !first) watch(push.repo.name, push.payload.head, push.payload.ref?.replace('refs/heads/', ''));
}

/** Follows every workflow run for one commit until all of them finish. */
export function watch(repo, sha, branch = '') {
  if (!token || !repo || !sha) return;
  if (watching?.sha === sha) return;
  watching = { repo, sha, branch, since: Date.now() };
  info.ci = { repo: repo.split('/')[1], branch, title: 'Waiting for CI…', status: 'queued', conclusion: '', startedAt: Date.now(), url: `https://github.com/${repo}/actions`, done: 0, total: 0 };
  publish({ ...info });
}

async function poll() {
  if (!watching) return;
  const { repo, sha, since } = watching;
  const res = await gh(`/repos/${repo}/actions/runs?head_sha=${sha}&per_page=20`);
  const runs = (await res.json()).workflow_runs ?? [];
  if (!runs.length) {
    // No Actions on this repo (or nothing triggered): stop quietly.
    if (Date.now() - since > 3 * 60_000) { watching = null; info.ci = null; publish({ ...info }); }
    return;
  }
  const done = runs.filter((r) => r.status === 'completed');
  const failed = done.find((r) => !['success', 'skipped', 'neutral'].includes(r.conclusion));
  const finished = done.length === runs.length;
  const lead = failed ?? runs.find((r) => r.status !== 'completed') ?? runs[0];
  info.ci = {
    repo: repo.split('/')[1],
    branch: watching.branch || lead.head_branch,
    title: lead.display_title,
    workflow: lead.name,
    status: finished ? 'completed' : 'in_progress',
    conclusion: finished ? (failed ? 'failure' : 'success') : '',
    startedAt: Math.min(...runs.map((r) => Date.parse(r.run_started_at ?? r.created_at))),
    url: lead.html_url,
    done: done.length,
    total: runs.length,
  };
  publish({ ...info });
  if (finished) {
    watching = null;
    // The result stays up for a while, then the island goes back to your day.
    const shown = info.ci;
    setTimeout(() => { if (info.ci === shown) { info.ci = null; publish({ ...info }); } }, 10 * 60_000);
  }
}

/** Claude Code just pushed from `cwd`: watch that commit without waiting for the events feed. */
export function pushedFrom(cwd) {
  try {
    const git = (...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const remote = git('remote', 'get-url', 'origin').match(/github\.com[:/](.+?)(\.git)?$/)?.[1];
    if (remote) watch(remote, git('rev-parse', 'HEAD'), git('rev-parse', '--abbrev-ref', 'HEAD'));
  } catch {}
}

const safely = (fn) => () => fn().catch(() => {});

export function startGitHub(onChange) {
  if (!token) return false;
  publish = onChange;
  safely(profile)();
  setInterval(safely(profile), 10 * 60_000);
  setInterval(safely(events), 30_000);
  setInterval(safely(poll), 10_000);
  return true;
}
