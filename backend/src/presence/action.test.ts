import assert from 'node:assert/strict';
import test from 'node:test';
import { actionDigest, actionText, presenceAction, type PresenceAction } from './action.js';

const TESTNET = 5042002;
const MAINNET = 5042;

const cashOut = (over: Partial<PresenceAction> = {}) =>
  presenceAction({
    kind: 'move_out',
    wallet: '0x00000000000000000000000000000000000000aa',
    amountMicros: '50000000',
    recipient: '0x00000000000000000000000000000000000000bb',
    detail: { chain: 'arc', agent: 'seller' },
    ...over,
  });

test('same_action_same_digest_whatever_key_order_or_case', () => {
  const a = presenceAction({ kind: 'move_out', wallet: '0xAbC', amountMicros: '50000000', recipient: '0xDEF', detail: { chain: 'arc', agent: 'seller' } });
  const b = presenceAction({ kind: 'move_out', wallet: '0xabc', amountMicros: '50000000', recipient: '0xdef', detail: { agent: 'seller', chain: 'arc' } });
  assert.equal(actionDigest(a, TESTNET), actionDigest(b, TESTNET));
  assert.match(actionDigest(a, TESTNET), /^0x[0-9a-f]{64}$/);
});

test('a_solana_recipient_keeps_its_case', () => {
  const sol = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  assert.equal(cashOut({ recipient: sol }).recipient, sol);
  assert.ok(actionText(cashOut({ recipient: sol }), TESTNET).includes(`To: ${sol}`));
});

test('each_field_and_the_chain_change_the_digest', () => {
  const base = actionDigest(cashOut(), TESTNET);
  assert.notEqual(actionDigest(cashOut({ kind: 'deal_insurance' }), TESTNET), base);
  assert.notEqual(actionDigest(cashOut({ wallet: '0x00000000000000000000000000000000000000ab' }), TESTNET), base);
  assert.notEqual(actionDigest(cashOut({ amountMicros: '50000001' }), TESTNET), base);
  assert.notEqual(actionDigest(cashOut({ amountMicros: null }), TESTNET), base);
  assert.notEqual(actionDigest(cashOut({ recipient: '0x00000000000000000000000000000000000000bc' }), TESTNET), base);
  assert.notEqual(actionDigest(cashOut({ recipient: null }), TESTNET), base);
  assert.notEqual(actionDigest(cashOut({ detail: { chain: 'base', agent: 'seller' } }), TESTNET), base);
  assert.notEqual(actionDigest(cashOut(), MAINNET), base);
});

test('amount_must_be_a_non_negative_integer_string', () => {
  for (const bad of ['1.5', '-1', '', ' 5', '1e6', '0x10']) {
    assert.throws(() => cashOut({ amountMicros: bad }), undefined, bad);
  }
  assert.equal(cashOut({ amountMicros: '0' }).amountMicros, '0');
});

test('action_text_names_amount_network_and_digest', () => {
  const action = cashOut();
  const text = actionText(action, TESTNET);
  assert.match(text, /Karwan confirmation/);
  assert.match(text, /50 USDC/);
  assert.match(text, /Arc testnet/);
  assert.ok(text.includes(actionDigest(action, TESTNET)));
  assert.match(actionText(cashOut({ amountMicros: '1250000' }), MAINNET), /1\.25 USDC/);
  assert.match(actionText(cashOut(), MAINNET), /Network: Arc\n/);
});

test('an agent rule names the limits the person confirms, and each figure changes the code', () => {
  const rule = (perDeal: string) => presenceAction({ kind: 'agent_rule', wallet: '0xAbC', amountMicros: null, recipient: null, detail: { lock: 'on', perDeal, perWeek: '90000000', perDay: '3', who: 'record' } });
  const text = actionText(rule('30000000'), 5042002);
  for (const line of ['Let your agent lock money', 'Most for one deal: 30 USDC', 'Most in a week: 90 USDC', 'Who: people with a record', 'Locks in a day: 3']) {
    assert.ok(text.split('\n').includes(line), line);
  }
  assert.notEqual(actionDigest(rule('30000000'), 5042002), actionDigest(rule('3000000000'), 5042002));
  const bare = actionText(presenceAction({ kind: 'agent_rule', wallet: '0xabc', amountMicros: null, recipient: null, detail: { lock: 'on' } }), 5042002);
  assert.doesNotMatch(bare, /Most for|Who:|Locks in/);
});
