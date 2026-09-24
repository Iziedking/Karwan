import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PROTECTION_TOPICS } from './protectionTopics';
import { protectionCopy } from '../../shared/i18n/messages/protection';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('payment editorial copy describes the process without claiming a guarantee', () => {
  assert.deepEqual(PROTECTION_TOPICS, ['escrow', 'milestones', 'disputes', 'agents']);
  assert.match(protectionCopy.en.disclaimer, /does not automatically refund/);
  assert.match(protectionCopy.en.topics.agents.detail, /You approve/);
  assert.doesNotMatch(JSON.stringify(protectionCopy.en), /placeholder|pending final audit/i);
  assert.doesNotMatch(JSON.stringify(protectionCopy.en.topics), /guaranteed|insured|100%|24\/7|risk.free|audited|automatic refund/i);
  for (const copy of Object.values(protectionCopy)) {
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(protectionCopy.en).sort());
    assert.deepEqual(Object.keys(copy.topics), [...PROTECTION_TOPICS]);
    assert.ok(copy.disclaimer);
    for (const topic of PROTECTION_TOPICS) assert.ok(copy.topics[topic].title && copy.topics[topic].detail);
  }
});

test('protection artwork is static and accessible, with no payment action or fake audit link', () => {
  const section = source('./components/ProtectionSection.tsx');
  const css = source('./components/ProtectionSection.module.css');
  const page = source('../../app/page.tsx');
  assert.doesNotMatch(section, /data-review-state|\{t.status\}/);
  assert.match(section, /\{t.disclaimer\}/);
  assert.match(section, /<h2 id="protection-title"/);
  assert.match(section, /aria-hidden="true"/);
  assert.match(section, /focusable="false"/);
  assert.doesNotMatch(section, /<button|<a\s|<Link|fetch\(|api\.|setInterval/);
  assert.match(css, /min-height: 100svh/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /animation:|@keyframes/);
  assert.ok(page.indexOf('<ProtectionSection />') > page.indexOf('id="record"'));
  assert.ok(page.indexOf('<ProtectionSection />') < page.indexOf('aria-labelledby="closing-title"'));
});

test('protection captions and artwork remain legible on the authored dark field', () => {
  const css = source('./components/ProtectionSection.module.css');
  const globalCss = source('../../app/globals.css');
  const token = (name: string) => (css + globalCss).match(new RegExp(`${name}:\\s*(#[a-fA-F0-9]{6})`))![1];
  const luminance = (hex: string) => {
    const [r, g, b] = hex.match(/[a-f\d]{2}/gi)!.map(part => parseInt(part, 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  };
  const ground = luminance(token('--protection-ground'));
  for (const name of ['--karwan-card', '--protection-secondary']) {
    assert.ok((luminance(token(name)) + 0.05) / (ground + 0.05) >= 4.5, name);
  }
  for (const name of ['--protection-line', '--protection-depth', '--karwan-green']) {
    assert.ok((luminance(token(name)) + 0.05) / (ground + 0.05) >= 3, name);
  }
  assert.match(css, /--protection-ink: var\(--karwan-card\)/);
});
