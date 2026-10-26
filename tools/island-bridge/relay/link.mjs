/**
 * The bridge's side of the relay: pushes your sealed desk state when it changes, picks up the
 * phone's sealed commands, and puts files where the phone can fetch them. Everything that leaves
 * this machine is sealed first (seal.mjs); the relay only ever sees ciphertext.
 */
import { keys, open, openJson, seal, sealJson } from './seal.mjs';

const POLL_MS = 2_000;
/** Commands older than this are refused: a captured one can't be replayed later. */
const MAX_AGE_MS = 10 * 60_000;

export function startRelay({ url, key, secret }, { state, onCommand, log = () => {} }) {
  const k = keys(secret);
  const base = `${url}/${k.channel}`;
  const headers = { 'x-relay-key': key };
  const seen = new Set();
  let pushTimer;
  let failures = 0;

  async function push() {
    const res = await fetch(`${base}/state`, { method: 'POST', headers, body: sealJson(k, 'state', { state: state() }) }).catch(() => null);
    if (!res?.ok) log('relay: state push failed');
  }

  async function poll() {
    try {
      const res = await fetch(`${base}/in`, { headers });
      if (!res.ok) throw new Error(String(res.status));
      for (const { k: id, v } of await res.json()) {
        // Delete first: a command that breaks the handler must not loop forever.
        await fetch(`${base}/in/${id}`, { method: 'DELETE', headers }).catch(() => {});
        let msg;
        try { msg = openJson(k, 'in', v); } catch { log('relay: dropped a command that failed to open'); continue; }
        if (seen.has(msg.id) || Math.abs(Date.now() - msg.t) > MAX_AGE_MS) continue;
        seen.add(msg.id);
        if (seen.size > 500) seen.delete(seen.values().next().value);
        await onCommand(msg);
      }
      failures = 0;
    } catch {
      if (++failures === 3) log('relay: unreachable, retrying');
    }
    setTimeout(poll, failures > 3 ? 15_000 : POLL_MS);
  }

  poll();
  push();
  return {
    /** Debounced: a burst of hook events becomes one push. */
    changed() { clearTimeout(pushTimer); pushTimer = setTimeout(push, 300); },
    /** A file for the phone, sealed. Over the relay files are capped at 4 MB. */
    async putFile(id, data) {
      if (data.length > 4 * 1024 * 1024) return false;
      const res = await fetch(`${base}/f/${id}`, { method: 'PUT', headers: { ...headers, 'content-type': 'application/octet-stream' }, body: seal(k, 'file', data) }).catch(() => null);
      return !!res?.ok;
    },
    /** A file the phone uploaded (sealed), opened. */
    async getFile(id) {
      const res = await fetch(`${base}/f/${id}`, { headers });
      if (!res.ok) throw new Error(`relay said ${res.status}`);
      return open(k, 'file', Buffer.from(await res.arrayBuffer()));
    },
  };
}
