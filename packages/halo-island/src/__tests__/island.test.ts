import { expect, mock, test } from 'bun:test';

// island.ts talks to expo + react-native; stub just what it touches so it runs under bun.
mock.module('expo', () => ({ requireOptionalNativeModule: () => null }));
mock.module('react-native', () => ({
  Platform: { OS: 'ios' },
  Appearance: { getColorScheme: () => 'dark' },
  AppRegistry: { registerHeadlessTask: () => {} },
  Image: { resolveAssetSource: () => null },
  // #RRGGBB -> 0xAARRGGBB like the real processColor.
  processColor: (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? (0xff000000 | parseInt(c.slice(1), 16)) >>> 0 : c),
}));

const { toNative, start, focus, setState, store, onAction, emitAction, endAll, springOf } = await import('../island');
const { text, button } = await import('../spec');

test('toNative strips screens, resolves theme for the scheme and normalizes colors', () => {
  const json = JSON.parse(toNative({
    compact: { leading: text('hi') },
    expanded: button('go:settings', 'Settings'),
    screens: { settings: text('deep') },
    theme: { accent: '#FF0000', dark: { background: '#101010' } },
  }));
  expect(json.screens).toBeUndefined();
  expect(json.theme).toEqual({ accent: '#ffff0000', background: '#ff101010' });
  expect(json.motion).toEqual({ stiffness: 340, damping: 30 });
});

test('springOf defaults to the island preset and honors none/custom', () => {
  expect(springOf(undefined)).toEqual({ stiffness: 340, damping: 30 });
  expect(springOf('none')).toBeNull();
  expect(springOf({ stiffness: 1, damping: 2 })).toEqual({ stiffness: 1, damping: 2 });
});

test('newest island owns the island; focus brings one back to the front', () => {
  endAll();
  start({ compact: {} }, {}, { id: 'a' });
  start({ compact: {} }, {}, { id: 'b' });
  expect(store.all().map((a) => a.id)).toEqual(['a', 'b']);
  focus('a');
  expect(store.all().map((a) => a.id)).toEqual(['b', 'a']);
  endAll();
});

test('setState merges input into state and handlers see it with the action', () => {
  endAll();
  const live = start({ compact: {} }, { tip: 10 }, { id: 'pay' });
  setState('pay', { tip: 20, note: 'thanks' });
  expect(live.state).toEqual({ tip: 20, note: 'thanks' });
  const seen: unknown[] = [];
  const off = onAction((id, action, state) => seen.push([id, action, state.tip]));
  const offOne = live.on('confirm', (state) => seen.push(['on', state.note]));
  emitAction('pay', 'confirm');
  off(); offOne();
  expect(seen).toEqual([['pay', 'confirm', 20], ['on', 'thanks']]);
  endAll();
});
