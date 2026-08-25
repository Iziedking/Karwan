import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarkdownNewsletter } from './newsletterMarkdown';

test('maps a Karwan newsletter markdown document into reviewable issue sections', () => {
  const result = parseMarkdownNewsletter(
    '2026-08-25-mainnet-readiness.md',
    `# karwan mainnet readiness newsletter

## subject line options

1. karwan is building the protection layer for cross-border trade
2. from agent matching to contract-level settlement

## preview text

karwan is turning cross-border trade into one guided workflow.

## newsletter copy

### karwan is building the protection layer for cross-border trade

karwan protects the agreement at contract level.

### what has changed in the current build

- agent-assisted matching
- mobile-first onboarding

### evidence from arc testnet

karwan has reached 103 users.

## publisher footer

unsubscribe here.
`,
  );

  assert.equal(result.subject, 'karwan is building the protection layer for cross-border trade');
  assert.equal(result.preheader, 'karwan is turning cross-border trade into one guided workflow.');
  assert.equal(result.sections.length, 3);
  assert.match(result.sections.find((section) => section.key === 'ecosystem')?.body ?? '', /contract level/);
  assert.match(result.sections.find((section) => section.key === 'shipped')?.body ?? '', /mobile-first onboarding/);
  assert.match(result.sections.find((section) => section.key === 'learned')?.body ?? '', /103 users/);
  assert.doesNotMatch(result.sections.map((section) => section.body).join('\n'), /unsubscribe here/);
  assert.ok(result.warnings.some((warning) => warning.includes('publisher footer')));
});

test('returns a safe review payload for an empty or malformed document', () => {
  const result = parseMarkdownNewsletter('notes.txt', 'just a paragraph');
  assert.equal(result.sections.length, 3);
  assert.ok(result.warnings.some((warning) => warning.includes('No subject')));
  assert.ok(result.warnings.some((warning) => warning.includes('not a Markdown')));
});
