import assert from 'node:assert/strict';
import test from 'node:test';

/// View 73 in chat: a seller alert names the budget as a range, the seller's
/// question says when the buyer has a better offer, and the buyer is told when
/// their agent stops to ask, with the seller's price and the gap.

process.env.NODE_ENV = 'test';
const { recipientsFor, summaryFor } = await import('./notifier.js');
const { alertNote } = await import('../find/alerts.js');
const { tg } = await import('../i18n/telegram.js');

const money = async (p: string, usdc: number) => (p === '0xamaka' ? `${usdc} €` : `₦${Math.round(usdc * 1346).toLocaleString('en')}`);
const locale = async (p: string) => (p === '0xamaka' ? ('fr' as const) : ('en' as const));
const alert = (to: string, bargain: boolean) =>
  alertNote(
    { to, need: 'A tailor to make a dress', budgetUsdc: '75', jobId: '0xjob', kind: 'remote', distance: { key: 'unknown' }, byDay: null, reminder: false },
    { locale, money, bargain: () => bargain },
  );

test('a bargaining request alerts sellers with a range in their own money, never the budget', async () => {
  assert.equal((await alert('0xngozi', true)).lines[1], 'Budget ₦69,992 to ₦100,950');
  assert.equal((await alert('0xamaka', true)).lines[1], 'Budget de 52 € à 75 €');
  for (const line of (await alert('0xngozi', true)).lines) assert.doesNotMatch(line, /about/);
});

test('a request from before view 73 still names its budget', async () => {
  assert.equal((await alert('0xngozi', false)).lines[1], 'Budget about ₦100,950');
});

const question = (betterOffer?: boolean) => ({
  type: 'agent.suggestion' as const, actor: 'seller' as const, ts: 0,
  payload: {
    sellerUser: '0xseller', jobId: '0xjob', questionId: 'q1', kind: 'counter-below-floor', title: 'Logo',
    budgetRange: { lowUsdc: 150, highUsdc: 230 }, dueDays: 3, limit: 230, priceUsdc: '230.00', days: 3, theirPriceUsdc: '200',
    ...(betterOffer === undefined ? {} : { betterOffer }),
  },
});

test('the seller hears the buyer has a better offer, and only when it is true', () => {
  assert.match(summaryFor(question(true), 'seller')?.text ?? '', /Take 200 USDC or hold at 230\.00 USDC\? The buyer has a better offer\./);
  assert.doesNotMatch(summaryFor(question(false), 'seller')?.text ?? '', /better offer/);
  assert.doesNotMatch(summaryFor(question(), 'seller')?.text ?? '', /better offer/);
});

const yourCall = (over: Record<string, unknown> = {}) => ({
  type: 'agent.decision' as const, jobId: '0xjob', actor: 'buyer' as const, ts: 0,
  payload: { scope: 'bargain-ask', buyerUser: '0xBUYER', seller: '0x00000000000000000000000000000000000000a1', sellerName: 'Ada', title: 'Logo design', priceUsdc: '262.00', offeredUsdc: '230.00', gapUsdc: '32.00', ...over },
});

test('only the buyer is told their agent is waiting on them', async () => {
  assert.deepEqual(await recipientsFor(yourCall()), [{ address: '0xbuyer', role: 'buyer' }]);
  assert.deepEqual(await recipientsFor(yourCall({ scope: 'counter' })), []);
  assert.equal(summaryFor(yourCall(), 'seller'), null);
});

test('the buyer reads the seller price, their agent offer and the gap, in their language', () => {
  assert.equal(
    summaryFor(yourCall(), 'buyer', 'en')?.text,
    '*Your call: Logo design*\nAda asks 262 USDC. Your agent offered 230 USDC, 32 USDC less.\nAgree at 262 USDC, or keep bargaining? Reply here. Agreeing moves no money.',
  );
  assert.equal(
    summaryFor(yourCall(), 'buyer', 'fr')?.text,
    "*À vous de décider : Logo design*\nAda demande 262 USDC. Votre agent a proposé 230 USDC, soit 32 USDC de moins.\nAccepter à 262 USDC, ou continuer à négocier ? Répondez ici. Accepter ne déplace pas d'argent.",
  );
  assert.match(summaryFor(yourCall({ title: '' }), 'buyer', 'en')?.text ?? '', /^\*Your call\*\n/);
  const url = summaryFor(yourCall(), 'buyer', 'en')?.url;
  if (url) assert.match(url, /\/jobs\/0xjob$/, 'the button opens the request');
});

test('every new chat line is written in all five languages', () => {
  const keys = ['alert.budgetRange', 'bargain.yourCall', 'bargain.yourCallOn', 'bargain.yourCallAsk', 'bargain.yourCallChoice'] as const;
  for (const key of keys) {
    const en = tg(key as never, 'en');
    assert.doesNotMatch(en, /^[a-z]+\.[A-Za-z.]+$/, `${key} has English copy`);
    for (const l of ['ar', 'fr', 'hi', 'sw'] as const) assert.notEqual(tg(key as never, l), en, `${key} in ${l}`);
  }
});
