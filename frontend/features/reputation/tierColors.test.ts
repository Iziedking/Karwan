import assert from 'node:assert/strict';
import test from 'node:test';
import { TIER_HUE, tierInk } from './tierColors';

/// sRGB approximation of the oklab mix tierInk asks for. Mixing toward black in
/// oklab lands darker than in sRGB, so passing here is conservative.
function mixedOnPaperContrast(hue: string): number {
  const hex = hue === 'var(--lp-accent)' ? '#AFC95B' : hue;
  const channel = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const ink = [10, 10, 11];
  const mix = [0, 1, 2].map((i) => 0.55 * channel(i) + 0.45 * ink[i]);
  const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = (rgb: number[]) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  const paper = lum([244, 244, 241]);
  return (paper + 0.05) / (lum(mix) + 0.05);
}

test('tier names written as text stay readable on paper for every tier', () => {
  for (const [tier, hue] of Object.entries(TIER_HUE)) {
    assert.ok(mixedOnPaperContrast(hue) >= 4.5, `${tier} ink below 4.5:1`);
    assert.match(tierInk(tier as keyof typeof TIER_HUE), /color-mix\(in oklab, .+ 55%, var\(--lp-dark\)\)/);
  }
});

test('every reputation tier has its own visual identity', () => {
  assert.equal(new Set(Object.values(TIER_HUE)).size, 5);
  assert.equal(TIER_HUE.ESTABLISHED, 'var(--lp-accent)');
  assert.notEqual(TIER_HUE.ESTABLISHED, TIER_HUE.STRONG);
  assert.notEqual(TIER_HUE.STRONG, TIER_HUE.ELITE);
});
