import { expect, test } from 'bun:test';

import { DEFAULT_THEME, SIZES, button, chips, column, expandArcFlags, fill, fontFor, line, num, nums, on, pet, resolveTheme, row, scaleOf, slider, text, toggle, visible, when } from '../spec';

test('fill replaces placeholders and blanks missing keys', () => {
  expect(fill('{eta} min · {driver}', { eta: 4, driver: 'Asha' })).toBe('4 min · Asha');
  expect(fill('{missing}!', {})).toBe('!');
  expect(fill('{n}', { n: null })).toBe('');
});

test('num resolves numbers, placeholders and junk', () => {
  expect(num(0.4, {})).toBe(0.4);
  expect(num('{p}', { p: 0.75 })).toBe(0.75);
  expect(num('{p}', {})).toBe(0);
  expect(num('{p}', { p: 'abc' })).toBe(0);
});

test('builders accept an optional style and drop falsy children', () => {
  expect(row(text('a'), false, text('b'))).toEqual({ type: 'row', children: [text('a'), text('b')] });
  expect(column({ gap: 4 }, text('a'))).toEqual({ type: 'column', style: { gap: 4 }, children: [text('a')] });
});

test('fontFor picks the nearest weight, heavier on ties', () => {
  const fonts = { regular: 'R', bold: 'B' };
  expect(fontFor(fonts, 'regular')).toBe('R');
  expect(fontFor(fonts, 'medium')).toBe('R');
  expect(fontFor(fonts, 'semibold')).toBe('B');
  expect(fontFor(fonts, 'heavy')).toBe('B');
  expect(fontFor(undefined, 'bold')).toBeUndefined();
});

test('expandArcFlags splits packed arc flags and keeps other numbers', () => {
  expect(expandArcFlags('M20.378 5.835A27.267 27.267 0 0124 12.169V0')).toBe('M 20.378 5.835 A 27.267 27.267 0 0 1 24 12.169 V 0');
  expect(expandArcFlags('M0 0L-.5.5z')).toBe('M 0 0 L -.5 .5 z');
});

test('nums reads arrays and comma lists, skipping blanks', () => {
  expect(nums([0.2, '{a}'], { a: 0.5 })).toEqual([0.2, 0.5]);
  expect(nums('{uv}', { uv: '0.1, 0.4,,x' })).toEqual([0.1, 0.4, 0]);
  expect(nums('{missing}', {})).toEqual([]);
});

test('on treats empty, zero and "false" as off', () => {
  for (const v of [undefined, null, '', 0, false, 'false', '0']) expect(on(v)).toBe(false);
  for (const v of [1, 'yes', true, 'true', 0.5]) expect(on(v)).toBe(true);
});

test('visible honors show keys and !key inverts', () => {
  const n = text('x');
  expect(visible(n, {})).toBe(true);
  expect(visible(when('driver', n), {})).toBe(false);
  expect(visible(when('driver', n), { driver: 'Asha' })).toBe(true);
  expect(visible(when('!driver', n), {})).toBe(true);
  expect(visible(when('!paid', n), { paid: 'false' })).toBe(true);
  expect(visible(when('!paid', n), { paid: true })).toBe(false);
});

test('new builders produce the spec shapes', () => {
  expect(pet('happy', { size: 20 })).toEqual({ type: 'pet', mood: 'happy', size: 20 });
  expect(line('{h}', { fill: false })).toEqual({ type: 'line', values: '{h}', fill: false });
  expect(chips('tip', ['10%', '15%'], { values: ['10', '15'] })).toEqual({ type: 'chips', bind: 'tip', options: ['10%', '15%'], values: ['10', '15'] });
  expect(slider('volume', { icon: 'volume' })).toEqual({ type: 'slider', bind: 'volume', icon: 'volume' });
  expect(toggle('wifi', 'Wi-Fi')).toEqual({ type: 'toggle', bind: 'wifi', label: 'Wi-Fi' });
  expect(button('pay', 'Pay', { confirm: 'Pay ₹200?', shape: 'tile', icon: 'rupee' }))
    .toEqual({ type: 'button', action: 'pay', label: 'Pay', confirm: 'Pay ₹200?', shape: 'tile', icon: 'rupee' });
  expect(button('close', undefined, { shape: 'circle', icon: 'close' })).toEqual({ type: 'button', action: 'close', label: undefined, shape: 'circle', icon: 'close' });
});

test('default theme ships solid material, no aura', () => {
  expect(DEFAULT_THEME.material).toBe('solid');
  expect(DEFAULT_THEME.aura).toBe('');
});

test('size sets compact height and content scale; unset keeps the original look', () => {
  expect(resolveTheme({ size: 's' }, 'dark')?.compactHeight).toBe(SIZES.s.height);
  expect(resolveTheme({ size: 'l', compactHeight: 50 }, 'dark')?.compactHeight).toBe(SIZES.l.height);
  expect(resolveTheme({ compactHeight: 28 }, 'dark')?.compactHeight).toBe(28);
  expect(scaleOf({ size: 's' })).toBeLessThan(1);
  expect(scaleOf({})).toBe(1);
});

test('default theme rests visible and hides in fullscreen', () => {
  expect(DEFAULT_THEME.ghostOpacity).toBe(0.4);
  expect(DEFAULT_THEME.hideInFullscreen).toBe(true);
});
