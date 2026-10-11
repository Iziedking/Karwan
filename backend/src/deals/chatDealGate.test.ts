import assert from 'node:assert/strict';
import test from 'node:test';
import { chatDealGate, chatFundingRefusal, type ChatFundingDeps } from './chatDealGate.js';

const work = 'work_verified' as const;
const id = 'id_verified' as const;

test('a deal under 100 USDC between verified people passes', () => {
  assert.deepEqual(chatDealGate({ amountUsdc: 99.99, buyer: 'person_verified', seller: work }), { ok: true });
});

test('a deal of 100 USDC or more waits until both have an ID check', () => {
  const r = chatDealGate({ amountUsdc: 100, buyer: work, seller: work });
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, 'needs_id');
  assert.deepEqual(chatDealGate({ amountUsdc: 250, buyer: id, seller: id }), { ok: true });
  assert.equal(chatDealGate({ amountUsdc: 250, buyer: id, seller: work }).ok, false);
});

test('a deal above the 1,000 USDC beta cap is refused', () => {
  const r = chatDealGate({ amountUsdc: 1000.01, buyer: id, seller: id });
  assert.equal((r as { reason: string }).reason, 'over_cap');
  assert.deepEqual(chatDealGate({ amountUsdc: 1000, buyer: id, seller: id }), { ok: true });
});

test('a buyer who has not passed the person check cannot fund', () => {
  assert.equal((chatDealGate({ amountUsdc: 20, buyer: 'registered', seller: work }) as { reason: string }).reason, 'not_verified');
});

test('every refusal explains itself in plain words', () => {
  for (const input of [
    { amountUsdc: 100, buyer: work, seller: work },
    { amountUsdc: 5000, buyer: id, seller: id },
    { amountUsdc: 20, buyer: 'registered' as const, seller: work },
  ]) {
    const r = chatDealGate(input);
    assert.equal(r.ok, false);
    assert.match((r as { message: string }).message, /usdc|verif/i);
  }
});

const CHAT_BUYER = '0x00000000000000000000000000000000000000c1';
const WEB_BUYER = '0x00000000000000000000000000000000000000b1';
const SELLER = '0x00000000000000000000000000000000000000a1';

function deps(over: Partial<ChatFundingDeps> = {}): ChatFundingDeps {
  return {
    enabled: true,
    isChatAccount: async (address) => address === CHAT_BUYER,
    levelOf: async () => work,
    ...over,
  };
}

test('a chat account paying from any session is held to the beta limits', async () => {
  const r = await chatFundingRefusal(deps(), { buyer: CHAT_BUYER, seller: SELLER, amountUsdc: 100 });
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, 'needs_id');
  assert.deepEqual(await chatFundingRefusal(deps(), { buyer: CHAT_BUYER, seller: SELLER, amountUsdc: 50 }), { ok: true });
});

test('the buyer address is compared without regard to case', async () => {
  const r = await chatFundingRefusal(deps(), { buyer: CHAT_BUYER.toUpperCase().replace('0X', '0x'), seller: SELLER, amountUsdc: 2_000 });
  assert.equal(r.ok, false);
});

test('an account that holds its own keys and an off switch both pass untouched', async () => {
  assert.deepEqual(await chatFundingRefusal(deps(), { buyer: WEB_BUYER, seller: SELLER, amountUsdc: 5_000 }), { ok: true });
  assert.deepEqual(
    await chatFundingRefusal(deps({ enabled: false }), { buyer: CHAT_BUYER, seller: SELLER, amountUsdc: 5_000 }),
    { ok: true },
  );
});

test('every path that pays into escrow asks the gate before money moves', async () => {
  const { readFile } = await import('node:fs/promises');
  const deals = await readFile(new URL('../routes/deals.ts', import.meta.url), 'utf8');
  const fund = deals.slice(deals.indexOf("dealsRoutes.post('/direct/:jobId/fund'"), deals.indexOf("dealsRoutes.post('/direct/:jobId/delivered'"));
  assert.ok(fund.indexOf('chatFundingRefusal(') > 0, 'direct funding asks the gate');
  assert.ok(fund.indexOf('chatFundingRefusal(') < fund.indexOf('inFlight.add(jobId)'), 'before anything is provisioned or signed');

  const buyer = await readFile(new URL('../agents/buyer.ts', import.meta.url), 'utf8');
  const approve = buyer.slice(buyer.indexOf('export async function approveAgentMatch('));
  const body = approve.slice(0, approve.indexOf('\nexport '));
  assert.ok(body.indexOf('chatFundingRefusal(') > 0, 'matched funding asks the gate');
  assert.ok(body.indexOf('chatFundingRefusal(') < body.indexOf('sellerLinkRefusal('), 'before any chain step');
});

test('the refusal says these deals are not open yet, and never sends anyone to an ID check that does not exist', () => {
  const r = chatDealGate({ amountUsdc: 150, buyer: work, seller: work });
  assert.equal(r.ok, false);
  const message = (r as { message: string }).message;
  assert.equal(message, 'Deals of 100 USDC and above are not open in this beta. Split the work into separate deals under 100 USDC.');
  assert.doesNotMatch(message, /ID check/i);
});
