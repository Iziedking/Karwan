import assert from 'node:assert/strict';
import test from 'node:test';

process.env.ESCROW_V2B_ENABLED = '1';
const { buildFundEscrowCall, MAX_ONCHAIN_REVIEW_WINDOW_MS } = await import('./settlement.js');
const { config } = await import('../config.js');

const DAY_MS = 86_400_000;

function onChainReviewSecs(reviewFloorMs?: number): number {
  const call = buildFundEscrowCall(
    'wallet',
    `0x${'22'.repeat(20)}`,
    `0x${'ab'.repeat(32)}`,
    `0x${'33'.repeat(20)}`,
    10_000_000n,
    [100],
    0,
    Math.floor(Date.now() / 1000) + 30 * 86_400,
    reviewFloorMs,
  );
  const timing = call.abiParameters.at(-1) as string[];
  return Number(timing[1]);
}

test('without terms, the on-chain review window is the platform base window', () => {
  assert.equal(onChainReviewSecs(), Math.floor(config.DEAL_REVIEW_WINDOW_MS / 1000));
});

test('a Net 30 deal carries its 30 days onto the chain, so a direct contract claim cannot beat the terms', () => {
  assert.equal(onChainReviewSecs(30 * DAY_MS), 30 * 86_400);
});

test('the terms window is capped at the deployed escrow maximum so funding never reverts', () => {
  assert.equal(onChainReviewSecs(400 * DAY_MS), Math.floor(MAX_ONCHAIN_REVIEW_WINDOW_MS / 1000));
});

test('a floor shorter than the base window never shortens it', () => {
  assert.equal(onChainReviewSecs(1_000), Math.floor(config.DEAL_REVIEW_WINDOW_MS / 1000));
});
