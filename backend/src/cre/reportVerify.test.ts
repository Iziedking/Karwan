import assert from 'node:assert/strict';
import test from 'node:test';
import { concatHex, keccak256, toHex, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { parseReportHeader, verifyDonReport } from './reportVerify.js';

const nodes = Array.from({ length: 4 }, () => privateKeyToAccount(generatePrivateKey()));
const WORKFLOW = `0x${'ab'.repeat(32)}` as Hex;
const OWNER = '0x6ae4fe38dfbbc609d720b2f0814d72e1a94cc104';

function rawReport(over: Partial<{ donId: number; workflowId: Hex; owner: string; body: Hex }> = {}): Hex {
  const donId = (over.donId ?? 7).toString(16).padStart(8, '0');
  return concatHex([
    '0x01',
    `0x${'11'.repeat(32)}`,
    '0x00000001',
    `0x${donId}`,
    '0x00000001',
    over.workflowId ?? WORKFLOW,
    `0x${'63'.repeat(10)}`,
    (over.owner ?? OWNER) as Hex,
    '0x0001',
    over.body ?? '0xdeadbeef',
  ]);
}

const CONTEXT = `0x${'22'.repeat(96)}` as Hex;

async function sign(raw: Hex, signers = nodes.slice(0, 2)): Promise<Hex[]> {
  const hash = keccak256(concatHex([keccak256(raw), CONTEXT]));
  return Promise.all(signers.map((n) => n.sign({ hash })));
}

const deps = {
  readDon: async (donId: number) => {
    assert.equal(donId, 7);
    return { f: 1, signers: new Set(nodes.map((n) => n.address.toLowerCase())) };
  },
  workflowIds: new Set([WORKFLOW]),
  workflowOwner: OWNER,
  trust: 'verified' as const,
};

test('the header gives the DON, workflow, owner and body', () => {
  const h = parseReportHeader(rawReport({ body: '0xcafe' }));
  assert.deepEqual(h, { donId: 7, workflowId: WORKFLOW, workflowOwner: OWNER, body: '0xcafe' });
  assert.equal(parseReportHeader('0x01'), null);
});

test('f+1 distinct node signatures over this report verify', async () => {
  const raw = rawReport();
  const result = await verifyDonReport({ rawReport: raw, context: CONTEXT, signatures: await sign(raw) }, deps);
  assert.deepEqual(result, { ok: true, simulated: false, workflowId: WORKFLOW, body: '0xdeadbeef' });
});

test('f signatures are not enough', async () => {
  const raw = rawReport();
  const result = await verifyDonReport({ rawReport: raw, context: CONTEXT, signatures: await sign(raw, nodes.slice(0, 1)) }, deps);
  assert.deepEqual(result, { ok: false, reason: 'INSUFFICIENT_SIGNATURES' });
});

test('one signature repeated does not count twice', async () => {
  const raw = rawReport();
  const [one] = await sign(raw, nodes.slice(0, 1));
  const result = await verifyDonReport({ rawReport: raw, context: CONTEXT, signatures: [one!, one!] }, deps);
  assert.deepEqual(result, { ok: false, reason: 'INSUFFICIENT_SIGNATURES' });
});

test('a signer outside the DON does not count', async () => {
  const raw = rawReport();
  const stranger = privateKeyToAccount(generatePrivateKey());
  const result = await verifyDonReport({ rawReport: raw, context: CONTEXT, signatures: await sign(raw, [nodes[0]!, stranger]) }, deps);
  assert.deepEqual(result, { ok: false, reason: 'INSUFFICIENT_SIGNATURES' });
});

test('another workflow or another owner is refused before any signature work', async () => {
  const other = rawReport({ workflowId: `0x${'cd'.repeat(32)}` });
  assert.deepEqual(await verifyDonReport({ rawReport: other, context: CONTEXT, signatures: await sign(other) }, deps), { ok: false, reason: 'UNKNOWN_WORKFLOW' });
  const owner = rawReport({ owner: `0x${'99'.repeat(20)}` });
  assert.deepEqual(await verifyDonReport({ rawReport: owner, context: CONTEXT, signatures: await sign(owner) }, deps), { ok: false, reason: 'UNKNOWN_OWNER' });
});

test('a short report is refused', async () => {
  assert.deepEqual(await verifyDonReport({ rawReport: '0x01', context: CONTEXT, signatures: [] }, deps), { ok: false, reason: 'BAD_HEADER' });
});

test('simulation trust skips signatures but says so, and production refuses it', async () => {
  const raw = rawReport();
  const sim = { ...deps, trust: 'simulation' as const };
  assert.deepEqual(await verifyDonReport({ rawReport: raw, context: CONTEXT, signatures: [] }, sim), { ok: true, simulated: true, workflowId: WORKFLOW, body: '0xdeadbeef' });
  assert.deepEqual(await verifyDonReport({ rawReport: raw, context: CONTEXT, signatures: [] }, { ...sim, production: true }), { ok: false, reason: 'SIMULATION_IN_PRODUCTION' });
});

test('hex fields are accepted with or without 0x', async () => {
  const raw = rawReport();
  const sigs = await sign(raw);
  const result = await verifyDonReport({ rawReport: raw.slice(2), context: CONTEXT.slice(2), signatures: sigs.map((s) => s.slice(2)) }, deps);
  assert.equal(result.ok, true);
  assert.equal(toHex(1), '0x1');
});
