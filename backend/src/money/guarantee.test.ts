import assert from 'node:assert/strict';
import test from 'node:test';
import { guaranteeOperationKey, proveGuaranteeStake, proveGuaranteeStep } from './guarantee.js';

const VAULT = '0xf5fd1fd6d790da42c022a5c5404676c048007ed5';
const USDC = '0x3600000000000000000000000000000000000000';
const MC = '0x522faf9a91c41c443c66765030741e4aace147d0';
const ME = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const ID = 54n;
const AMOUNT = 25_000_000n;

const stakeInput = (over: Partial<Parameters<typeof proveGuaranteeStake>[0]> = {}) => ({
  receiptTo: VAULT,
  receiptFrom: ME,
  vaultAddress: VAULT,
  walletAddress: ME,
  identityId: ID,
  usdcAddress: USDC,
  expectedAmountMicros: AMOUNT,
  transfers: [{ tokenAddress: USDC, from: ME, to: VAULT, value: AMOUNT }],
  staked: [{ emitter: VAULT, owner: ID, from: ME, amount: AMOUNT }],
  ...over,
});

test('a put up is proved by the USDC into the vault and the vault crediting this identity', () => {
  assert.equal(proveGuaranteeStake(stakeInput()), AMOUNT);
});

test('a put up sent as one batch with the record steps is proved the same way', () => {
  assert.equal(proveGuaranteeStake(stakeInput({ receiptTo: MC })), AMOUNT);
});

test('a put up credited to another identity, from another wallet or by another contract proves nothing', () => {
  assert.throws(() => proveGuaranteeStake(stakeInput({ staked: [{ emitter: VAULT, owner: 7n, from: ME, amount: AMOUNT }] })), /no unique Staked/);
  assert.throws(() => proveGuaranteeStake(stakeInput({ staked: [{ emitter: VAULT, owner: ID, from: OTHER, amount: AMOUNT }] })), /no unique Staked/);
  assert.throws(() => proveGuaranteeStake(stakeInput({ staked: [{ emitter: OTHER, owner: ID, from: ME, amount: AMOUNT }] })), /no unique Staked/);
});

test('a put up of another amount, to another contract or from another sender proves nothing', () => {
  assert.throws(() => proveGuaranteeStake(stakeInput({ expectedAmountMicros: AMOUNT + 1n })), /amount/);
  assert.throws(() => proveGuaranteeStake(stakeInput({ receiptTo: OTHER })), /target/);
  assert.throws(() => proveGuaranteeStake(stakeInput({ receiptFrom: OTHER })), /sender/);
});

test('from a smart account the receipt target is not checked, the events are', () => {
  assert.equal(proveGuaranteeStake(stakeInput({ receiptTo: null, smartAccount: true })), AMOUNT);
});

const stepInput = (over: Partial<Parameters<typeof proveGuaranteeStep>[0]> = {}) => ({
  step: 'take_out' as const,
  receiptTo: VAULT,
  receiptFrom: ME,
  vaultAddress: VAULT,
  walletAddress: ME,
  identityId: ID,
  usdcAddress: USDC,
  amountMicros: AMOUNT,
  events: [{ name: 'WithdrawRequested' as const, emitter: VAULT, owner: ID, amount: AMOUNT }],
  transfers: [],
  ...over,
});

test('taking out is proved by the request for this identity and amount', () => {
  proveGuaranteeStep(stepInput());
  assert.throws(() => proveGuaranteeStep(stepInput({ events: [{ name: 'WithdrawRequested', emitter: VAULT, owner: ID, amount: 1n }] })), /no matching WithdrawRequested/);
});

test('cancelling is proved by the cancel event for this identity', () => {
  proveGuaranteeStep(stepInput({ step: 'cancel', events: [{ name: 'WithdrawCancelled', emitter: VAULT, owner: ID }] }));
  assert.throws(() => proveGuaranteeStep(stepInput({ step: 'cancel', events: [{ name: 'WithdrawCancelled', emitter: VAULT, owner: 3n }] })), /no matching WithdrawCancelled/);
});

test('collecting needs the vault event and the exact USDC back to the wallet', () => {
  const events = [{ name: 'Withdrawn' as const, emitter: VAULT, owner: ID, to: ME, amount: AMOUNT }];
  proveGuaranteeStep(stepInput({ step: 'collect', events, transfers: [{ tokenAddress: USDC, from: VAULT, to: ME, value: AMOUNT }] }));
  assert.throws(() => proveGuaranteeStep(stepInput({ step: 'collect', events, transfers: [] })), /no exact USDC/);
  assert.throws(() => proveGuaranteeStep(stepInput({ step: 'collect', events: [{ ...events[0]!, to: OTHER }], transfers: [{ tokenAddress: USDC, from: VAULT, to: ME, value: AMOUNT }] })), /no matching Withdrawn/);
});

test('operation keys are per wallet, step and request', () => {
  assert.equal(guaranteeOperationKey('0xABC', 'put_up', 'r1'), 'guarantee:put_up:0xabc:r1');
  assert.notEqual(guaranteeOperationKey(ME, 'take_out', 'r1'), guaranteeOperationKey(ME, 'collect', 'r1'));
});
