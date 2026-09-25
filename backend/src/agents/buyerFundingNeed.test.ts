import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUnits } from 'viem';
import { buyerFundingNeed, GAS_HEADROOM_USDC } from './buyerFundingNeed.js';
import { buildDirectDealFundingQuote, USDC_DECIMALS } from '../deals/fundingQuote.js';

const usdc = (v: string) => parseUnits(v, USDC_DECIMALS);

test('the need is what the escrow will pull plus the gas headroom', () => {
  const quote = buildDirectDealFundingQuote({ jobId: '0x1', dealAmountUsdc: '120', feeBps: 250 });
  const need = buyerFundingNeed({ budgetUsdc: 120, feeBps: 250, balanceWei: 0n });
  assert.equal(need.required, usdc(quote.fundedAmountUsdc) + usdc(GAS_HEADROOM_USDC));
  assert.equal(need.view.requiredUsdc, '122');
  assert.equal(need.view.topUpNeededUsdc, '122');
});

test('a funded agent needs nothing more', () => {
  const need = buyerFundingNeed({ budgetUsdc: 120, feeBps: 250, balanceWei: usdc('500') });
  assert.equal(need.shortfall, 0n);
  assert.equal(need.view.topUpNeededUsdc, '0');
  assert.equal(need.view.balanceUsdc, '500');
});

test('a partly funded agent needs exactly the gap', () => {
  const need = buyerFundingNeed({ budgetUsdc: '10.5', feeBps: 100, balanceWei: usdc('3') });
  // 10.5 + 0.0525 buyer fee + 0.5 headroom - 3
  assert.equal(need.view.topUpNeededUsdc, '8.0525');
});

test('fractional fees round down exactly as the escrow does', () => {
  const quote = buildDirectDealFundingQuote({ jobId: '0x1', dealAmountUsdc: '0.000003', feeBps: 250 });
  const need = buyerFundingNeed({ budgetUsdc: '0.000003', feeBps: 250, balanceWei: 0n });
  assert.equal(need.required, usdc(quote.fundedAmountUsdc) + usdc(GAS_HEADROOM_USDC));
});
