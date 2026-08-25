import assert from 'node:assert/strict';
import test from 'node:test';

for (const [name, value] of [
  ['KARWAN_JOBBOARD_ADDR', '0x0000000000000000000000000000000000000001'],
  ['KARWAN_ESCROW_ADDR', '0x0000000000000000000000000000000000000002'],
  ['KARWAN_REPUTATION_ADDR', '0x0000000000000000000000000000000000000003'],
  ['KARWAN_VAULT_ADDR', '0x0000000000000000000000000000000000000004'],
] as const) {
  if (!process.env[name]) process.env[name] = value;
}

const { captureEvalFixture } = await import('./eval-agentic.js');

test('agentic characterization captures reproducible structured score inputs and outputs', () => {
  const first = captureEvalFixture('baseline');
  const second = captureEvalFixture('baseline');

  assert.deepEqual(first.structuredScoreInputs, second.structuredScoreInputs);
  assert.equal(first.structuredScoreInputs.length, 3);
  assert.deepEqual(
    first.structuredScoreInputs.map((entry) => entry.label),
    ['grounded-fit-at-budget', 'thin-fit-over-budget', 'repeat-counterparty-near-tie'],
  );
  assert.equal(first.structuredScoreInputs[0]?.inputs.topicalMatch, 88);
  assert.equal(first.structuredScoreInputs[2]?.inputs.relationshipScore, 70);
  assert.ok((first.structuredScoreInputs[0]?.output.score ?? 0) > (first.structuredScoreInputs[1]?.output.score ?? 0));
});

test('agentic characterization uses a fixed local clock', () => {
  const first = captureEvalFixture('clock-a');
  const second = captureEvalFixture('clock-b');
  assert.deepEqual(first.bidRankingPrompts, second.bidRankingPrompts);
  assert.deepEqual(first.counterPrompts, second.counterPrompts);
});
