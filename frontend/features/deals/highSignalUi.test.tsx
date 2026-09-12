import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DirectDeal } from '../../core/api';
import { HighSignalVerificationCard } from './components/HighSignalVerificationCard';

const deal = {
  jobId: 'test-deal', buyer: '0xABCD', seller: '0x1234', agreementVersion: 1, agreementDigest: 'digest',
  verificationPolicy: 'high_signal', verificationSubject: 'buyer',
  highSignalVerification: { mode: 'high_signal', subject: 'buyer', provider: 'world-id', buyer: { status: 'pending' } },
} as DirectDeal;

function render(value: DirectDeal, caller = '0xabcd') {
  return renderToStaticMarkup(createElement(HighSignalVerificationCard, { deal: value, caller, onRefresh: () => {} }));
}

test('recognizes mixed-case participants and explains the action being gated', () => {
  const html = render(deal);
  assert.match(html, /Verify before funding this deal/);
  assert.match(html, /Verify with World ID/);
  assert.doesNotMatch(html, /High-signal deal|Open the World credential client with action/);
});

test('does not add an identity step to ordinary deals or unrelated parties', () => {
  assert.equal(render({ ...deal, verificationPolicy: 'standard' }), '');
  assert.equal(render(deal, '0x9876'), '');
  assert.equal(render(deal, deal.seller), '');
});

test('a recorded proof confirms the deal check without exposing environment jargon', () => {
  const html = render({ ...deal, highSignalVerification: { ...deal.highSignalVerification!, buyer: { status: 'verified', environment: 'staging', agreementKey: '1:digest' } } });
  assert.match(html, /Selfie Check recorded/);
  assert.doesNotMatch(html, /sandbox|staging|test proof/i);
  assert.doesNotMatch(html, /<button/);
});

test('a stale or unbound proof does not hide the current verification action', () => {
  for (const agreementKey of ['0:digest', undefined]) {
    const html = render({ ...deal, highSignalVerification: { ...deal.highSignalVerification!, buyer: { status: 'verified', agreementKey } } });
    assert.match(html, /Verify before funding this deal/);
    assert.match(html, /Verify with World ID/);
  }
});
