import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// The store writes data/link-offenses.json under the working directory.
process.chdir(mkdtempSync(join(tmpdir(), 'link-offenses-')));
const { getLinkOffenseCount, getMaliciousLinkCount, recordLinkOffense, withdrawLinkOffense } = await import('./linkOffenses.js');

///   npx tsx --test src/security/linkOffenseWithdraw.test.ts

test('a link support found safe comes off the seller, once', () => {
  recordLinkOffense({ address: '0xS', jobId: '0xJ1', surface: 'delivery', verdict: 'malicious', reasons: ['x'] });
  recordLinkOffense({ address: '0xS', jobId: '0xJ2', surface: 'delivery', verdict: 'suspicious', reasons: ['y'] });
  assert.equal(getLinkOffenseCount('0xs'), 2);
  assert.equal(getMaliciousLinkCount('0xs'), 1);

  assert.equal(withdrawLinkOffense({ address: '0xs', jobId: '0xj1', surface: 'delivery', verdict: 'malicious' }), true);
  assert.equal(getLinkOffenseCount('0xs'), 1);
  assert.equal(getMaliciousLinkCount('0xs'), 0);
  assert.equal(withdrawLinkOffense({ address: '0xs', jobId: '0xj1', surface: 'delivery', verdict: 'malicious' }), false, 'a retry takes nothing more off');

  withdrawLinkOffense({ address: '0xs', jobId: '0xj2', surface: 'delivery', verdict: 'suspicious' });
  assert.equal(getLinkOffenseCount('0xs'), 0);
});
