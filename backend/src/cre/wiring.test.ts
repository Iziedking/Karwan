import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeAbiParameters, keccak256, parseAbiParameters } from 'viem';
import { makeCheckApproved, makeOpenFee, makePartyOf } from './wiring.js';

const ADAPTER = '0x00000000000000000000000000000000000ada97';
const VERIFIER = '0x00000000000000000000000000000000000c4ec4';
const FAMILY = `0x${'f'.repeat(40)}`;
const DEAL = `0x${'d'.repeat(64)}`;
const EVIDENCE = `0x${'e'.repeat(64)}`;

function reader(verdict: { set: boolean; pass: boolean; evidenceHash: string }, verifier = VERIFIER) {
  const calls: string[] = [];
  return {
    calls,
    read: async (input: { address: string; functionName: string; args: readonly unknown[] }) => {
      calls.push(`${input.address}:${input.functionName}`);
      if (input.functionName === 'getTerms') return { verifier };
      if (input.functionName === 'verdictKey') return `0x${'1'.repeat(64)}`;
      if (input.functionName === 'verdictOf') return [verdict.set, verdict.pass, verdict.evidenceHash] as const;
      throw new Error(`unexpected ${input.functionName}`);
    },
  };
}

test('an attested result is confirmed from the adapter\'s stored verdict for the deal\'s own verifier', async () => {
  const r = reader({ set: true, pass: true, evidenceHash: EVIDENCE, pass: true });
  const check = makeCheckApproved(r.read, ADAPTER);
  assert.equal(await check({ family: FAMILY, dealId: DEAL, revision: 1, evidenceHash: EVIDENCE, pass: true }), true);
  assert.deepEqual(r.calls, [`${FAMILY}:getTerms`, `${ADAPTER}:verdictKey`, `${ADAPTER}:verdictOf`]);
});

test('a verdict whose result differs from the one posted is not confirmed', async () => {
  const r = reader({ set: true, pass: true, evidenceHash: EVIDENCE });
  assert.equal(await makeCheckApproved(r.read, ADAPTER)({ family: FAMILY, dealId: DEAL, revision: 1, evidenceHash: EVIDENCE, pass: false }), false);
});

test('no verdict, or a different evidence hash, is not confirmed', async () => {
  assert.equal(await makeCheckApproved(reader({ set: false, pass: false, evidenceHash: `0x${'0'.repeat(64)}` }).read, ADAPTER)({ family: FAMILY, dealId: DEAL, revision: 1, evidenceHash: EVIDENCE, pass: true }), false);
  assert.equal(await makeCheckApproved(reader({ set: true, pass: true, evidenceHash: `0x${'9'.repeat(64)}` }).read, ADAPTER)({ family: FAMILY, dealId: DEAL, revision: 1, evidenceHash: EVIDENCE, pass: true }), false);
});

test('a chain read that fails is not a confirmation', async () => {
  const failing = async () => {
    throw new Error('rpc down');
  };
  assert.equal(await makeCheckApproved(failing, ADAPTER)({ family: FAMILY, dealId: DEAL, revision: 1, evidenceHash: EVIDENCE, pass: true }), false);
});

test('a wallet is a party when the identity registry binds it to the buyer or the seller', async () => {
  const BUYER = `0x${'b'.repeat(40)}`;
  const SELLER = `0x${'5'.repeat(40)}`;
  const AGENT = `0x${'a'.repeat(40)}`;
  const IDENTITY = `0x${'1'.repeat(40)}`;
  const ids: Record<string, bigint> = { [BUYER]: 7n, [AGENT]: 7n, [SELLER]: 9n };
  const read = async (input: { address: string; functionName: string; args: readonly unknown[] }) => {
    if (input.functionName === 'accountOf') return { payer: BUYER, payerId: 7n };
    if (input.functionName === 'getTerms') return { seller: SELLER, verifier: VERIFIER };
    if (input.functionName === 'identityOf') return ids[(input.args[0] as string).toLowerCase()] ?? 0n;
    throw new Error(input.functionName);
  };
  const partyOf = makePartyOf(read, IDENTITY);
  assert.equal(await partyOf(BUYER, FAMILY, DEAL), 'buyer');
  assert.equal(await partyOf(AGENT, FAMILY, DEAL), 'buyer');
  assert.equal(await partyOf(SELLER, FAMILY, DEAL), 'seller');
  assert.equal(await partyOf(`0x${'3'.repeat(40)}`, FAMILY, DEAL), null);
});

const FEE_AUTH = {
  from: `0x${'b'.repeat(40)}`,
  to: `0x${'fe'.repeat(20)}`,
  value: '250000',
  validAfter: '0',
  validBefore: '1800003600',
  nonce: `0x${'a'.repeat(64)}`,
  signature: `0x${'1b'.repeat(65)}`,
};
const FEE_RUN = keccak256(encodeAbiParameters(parseAbiParameters('address, bytes32'), [FEE_AUTH.from as `0x${string}`, FEE_AUTH.nonce as `0x${string}`]));

test('a fee payment counts once Arc shows its run open, keyed as the contract keys it', async () => {
  const submitted: unknown[] = [];
  const open = makeOpenFee({ submit: async (a) => { submitted.push(a); }, runState: async (id) => (id === FEE_RUN ? 1 : 0) });
  assert.deepEqual(await open(FEE_AUTH), { runId: FEE_RUN });
  assert.deepEqual(submitted, [FEE_AUTH]);
});

test('a run another relayer opened first still counts; a refused payment does not', async () => {
  const raced = makeOpenFee({ submit: async () => { throw new Error('RunExists'); }, runState: async () => 1 });
  assert.deepEqual(await raced(FEE_AUTH), { runId: FEE_RUN });
  const refused = makeOpenFee({ submit: async () => { throw new Error('FiatTokenV2: invalid signature'); }, runState: async () => 0 });
  assert.ok('error' in (await refused(FEE_AUTH)));
  const spent = makeOpenFee({ submit: async () => {}, runState: async () => 2 });
  assert.ok('error' in (await spent(FEE_AUTH)));
});
