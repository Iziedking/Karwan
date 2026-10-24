import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeAbiParameters, encodeEventTopics, toFunctionSignature, type AbiFunction } from 'viem';
import { agreementEscrowAbi } from './abis/agreementEscrow.js';
import { agreementEscrow, decodeAgreementLogs, viewFromReads } from './agreementEscrowLive.js';
import { AGREEMENT_FUND_SIGNATURE } from './agreementTerms.js';
import { DEAL_STATE } from './dealEscrowV3.js';

type Hex = `0x${string}`;
const ESCROW = '0x55460D2b8b0D8067Ea33406b310224B5bd44F43C' as Hex;
const BUYER = `0x${'22'.repeat(20)}` as Hex;
const SELLER = `0x${'33'.repeat(20)}` as Hex;
const SENIOR = `0x${'5e'.repeat(20)}` as Hex;
const DEAL = `0x${'d1'.repeat(32)}` as Hex;

const names = (type: 'event' | 'function') =>
  new Set(agreementEscrowAbi.filter((x) => x.type === type).map((x) => (x as { name: string }).name));

test('abi_parses_and_names_every_event_the_adapter_reads', () => {
  const events = names('event');
  for (const e of ['DealFunded', 'DealAccepted', 'Delivered', 'ReviewStarted', 'TranchePaid', 'DealSettled', 'DisputeOpened', 'RulingProposed', 'DisputeEscalated', 'DisputeResolved', 'Paid']) {
    assert.ok(events.has(e), e);
  }
  const fns = names('function');
  for (const f of ['fund', 'accept', 'markDelivered', 'startReview', 'release', 'claim', 'reclaim', 'dispute', 'escalate', 'proposeRuling', 'executeRuling', 'proposeSplit', 'acceptSplit', 'withdrawOwed', 'getDeal', 'getTerms', 'accountOf', 'disputeOf', 'panelOf', 'splitOf', 'reviewEndOf', 'owed', 'termsHashOf', 'dealIdFor']) {
    assert.ok(fns.has(f), f);
  }
});

test('the_deployed_fund_signature_is_the_one_the_adapter_sends', () => {
  const fund = agreementEscrowAbi.find((x) => x.type === 'function' && x.name === 'fund') as AbiFunction;
  assert.equal(toFunctionSignature(fund), AGREEMENT_FUND_SIGNATURE);
});

test('reader_maps_decoded_reads_to_the_view', () => {
  const v = viewFromReads({
    deal: { state: 2, count: 2, paid: 1, extUsed: 0, extRequests: 0, checkPassed: false, checkFailed: false, lateMark: false, partsPaid: 0, revision: 3, fundedAt: 1n, deadline: 9n, deliveredAt: 5n, reviewStartAt: 6n, reviewEnd: 8n, requestedDeadline: 0n, holdBase: 0n, sellerNet: 995n, feeTotal: 10n, released: 497n, feeReleased: 5n, termsHash: `0x${'ab'.repeat(32)}` },
    account: { payer: BUYER, payerId: 7n, seniorSafe: SENIOR },
    dispute: { opener: BUYER, openedAt: 0n, proposed: false, escalated: false, proposedBps: 0, proposedAt: 0n, escalatedAt: 0n },
    panel: { arbiter: BUYER, reviewer: SENIOR },
    terms: { seller: SELLER, sellerStake: 0n },
  });
  assert.equal(v.state, DEAL_STATE.Accepted);
  assert.equal(v.buyer, BUYER);
  assert.equal(v.seller, SELLER);
  assert.equal(v.revision, 3);
  assert.equal(v.paid, 1);
  assert.equal(v.reviewEnd, 8n);
  assert.equal(v.senior, true);
});

test('receipt_logs_decode_with_the_deal_id_and_only_from_the_escrow', () => {
  const event = agreementEscrowAbi.find((x) => x.type === 'event' && x.name === 'DealFunded')!;
  const topics = encodeEventTopics({ abi: [event], eventName: 'DealFunded', args: { dealId: DEAL, buyer: BUYER, seller: SELLER } } as never);
  const data = encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes32' }], [1_005_000_000n, `0x${'ab'.repeat(32)}`]);
  const log = { address: ESCROW, topics, data } as never;
  const decoded = decodeAgreementLogs(ESCROW, [log, { ...(log as object), address: `0x${'99'.repeat(20)}` } as never]);
  assert.equal(decoded.length, 1);
  assert.equal(decoded[0]!.name, 'DealFunded');
  assert.equal(decoded[0]!.jobId, DEAL);
  assert.equal((decoded[0]!.args.buyer as string).toLowerCase(), BUYER);
});

test('no_live_escrow_while_the_suite_is_off', () => {
  assert.equal(agreementEscrow, null);
});
