import assert from 'node:assert/strict';
import test from 'node:test';
import { createClientConfirm, type ClientConfirmDeps, type ConfirmRequest } from './clientConfirm.js';
import type { StoredFact } from './evidence.js';

const now = Date.UTC(2026, 9, 12);

function setup(opts: { clientVerified?: boolean } = {}) {
  const records = new Map<string, ConfirmRequest>();
  const sent: Array<{ to: string; params: string[]; buttonIds: string[] }> = [];
  const facts: StoredFact[] = [];
  const corroborated: string[] = [];
  let n = 0;
  const deps: ClientConfirmDeps = {
    now: () => now,
    newId: () => `req${++n}`,
    hashNumber: (num) => `h:${num.replace(/\D/g, '')}`,
    numberHashOf: async (address) => (address === '0xada' ? 'h:2348000000001' : null),
    getRequest: async (id) => records.get(id) ?? null,
    putRequest: async (r) => {
      records.set(r.id, r);
    },
    listRequests: async () => [...records.values()],
    sendTemplate: async (to, params, buttonIds) => {
      sent.push({ to, params, buttonIds });
    },
    isPersonVerified: async () => !!opts.clientVerified,
    addFact: async (_address, f) => {
      facts.push(f);
      return true;
    },
    corroborate: async (_address, factId) => {
      corroborated.push(factId);
    },
  };
  return { cc: createClientConfirm(deps), sent, facts, records, corroborated };
}

const ask = (cc: ReturnType<typeof createClientConfirm>, client = '+234 800 000 0002') =>
  cc.request({ subject: '0xada', subjectName: 'Ada Builds', clientNumber: client, job: 'a landing page', month: 'March 2026' });

test('a request sends the confirm_work template to the client with Yes and No', async () => {
  const { cc, sent } = setup();
  const r = await ask(cc);
  assert.equal(r.ok, true);
  assert.equal(sent[0].to, '2348000000002');
  assert.deepEqual(sent[0].params, ['Ada Builds', 'a landing page', 'March 2026']);
  assert.deepEqual(sent[0].buttonIds, ['cw:yes:req1', 'cw:no:req1']);
});

test('the subject cannot confirm their own work', async () => {
  const { cc, sent } = setup();
  assert.deepEqual(await ask(cc, '+234 800 000 0001'), { ok: false, reason: 'own_number' });
  assert.equal(sent.length, 0);
});

test('yes from the asked number records a client confirmation fact', async () => {
  const { cc, facts } = setup();
  await ask(cc);
  const f = await cc.answer('req1', '2348000000002', true);
  assert.equal(f?.kind, 'client_confirmation');
  assert.equal(facts.length, 1);
  assert.equal(facts[0].independent, false, 'an unverified client is not independent yet');
});

test('a client who is person verified makes the fact independent', async () => {
  const { cc, facts } = setup({ clientVerified: true });
  await ask(cc);
  await cc.answer('req1', '2348000000002', true);
  assert.equal(facts[0].independent, true);
});

test('an answer from any other number is ignored', async () => {
  const { cc, facts } = setup();
  await ask(cc);
  assert.equal(await cc.answer('req1', '2348999999999', true), null);
  assert.equal(facts.length, 0);
});

test('no is kept as evidence against the claim and adds no fact', async () => {
  const { cc, facts, records } = setup();
  await ask(cc);
  assert.equal(await cc.answer('req1', '2348000000002', false), null);
  assert.equal(facts.length, 0);
  assert.equal(records.get('req1')?.status, 'no');
});

test('a request is answered once', async () => {
  const { cc, facts } = setup();
  await ask(cc);
  await cc.answer('req1', '2348000000002', true);
  assert.equal(await cc.answer('req1', '2348000000002', true), null);
  assert.equal(facts.length, 1);
});

test('one client confirms at most three jobs for the same person', async () => {
  const { cc } = setup();
  for (let i = 1; i <= 3; i++) {
    await ask(cc);
    await cc.answer(`req${i}`, '2348000000002', true);
  }
  assert.deepEqual(await ask(cc), { ok: false, reason: 'client_limit' });
});

test('a Yes from a verified client also backs that invoice; a No does not', async () => {
  const { cc, corroborated } = setup({ clientVerified: true });
  await cc.request({ subject: '0xada', subjectName: 'Ada Builds', clientNumber: '+2348000000002', job: 'a landing page', month: 'March 2026', invoiceFactId: 'inv-1' });
  await cc.answer('req1', '2348000000002', true);
  assert.deepEqual(corroborated, ['inv-1']);
  await cc.request({ subject: '0xada', subjectName: 'Ada Builds', clientNumber: '+2348000000002', job: 'a logo', month: 'April 2026', invoiceFactId: 'inv-2' });
  await cc.answer('req2', '2348000000002', false);
  assert.deepEqual(corroborated, ['inv-1']);
});

test('a Yes from a client who is not person verified does not back the invoice', async () => {
  const { cc, corroborated, facts } = setup();
  await cc.request({ subject: '0xada', subjectName: 'Ada Builds', clientNumber: '+2348000000002', job: 'a landing page', month: 'March 2026', invoiceFactId: 'inv-1' });
  await cc.answer('req1', '2348000000002', true);
  assert.deepEqual(corroborated, []);
  assert.equal(facts[0]?.independent, false);
});
