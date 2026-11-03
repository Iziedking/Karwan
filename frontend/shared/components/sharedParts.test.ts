import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from './Button';
import { Card } from './Card';
import { FactRows } from './FactRows';

/// The shared parts of the new look (view 48).

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('a loading button keeps its colour and size, turns, and says what is happening', () => {
  const html = renderToStaticMarkup(h(Button, { size: 'lg', loading: true, loadingLabel: 'Releasing 600 USDC' }, 'Release 600 USDC'));
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /Releasing 600 USDC/);
  assert.doesNotMatch(html, /Release 600 USDC</);
  assert.match(html, /animate-spin/);
  assert.match(html, /min-h-\[52px\]/);
  assert.match(html, /bg-\[var\(--action\)\]/);
  assert.doesNotMatch(html, /opacity-40/);
  assert.doesNotMatch(html, /motion-reduce:animate-none/);
});

test('green is only the primary button; secondary is a surface button with a hairline', () => {
  const secondary = renderToStaticMarkup(h(Button, { variant: 'secondary' }, 'Send'));
  assert.match(secondary, /border-\[var\(--line-strong\)\]/);
  assert.doesNotMatch(secondary, /--action|--accent|--lp-accent/);
});

test('the one card: surface, hairline, radius 16, 20 then 24 padding, no shadow', () => {
  const html = renderToStaticMarkup(h(Card, { children: 'Body' }));
  assert.match(html, /rounded-\[var\(--radius-card\)\] border border-\[var\(--line\)\] bg-\[var\(--surface\)\]/);
  assert.match(html, /p-5 lg:p-6/);
  assert.doesNotMatch(html, /shadow/);
});

test('fact rows are a label and a value with a hairline between, nothing under them', () => {
  const html = renderToStaticMarkup(h(FactRows, { facts: [{ label: 'To', value: 'Ada Okafor' }, { label: 'Amount', value: '600 USDC' }] }));
  assert.equal((html.match(/<dt/g) ?? []).length, 2);
  assert.equal((html.match(/<dd/g) ?? []).length, 2);
  assert.match(html, /divide-y divide-\[var\(--line\)\]/);
});

test('on phones the confirm sheet has a handle to drag it down, and a busy sheet cannot be dragged away', () => {
  const shell = source('./ConfirmSheetShell.tsx');
  assert.match(shell, /data-sheet-handle/);
  assert.match(shell, /drag=\{phone && !busy && !reduce \? 'y' : false\}/);
  assert.match(shell, /rounded-t-\[var\(--radius-sheet\)\] bg-\[var\(--raised\)\]/);
  assert.match(shell, /if \(event\.key === 'Escape' && !busyRef\.current\) onCloseRef\.current\(\)/);
});

test('the tab bar and rail carry no green', () => {
  for (const file of ['./WorkspaceBottomNav.tsx', './ActionBeacon.tsx']) {
    assert.doesNotMatch(source(file), /--lp-accent|--action\b|--accent\b/, file);
  }
  const nav = source('./TopNav.tsx');
  const rail = nav.slice(nav.indexOf('function RailLink('), nav.indexOf('function RailProfile('));
  assert.doesNotMatch(rail, /--lp-accent/);
});
