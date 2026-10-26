/**
 * End-to-end sealing for the relay, byte for byte the same as tools/island-bridge/relay/seal.mjs:
 *   keys:    HKDF-SHA256(secret, salt "halo-relay-v1") → info "enc" (32 bytes), info "channel" (16 bytes)
 *   sealed:  nonce(12) ‖ AES-256-GCM(ciphertext ‖ tag(16)), AAD = channel + ":" + kind
 * Pure JS (audited @noble), so it works on iOS and Android and ships over the air.
 */
import { gcm } from '@noble/ciphers/aes';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';

export interface Keys { enc: Uint8Array; channel: string }

// Hermes' TextDecoder support varies by version; UTF-8 both ways without it.
const utf8 = (s: string) => Uint8Array.from(unescape(encodeURIComponent(s)), (c) => c.charCodeAt(0));
const fromUtf8 = (b: Uint8Array) => { let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000)); return decodeURIComponent(escape(bin)); };
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export function bytesToB64url(b: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function keys(secret: string): Keys {
  const s = b64urlToBytes(secret);
  const salt = utf8('halo-relay-v1');
  return { enc: hkdf(sha256, s, salt, utf8('enc'), 32), channel: hex(hkdf(sha256, s, salt, utf8('channel'), 16)) };
}

/** `random` comes from the platform (expo-crypto); injected so this file stays testable. */
export function seal(k: Keys, kind: string, bytes: Uint8Array, random: (n: number) => Uint8Array): Uint8Array {
  const nonce = random(12);
  const ct = gcm(k.enc, nonce, utf8(`${k.channel}:${kind}`)).encrypt(bytes);
  const out = new Uint8Array(12 + ct.length);
  out.set(nonce);
  out.set(ct, 12);
  return out;
}

/** Throws on anything tampered with, moved to another kind, or sealed with another key. */
export function open(k: Keys, kind: string, sealed: Uint8Array): Uint8Array {
  return gcm(k.enc, sealed.subarray(0, 12), utf8(`${k.channel}:${kind}`)).decrypt(sealed.subarray(12));
}

export const sealJson = (k: Keys, kind: string, obj: object, random: (n: number) => Uint8Array) =>
  bytesToB64url(seal(k, kind, utf8(JSON.stringify({ t: Date.now(), ...obj })), random));
export const openJson = <T>(k: Keys, kind: string, text: string): T & { t: number } =>
  JSON.parse(fromUtf8(open(k, kind, b64urlToBytes(text))));
