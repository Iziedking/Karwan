import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const at = (file: string) => new URL(`../../app/${file}`, import.meta.url);

/// A crash on any page outside /app and the deal page used to show the
/// browser's bare "Application error" and send no report (mobile sign-up, 15 Nov 2026).
test('a crash on any page shows a way out and is reported', () => {
  for (const file of ['error.tsx', 'global-error.tsx']) {
    assert.ok(existsSync(at(file)), file);
    const src = readFileSync(at(file), 'utf8');
    assert.match(src, /^'use client';/);
    assert.match(src, /reportRouteError\(error, 'root'\)/);
    assert.match(src, /onClick=\{reset\}|onClick=\{\(\) => window\.location\.reload\(\)\}/);
  }
  assert.match(readFileSync(at('global-error.tsx'), 'utf8'), /<html[^>]*>[^]*<body/);
});
