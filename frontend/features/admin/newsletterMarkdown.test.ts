import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarkdownNewsletter, parseNewsletterDocument } from './newsletterMarkdown';

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

test('imports a branded HTML newsletter by its explicit content sections', () => {
  const result = parseNewsletterDocument(
    'mainnet-readiness.html',
    `<html><head>
      <meta name="newsletter-subject" content="karwan is building the protection layer">
      <meta name="newsletter-preheader" content="a guided workflow for protected trade">
    </head><body>
      <h1>karwan is building the protection layer</h1>
      <article data-section="shipped"><h2>what shipped</h2><ul><li>agent matching</li><li>bounded negotiation</li></ul></article>
      <article data-section="ecosystem"><h2>the karwan ecosystem</h2><p>contract-level protection without custody.</p></article>
      <article data-section="learned"><h2>what we are preparing for next</h2><p>mainnet readiness remains subject to safety checks.</p></article>
    </body></html>`,
  );

  assert.equal(result.subject, 'karwan is building the protection layer');
  assert.equal(result.preheader, 'a guided workflow for protected trade');
  assert.match(result.sections.find((section) => section.key === 'shipped')?.body ?? '', /- agent matching/);
  assert.match(result.sections.find((section) => section.key === 'ecosystem')?.body ?? '', /without custody/);
  assert.equal(result.warnings.length, 0);
});
