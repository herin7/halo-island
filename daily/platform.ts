/**
 * Everything Halo needs from the phone, one API for both platforms. Android keeps its own tested
 * native module (step counter, Downloads, share sheet); iOS uses stock Expo modules, so there is
 * no custom Swift to break. Features iOS can't do (share-to-Halo, background keep-alive) are no-ops.
 */
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { Pedometer } from 'expo-sensors';
import * as Sharing from 'expo-sharing';
import { island, presets } from 'halo-island';
import { PermissionsAndroid, Platform, ToastAndroid } from 'react-native';

import { native } from './modules/halo-native';

export const ios = Platform.OS === 'ios';
const store = new File(Paths.document, 'halo.json');

// region Storage: one JSON blob per key

export function load(key: string): string | null {
  if (native) return native.load(key);
  try { return store.exists ? (JSON.parse(store.textSync())[key] ?? null) : null; } catch { return null; }
}

export function save(key: string, value: string) {
  if (native) return native.save(key, value);
  try {
    const all = store.exists ? JSON.parse(store.textSync()) : {};
    all[key] = value;
    store.write(JSON.stringify(all));
  } catch {}
}

// endregion

const toastIsland = island(presets.toast);
/** A short message: Android's toast, or the island itself on iOS. */
export function toast(message: string) {
  if (Platform.OS === 'android') return ToastAndroid.show(message, ToastAndroid.SHORT);
  toastIsland.show({ icon: 'check', title: message.length > 26 ? 'Halo' : message, message }, { duration: 2600 });
}

export const copy = (text: string) => (native ? native.copy(text) : Clipboard.setStringAsync(text).then(() => {}));
export const paste = (): Promise<string | null> => (native ? native.paste() : Clipboard.getStringAsync().then((t) => t || null));

export async function sha256(text: string): Promise<string> {
  if (native) return native.sha256(text);
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text, { encoding: Crypto.CryptoEncoding.HEX });
}

const b64url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const bytesToB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** PKCE verifier, its S256 challenge and a state, for "Sign in with Claude". */
export async function pkce(): Promise<{ verifier: string; challenge: string; state: string }> {
  if (native) return native.pkce();
  const verifier = b64url(bytesToB64(Crypto.getRandomBytes(32)));
  const challenge = b64url(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 }));
  return { verifier, challenge, state: b64url(bytesToB64(Crypto.getRandomBytes(32))) };
}

// region Steps

export type StepReading = { kind: 'counter'; total: number } | { kind: 'today'; steps: number };

/**
 * Android: the hardware counter (steps since boot; day.ts keeps the baseline).
 * iOS: Core Motion's count since midnight, which already is today's number.
 */
export async function watchSteps(on: (r: StepReading) => void): Promise<() => void> {
  if (Platform.OS === 'android') {
    if (!native?.hasStepSensor()) return () => {};
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION);
    if (r !== 'granted') return () => {};
    const sub = native.addListener('onSteps', (e) => on({ kind: 'counter', total: e.total }));
    native.watchSteps(true);
    return () => { sub.remove(); native?.watchSteps(false); };
  }
  if (!(await Pedometer.isAvailableAsync().catch(() => false))) return () => {};
  const midnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const read = () => Pedometer.getStepCountAsync(midnight(), new Date()).then((r) => on({ kind: 'today', steps: r.steps })).catch(() => {});
  await read();
  // The live count is relative to subscribing, so re-read today's total on each change instead.
  const sub = Pedometer.watchStepCount(() => { read(); });
  return () => sub.remove();
}

// endregion

// region Files

/** Saves bytes as a file and hands it to the system: Android's file viewer or iOS's share sheet. */
export async function keepFile(name: string, bytes: Uint8Array, mime: string): Promise<void> {
  const file = new File(Paths.cache, name.replace(/[\\/:*?"<>|]/g, '_') || 'file');
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name });
}

// endregion

export const keepAlive = () => native?.keepAlive();
/** Cryptographic randomness (expo-crypto: the OS generator on both platforms). */
export const random = (n: number) => Crypto.getRandomBytes(n);
export const canShareIn = Platform.OS === 'android' && !!native;
