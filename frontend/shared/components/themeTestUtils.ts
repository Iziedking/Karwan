import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export type TestColour = [number, number, number, number];
export const cssDeclarations = (body: string): Record<string, string> => Object.fromEntries(
  [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]),
);

export function themeTokens(theme: 'light' | 'dark') {
  const css = readFileSync(new URL('../../app/design-tokens.css', import.meta.url), 'utf8');
  const root = cssDeclarations(css.match(/:root\s*\{([\s\S]*?)\n\}/)![1]);
  return theme === 'light' ? root : {
    ...root, ...cssDeclarations(css.match(/html\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)![1]),
  };
}

export function tokenColour(tokens: Record<string, string>, name: string, depth = 0): TestColour {
  assert.ok(depth < 12, `Circular colour alias: ${name}`);
  const value = tokens[name];
  assert.ok(value, `Missing colour: ${name}`);
  if (/^#[\da-f]{6}$/i.test(value)) return [...value.slice(1).match(/../g)!.map(part => parseInt(part, 16)), 1] as TestColour;
  const alias = value.match(/^var\((--[\w-]+)\)$/);
  if (alias) return tokenColour(tokens, alias[1], depth + 1);
  const mix = value.match(/^color-mix\(in srgb, var\((--[\w-]+)\) (\d+)%, (transparent|var\((--[\w-]+)\))\)$/);
  assert.ok(mix, `Unsupported colour: ${name}=${value}`);
  const a = tokenColour(tokens, mix[1], depth + 1);
  const amount = Number(mix[2]) / 100;
  if (mix[3] === 'transparent') return [a[0], a[1], a[2], a[3] * amount];
  const b = tokenColour(tokens, mix[4], depth + 1);
  return [a[0] * amount + b[0] * (1 - amount), a[1] * amount + b[1] * (1 - amount), a[2] * amount + b[2] * (1 - amount), 1];
}

export function colourHex(colour: TestColour, background: TestColour = [255, 255, 255, 1]) {
  return `#${colour.slice(0, 3).map((channel, i) => Math.round(channel * colour[3] + background[i] * (1 - colour[3])).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
