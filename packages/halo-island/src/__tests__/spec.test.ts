import { expect, test } from 'bun:test';

import { column, expandArcFlags, fill, fontFor, num, row, text } from '../spec';

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
