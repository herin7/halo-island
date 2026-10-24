/**
 * The web side of example/media.ts: the same glyph names (registerIcons) and Lottie names
 * ('lottie:confetti'), resolved to URLs by Vite. Files are only fetched when a template shows them.
 */
import { registerIcons } from '@halo/icons';

import { glyphs } from '../../../example/glyphs';

registerIcons(glyphs);

const url = (files: Record<string, string>, prefix: string) =>
  Object.fromEntries(Object.entries(files).map(([path, href]) => [prefix + path.split('/').pop()!.replace(/\.\w+$/, ''), href]));

const lotties = url(import.meta.glob('../../../example/assets/lottie/*.json', { eager: true, query: '?url', import: 'default' }), 'lottie:');

export type Asset = { kind: 'image' | 'lottie' | 'rive'; url: string };

export function resolveAsset(name: string): Asset | null {
  if (lotties[name]) return { kind: 'lottie', url: lotties[name] };
  if (/^(https?|data|blob):|^\//.test(name)) return { kind: /\.riv$/.test(name) ? 'rive' : /\.json$/.test(name) ? 'lottie' : 'image', url: name };
  return null;
}
