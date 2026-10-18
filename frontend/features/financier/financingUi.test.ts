import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/// The financing position and its chat read in light and dark (UI law v2):
/// theme tokens only, no white surfaces or raw colours, no mono uppercase
/// labels, and no English written into the component.
///
///   npx tsx --test features/financier/financingUi.test.ts

const files = ['features/financier/components/FinancingPositionWorkspace.tsx', 'features/chat/components/FinancingChatPanel.tsx'];

test('financing screens use theme tokens, never white or raw colours', () => {
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /bg-white|text-white|#[0-9a-fA-F]{6}\b|text-orange|\bmono\b|uppercase/, f);
  }
});

test('financing screens carry no hard-coded English', () => {
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, />\s*(You|Reply|send|Seller|Financier|Back to financing desk)\s*</, f);
    assert.doesNotMatch(src, /'(only png|image must be|we could not read|Offer pending|Invoice early payment)/i, f);
  }
});
