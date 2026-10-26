// Run: bun daily/seal.check.ts — phone and PC sealing must agree byte for byte.
import { randomBytes } from 'node:crypto';

import * as pc from '../tools/island-bridge/relay/seal.mjs';
import { keys, open, openJson, seal, sealJson } from './seal';

const assert = { equal: (a: unknown, b: unknown) => { if (a !== b) throw new Error(`expected ${String(b)}, got ${String(a)}`); } };
const random = (n: number) => new Uint8Array(randomBytes(n));
const secret = randomBytes(32).toString('base64url');

const phone = keys(secret);
const desk = pc.keys(secret);
assert.equal(phone.channel, desk.channel);

// PC → phone and phone → PC, JSON and raw bytes.
assert.equal(openJson<{ hi: string }>(phone, 'state', pc.sealJson(desk, 'state', { hi: 'from pc ₹ ✓ é' })).hi, 'from pc ₹ ✓ é');
assert.equal(pc.openJson(desk, 'in', sealJson(phone, 'in', { hi: 'from phone ₹ 🙂' }, random)).hi, 'from phone ₹ 🙂');
const file = random(100_000);
assert.equal(Buffer.from(open(phone, 'file', new Uint8Array(pc.seal(desk, 'file', Buffer.from(file))))).equals(Buffer.from(file)), true);

// Tampering, the wrong kind and the wrong key all fail.
const fails = (f: () => unknown) => { try { f(); return false; } catch { return true; } };
const sealed = seal(phone, 'in', new TextEncoder().encode('x'), random);
const bent = sealed.slice(); bent[20] ^= 1;
assert.equal(fails(() => open(phone, 'in', bent)), true);
assert.equal(fails(() => open(phone, 'state', sealed)), true);
assert.equal(fails(() => open(keys(randomBytes(32).toString('base64url')), 'in', sealed)), true);

console.log('seal.check ok');
