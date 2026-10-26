/**
 * End-to-end sealing for the relay, the same bytes as daily/seal.ts on the phone:
 *   keys:    HKDF-SHA256(secret, salt "halo-relay-v1") → info "enc" (32 bytes), info "channel" (16 bytes)
 *   sealed:  nonce(12) ‖ AES-256-GCM(ciphertext ‖ tag(16)), AAD = channel + ":" + kind
 * The secret (32 random bytes) lives only on your PC and phone; it travels once, in the pairing QR.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const SALT = Buffer.from('halo-relay-v1');

export function keys(secretB64) {
  const secret = Buffer.from(secretB64, 'base64url');
  return {
    enc: Buffer.from(hkdfSync('sha256', secret, SALT, 'enc', 32)),
    channel: Buffer.from(hkdfSync('sha256', secret, SALT, 'channel', 16)).toString('hex'),
  };
}

export function seal(k, kind, bytes) {
  const nonce = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k.enc, nonce);
  c.setAAD(Buffer.from(`${k.channel}:${kind}`));
  return Buffer.concat([nonce, c.update(bytes), c.final(), c.getAuthTag()]);
}

/** Throws on anything tampered with, replayed into another kind, or sealed with another key. */
export function open(k, kind, sealed) {
  const nonce = sealed.subarray(0, 12), tag = sealed.subarray(sealed.length - 16), body = sealed.subarray(12, sealed.length - 16);
  const d = createDecipheriv('aes-256-gcm', k.enc, nonce);
  d.setAAD(Buffer.from(`${k.channel}:${kind}`));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]);
}

export const sealJson = (k, kind, obj) => seal(k, kind, Buffer.from(JSON.stringify({ t: Date.now(), ...obj }))).toString('base64url');
export const openJson = (k, kind, text) => JSON.parse(open(k, kind, Buffer.from(text, 'base64url')).toString('utf8'));
