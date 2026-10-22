import { expect, test } from 'bun:test';

import { column, fill, num, row, text } from '../spec';

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
