import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLegacyContractAcceptanceObservation,
  buildLegacyEscrowFundingObservation,
  buildLegacyX402FundingObservation,
  buildLegacySettlementObservation,
} from './financialCommandProjection.js';

const input = {
  dealRoomId: 'room-financial-projection',
  buyerAgentAddress: '0x1111111111111111111111111111111111111111',
  escrowAddress: '0x2222222222222222222222222222222222222222',
  fundedAmountUsdc: '12.345678',
  observedAtUnix: 1_700_000_000,
  dealRoomVersion: 3,
  offerVersion: 8,
  mandateVersion: 2,
};

test('legacy escrow projection preserves exact amount and requires explicit v2 approval', () => {
  const observation = buildLegacyEscrowFundingObservation(input);
  assert.equal(observation.command.operation, 'ESCROW_FUNDING');
  assert.equal(observation.command.amountUsdc, '12.345678');
  assert.equal(observation.command.expectedDealRoomVersion, 3);
  assert.equal(observation.command.expectedOfferVersion, 8);
  assert.deepEqual(observation.policy.requireApprovalFor, ['ESCROW_FUNDING']);
  assert.equal(observation.current.approval, undefined);
});

test('legacy escrow projection is deterministic and idempotent', () => {
  const first = buildLegacyEscrowFundingObservation(input);
  const second = buildLegacyEscrowFundingObservation(input);
  assert.deepEqual(first, second);
});

test('legacy escrow projection records the pre-funding authorization observation', () => {
  const observation = buildLegacyEscrowFundingObservation({
    ...input,
    preFundingObservation: {
      balanceUsdc: '20.000000',
      requiredUsdc: '12.345678',
      outcome: 'sufficient',
      observedAtUnix: 1_700_000_001,
    },
  });
  assert.deepEqual(observation.preFundingObservation, {
    balanceUsdc: '20.000000',
    requiredUsdc: '12.345678',
    outcome: 'sufficient',
    observedAtUnix: 1_700_000_001,
  });
  const insufficient = buildLegacyEscrowFundingObservation({
    ...input,
    preFundingObservation: {
      balanceUsdc: '2.000000',
      requiredUsdc: '12.345678',
      outcome: 'insufficient',
      observedAtUnix: 1_700_000_001,
    },
  });
  assert.notEqual(observation.command.idempotencyKey, insufficient.command.idempotencyKey);
  const samePreflightLater = buildLegacyEscrowFundingObservation({
    ...input,
    preFundingObservation: {
      balanceUsdc: '20.000000',
      requiredUsdc: '12.345678',
      outcome: 'sufficient',
      observedAtUnix: 1_700_000_002,
    },
  });
  assert.equal(observation.command.idempotencyKey, samePreflightLater.command.idempotencyKey);
  assert.throws(
    () => buildLegacyEscrowFundingObservation({
      ...input,
      preFundingObservation: {
        balanceUsdc: '2',
        requiredUsdc: '12.345678',
        outcome: 'sufficient',
        observedAtUnix: 1_700_000_001,
      },
    }),
    /insufficient balance/,
  );
  assert.throws(
    () => buildLegacyEscrowFundingObservation({
      ...input,
      preFundingObservation: {
        balanceUsdc: '20',
        requiredUsdc: '12.345678',
        outcome: 'insufficient',
        observedAtUnix: 1_700_000_001,
      },
    }),
    /sufficient balance/,
  );
});

test('legacy escrow projection rejects invalid or zero-value commands', () => {
  assert.throws(
    () => buildLegacyEscrowFundingObservation({ ...input, fundedAmountUsdc: '0' }),
    /positive amount/,
  );
  assert.throws(
    () => buildLegacyEscrowFundingObservation({ ...input, escrowAddress: 'not-an-address' }),
    /valid addresses/,
  );
});

test('settlement projection records exact payout intent without granting execution authority', () => {
  const settlement = {
    dealRoomId: 'room-settlement-1',
    escrowAddress: '0x1111111111111111111111111111111111111111',
    destinationAddress: '0x2222222222222222222222222222222222222222',
    amountUsdc: '12.500000',
    operation: 'MILESTONE_PAYOUT' as const,
    observedAtUnix: 100,
    movementReference: 'release:room-settlement-1:milestone:0',
  };
  const first = buildLegacySettlementObservation(settlement);
  const second = buildLegacySettlementObservation(settlement);

  assert.deepEqual(first, second);
  assert.equal(first.source, 'legacy-settlement');
  assert.equal(first.command.operation, 'MILESTONE_PAYOUT');
  assert.equal(first.command.sourceAddress, settlement.escrowAddress);
  assert.equal(first.command.destinationAddress, settlement.destinationAddress);
  assert.equal(first.policy.autonomousMaxUsdc, '0');
  assert.deepEqual(first.policy.requireApprovalFor, ['MILESTONE_PAYOUT']);
});

test('refund projection changes identity by movement reference and rejects unsafe inputs', () => {
  const base = {
    dealRoomId: 'room-refund-1',
    escrowAddress: '0x1111111111111111111111111111111111111111',
    destinationAddress: '0x2222222222222222222222222222222222222222',
    amountUsdc: '1.25',
    operation: 'REFUND' as const,
    observedAtUnix: 100,
    movementReference: 'refund:room-refund-1:1',
  };

  const first = buildLegacySettlementObservation(base);
  const second = buildLegacySettlementObservation({ ...base, movementReference: 'refund:room-refund-1:2' });

  assert.notEqual(first.command.idempotencyKey, second.command.idempotencyKey);
  assert.throws(() => buildLegacySettlementObservation({ ...base, amountUsdc: '0' }), /positive amount/);
  assert.throws(() => buildLegacySettlementObservation({ ...base, destinationAddress: 'not-an-address' }), /valid addresses/);
});

test('legacy contract acceptance projects exact exposure and remains approval-required', () => {
  const observation = buildLegacyContractAcceptanceObservation({
    dealRoomId: 'room-accept-1',
    buyerAgentAddress: '0x1111111111111111111111111111111111111111',
    jobBoardAddress: '0x2222222222222222222222222222222222222222',
    agreedPriceUsdc: '12.500000',
    observedAtUnix: 100,
    dealRoomVersion: 3,
    offerVersion: 7,
    mandateVersion: 4,
    providerId: 'circle-accept-1',
    txHash: '0xaccepttx',
  });
  assert.equal(observation.source, 'legacy-accept');
  assert.equal(observation.command.operation, 'CONTRACT_ACCEPTANCE');
  assert.equal(observation.command.amountUsdc, '12.500000');
  assert.deepEqual(observation.policy.requireApprovalFor, ['CONTRACT_ACCEPTANCE']);
  assert.equal(observation.current.dealRoomVersion, 3);
  assert.equal(observation.current.offerVersion, 7);
  assert.equal(observation.providerObservation?.lifecycle, 'SETTLED');
  assert.equal(observation.providerObservation?.txHash, '0xaccepttx');
});

test('legacy contract acceptance projection is deterministic and rejects unsafe input', () => {
  const input = {
    dealRoomId: 'room-accept-2',
    buyerAgentAddress: '0x1111111111111111111111111111111111111111',
    jobBoardAddress: '0x2222222222222222222222222222222222222222',
    agreedPriceUsdc: '1.25',
    observedAtUnix: 101,
  };
  const first = buildLegacyContractAcceptanceObservation(input);
  const second = buildLegacyContractAcceptanceObservation(input);
  assert.equal(first.command.idempotencyKey, second.command.idempotencyKey);
  assert.throws(
    () => buildLegacyContractAcceptanceObservation({ ...input, agreedPriceUsdc: '0' }),
    /positive amount/,
  );
  assert.throws(
    () => buildLegacyContractAcceptanceObservation({ ...input, jobBoardAddress: 'not-an-address' }),
    /valid addresses/,
  );
});

test('x402 funding projection records the Gateway rail without granting funding authority', () => {
  const input = {
    dealRoomId: 'room-x402-funding-1',
    payerAgentAddress: '0x1111111111111111111111111111111111111111',
    gatewayWalletAddress: '0x2222222222222222222222222222222222222222',
    beneficiaryAddress: '0x3333333333333333333333333333333333333333',
    amountUsdc: '0.010000',
    availableBeforeUsdc: '0.000000',
    requiredUsdc: '0.010000',
    observedAtUnix: 200,
    phase: 'intent' as const,
  };
  const observation = buildLegacyX402FundingObservation(input);
  assert.equal(observation.source, 'legacy-x402-funding');
  assert.equal(observation.command.operation, 'X402_FUNDING');
  assert.equal(observation.command.sourceAddress, input.payerAgentAddress);
  assert.equal(observation.command.destinationAddress, input.gatewayWalletAddress);
  assert.deepEqual(observation.policy.requireApprovalFor, ['X402_FUNDING']);
  assert.deepEqual(observation.x402FundingObservation, {
    payerAgentAddress: input.payerAgentAddress,
    gatewayWalletAddress: input.gatewayWalletAddress,
    beneficiaryAddress: input.beneficiaryAddress,
    availableBeforeUsdc: input.availableBeforeUsdc,
    requiredUsdc: input.requiredUsdc,
    phase: 'intent',
  });
  assert.equal(observation.providerObservation, undefined);
});

test('x402 funding identity is stable but separates intent from submitted proof', () => {
  const base = {
    dealRoomId: 'room-x402-funding-2',
    payerAgentAddress: '0x1111111111111111111111111111111111111111',
    gatewayWalletAddress: '0x2222222222222222222222222222222222222222',
    beneficiaryAddress: '0x3333333333333333333333333333333333333333',
    amountUsdc: '1.25',
    availableBeforeUsdc: '0.25',
    requiredUsdc: '1.25',
    observedAtUnix: 300,
  };
  const intent = buildLegacyX402FundingObservation({ ...base, phase: 'intent' });
  const sameIntent = buildLegacyX402FundingObservation({ ...base, phase: 'intent' });
  const submitted = buildLegacyX402FundingObservation({ ...base, phase: 'submitted', depositTxHash: '0xdeposit-1' });
  const differentTx = buildLegacyX402FundingObservation({ ...base, phase: 'submitted', depositTxHash: '0xdeposit-2' });
  assert.deepEqual(intent, sameIntent);
  assert.notEqual(intent.command.idempotencyKey, submitted.command.idempotencyKey);
  assert.notEqual(submitted.command.idempotencyKey, differentTx.command.idempotencyKey);
  assert.equal(submitted.providerObservation?.lifecycle, 'SUBMITTED');
  assert.equal(submitted.providerObservation?.txHash, '0xdeposit-1');
});

test('x402 funding projection rejects safe-boundary violations', () => {
  const base = {
    dealRoomId: 'room-x402-funding-3',
    payerAgentAddress: '0x1111111111111111111111111111111111111111',
    gatewayWalletAddress: '0x2222222222222222222222222222222222222222',
    beneficiaryAddress: '0x3333333333333333333333333333333333333333',
    amountUsdc: '0.01',
    availableBeforeUsdc: '0',
    requiredUsdc: '0.01',
    observedAtUnix: 400,
    phase: 'intent' as const,
  };
  assert.throws(() => buildLegacyX402FundingObservation({ ...base, availableBeforeUsdc: '0.01' }), /insufficient pre-funding/);
  assert.throws(() => buildLegacyX402FundingObservation({ ...base, payerAgentAddress: 'not-an-address' }), /valid addresses/);
  assert.throws(() => buildLegacyX402FundingObservation({ ...base, amountUsdc: '0' }), /positive amount/);
  assert.throws(() => buildLegacyX402FundingObservation({ ...base, phase: 'submitted' }), /transaction hash/);
  assert.throws(() => buildLegacyX402FundingObservation({ ...base, depositTxHash: '0xunexpected' }), /must not include/);
});
