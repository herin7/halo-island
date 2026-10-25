import { expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dir, '..', '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const optionalPeers = Object.keys(pkg.peerDependenciesMeta).filter((name) => pkg.peerDependenciesMeta[name].optional);

test('reanimated is a peer npm never auto-installs', () => {
  // Each Reanimated minor supports a narrow React Native range, and npm auto-installs the newest
  // version in range, so a required peer breaks every project not on the newest React Native.
  expect(pkg.peerDependencies['react-native-reanimated']).toBe('>=4.0.0');
  expect(optionalPeers).toContain('react-native-reanimated');
});

test('optional peers other than reanimated are loaded so Metro can skip them', () => {
  const sources = readdirSync(join(root, 'src'))
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => readFileSync(join(root, 'src', f), 'utf8'))
    .join('\n');
  for (const name of optionalPeers.filter((n) => n !== 'react-native-reanimated')) {
    const quoted = `'${name}'`;
    const requires = sources.split(`require(${quoted})`).length - 1;
    const guarded = sources.match(new RegExp(`try \\{\\s*(?:const )?\\w+ = require\\(${quoted}\\)`, 'g'))?.length ?? 0;
    expect({ name, requires }).toEqual({ name, requires: guarded });
    expect(sources).not.toContain(`import(${quoted})`);
    expect(sources).not.toMatch(new RegExp(`from ${quoted}`));
  }
});
