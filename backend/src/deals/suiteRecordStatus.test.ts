import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeAbiParameters, keccak256 } from 'viem';
import { outcomeKey, pendingRecordKey, readOnBothRecords } from './suiteRecordStatus.js';

type Hex = `0x${string}`;
const FAMILY = `0x${'55'.repeat(20)}` as Hex;
const DEAL = `0x${'d1'.repeat(32)}` as Hex;

test('outcome_key_matches_the_record_contract', () => {
  const expected = keccak256(
    encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }, { type: 'uint64' }, { type: 'uint8' }], [FAMILY, DEAL, 7n, 1]),
  );
  assert.equal(outcomeKey(FAMILY, DEAL, 7n, 1), expected);
  assert.equal(pendingRecordKey(DEAL, 1), keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint8' }], [DEAL, 1])));
});

function ports(opts: { recorded?: Hex[]; pending?: Hex[]; seller?: bigint } = {}) {
  const recorded = new Set(opts.recorded ?? []);
  const pending = new Set(opts.pending ?? []);
  return {
    family: FAMILY,
    subjects: async () => ({ buyer: 3n, seller: opts.seller ?? 7n }),
    outcomeRecorded: async (key: Hex) => recorded.has(key),
    pendingRecord: async (key: Hex) => pending.has(key),
  };
}

test('settled_suite_deal_reads_on_both_records', async () => {
  const both = [outcomeKey(FAMILY, DEAL, 3n, 0), outcomeKey(FAMILY, DEAL, 7n, 1)];
  assert.equal(await readOnBothRecords(ports({ recorded: both }), DEAL), 'both');
});

test('an_outcome_the_record_has_not_taken_yet_reads_as_waiting', async () => {
  const r = await readOnBothRecords(ports({ recorded: [outcomeKey(FAMILY, DEAL, 3n, 0)], pending: [pendingRecordKey(DEAL, 1)] }), DEAL);
  assert.equal(r, 'pending');
});

test('a_side_with_no_record_when_it_was_paid_reads_as_not_recorded', async () => {
  // The escrow takes each side's record id when the deal is paid in; a seller who
  // set up their record later is not on this deal's record, and nothing is waiting.
  assert.equal(await readOnBothRecords(ports({ recorded: [outcomeKey(FAMILY, DEAL, 3n, 0)] }), DEAL), 'none');
  assert.equal(await readOnBothRecords(ports({ seller: 0n }), DEAL), 'none');
});
