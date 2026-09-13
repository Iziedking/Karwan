import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CreationReview } from './components/CreationReview';
import { validAmount, validWhole, authorisedPrice } from './creationValidation';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('both deal composers have one structured path and no parsing or automatic post', () => {
  for (const path of ['./components/DirectDealComposer.tsx', '../buyer/components/BriefComposer.tsx']) {
    const source = read(path);
    assert.doesNotMatch(source, /IntakeShell|extractDeal|directPost|api\.|Type it out/);
    assert.match(source, /return <(?:DirectDealForm|PostJobForm) \/>/);
  }
});

test('review must precede each creation call, while required protections stay in the payload', () => {
  for (const path of ['./components/DirectDealForm.tsx', '../buyer/components/PostJobForm.tsx']) {
    const source = read(path);
    const reviewGate = source.indexOf('if (!reviewing) { setReviewing(true); return; }');
    assert.ok(reviewGate > source.indexOf('async function submit'));
    assert.ok(reviewGate < source.indexOf('inFlight.current = true'));
    assert.ok(reviewGate < source.indexOf('await api.'));
    assert.match(source, /hidden=\{reviewing\} disabled=\{submitting \|\| reviewing\}/);
    assert.match(source, /<CreationReview/);
    assert.match(source, /inFlight.current = false/);
  }
  const direct = read('./components/DirectDealForm.tsx');
  assert.match(direct, /verificationPolicy: highSignal \? 'high_signal' : 'standard'/);
  assert.match(direct, /evidenceRequired,/);
  assert.match(direct, /requireStake,/);
  assert.doesNotMatch(direct, /grid-drift|DEAL PREVIEW/);
});

test('direct creation primes the confirmed deal before opening its route', () => {
  const direct = read('./components/DirectDealForm.tsx');
  const prime = direct.indexOf('primeCreatedDirectDeal(queryClient, r.deal, address)');
  const navigate = direct.indexOf('router.push(`/deals/${r.deal.jobId}`)');
  assert.ok(prime > direct.indexOf('await api.createDirectDeal'));
  assert.ok(navigate > prime);
});

test('switching deal paths keeps visited forms mounted and uses accessible choice buttons', () => {
  const source = read('./components/NewDealPanel.tsx');
  assert.match(source, /hidden=\{mode !== 'managed'\}/);
  assert.match(source, /hidden=\{mode !== 'direct'\}/);
  assert.match(source, /aria-pressed=\{isActive\}/);
  assert.doesNotMatch(source, /role="tab"/);
});

test('creation rejects non-finite, negative, fractional stage and out-of-range values', () => {
  for (const bad of ['', 0, -1, NaN, Infinity] as const) assert.equal(validAmount(bad), false);
  assert.equal(validAmount(5_000_001, 5_000_000), false);
  assert.equal(validAmount(20), true);
  for (const bad of ['', 0, 50.5, 100, NaN] as const) assert.equal(validWhole(bad, 1, 99), false);
  assert.equal(validWhole(50, 1, 99), true);
  assert.equal(authorisedPrice(100, ''), 100);
  assert.equal(authorisedPrice(100, 0), 100);
  assert.equal(authorisedPrice(100, 15), 115);
  assert.equal(authorisedPrice(99.99, 10), 109.989);
});

test('review renders the actual values and an edit action without creating or funding anything', () => {
  const html = renderToStaticMarkup(createElement(CreationReview, {
    rows: [{ label: 'Amount', value: '20 USDC' }, { label: 'Deadline', value: 'No delivery deadline' }],
    onEdit: () => {}, busy: false, children: 'Seller acceptance can trigger funding.',
  }));
  assert.match(html, /20 USDC/);
  assert.match(html, /No delivery deadline/);
  assert.match(html, /type="button"/);
  assert.match(html, /Edit details/);
  assert.doesNotMatch(html, /type="submit"/);
});
