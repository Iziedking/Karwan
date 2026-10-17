import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// The credit passport, repayment and concentration reads are not tied to a
/// market request, so they count as reads from outside: only a person who
/// turned on "Let agents outside Karwan check my record" can be read, and a
/// refusal costs nothing.
///
///   npx tsx --test src/routes/x402SideDoors.test.ts

const source = readFileSync(new URL('./x402.ts', import.meta.url), 'utf8');

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-x402-side-doors-')));
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
process.env.KARWAN_TREASURY_ADDR = `0x${'7'.repeat(40)}`;

const { x402Routes } = await import('./x402.js');
const { upsertProfile, getProfile } = await import('../db/profiles.js');

const SUBJECT = `0x${'d'.repeat(40)}`;
const PATHS = [`/credit-passport/${SUBJECT}`, `/repayment-behavior/${SUBJECT}`, `/concentration/${SUBJECT}`];
const get = (path: string) => x402Routes.request(new Request(`http://local${path}`));

async function setOutside(on: boolean) {
  const current = await getProfile(SUBJECT);
  await upsertProfile({
    ...(current ?? { address: SUBJECT, role: 'seller', displayName: 'Ada' }),
    reputationSources: { outsideReadable: on },
  } as never);
}

test('passport, repayment and concentration reads are refused without the outside switch, before any payment', async () => {
  await setOutside(false);
  for (const path of PATHS) {
    const res = await get(path);
    assert.equal(res.status, 403, path);
    assert.equal(res.headers.get('payment-required'), null, `${path} asked for payment`);
  }
});

test('with the outside switch on, the same reads reach the payment gate', async () => {
  await setOutside(true);
  for (const path of PATHS) assert.equal((await get(path)).status, 402, path);
});

test('every side door checks the outside switch before it charges', () => {
  for (const route of ["'/credit-passport/:address'", "'/repayment-behavior/:address'", "'/concentration/:address'"]) {
    const start = source.indexOf(`x402Routes.get(${route}`);
    assert.ok(start > 0, route);
    const body = source.slice(start, source.indexOf('x402Routes.get(', start + 10));
    const gate = body.indexOf('passportReadAllowed(');
    assert.ok(gate > 0, `${route} checks the outside switch`);
    assert.ok(gate < body.indexOf('chargeRead('), `${route} checks before it charges`);
  }
});

test("Karwan's own agents name their wallet and the request when they pay for a passport read", () => {
  const client = readFileSync(new URL('../x402/buyerClient.ts', import.meta.url), 'utf8');
  const fn = client.slice(client.indexOf('export async function paidCreditPassport('));
  assert.match(fn, /credit-passport\/\$\{subjectAddress\}\$\{ref \? `\?ref=\$\{encodeURIComponent\(ref\)\}` : ''\}/);
  assert.match(fn, /'x-karwan-payer-agent': payerAgentAddress/);
});
