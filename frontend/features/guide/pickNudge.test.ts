import assert from 'node:assert/strict';
import test from 'node:test';
import { anchorFor, pickNudge, stepFinished, type NextMove, type Nudge } from './pickNudge';
import { nextMoveCopy } from '@/shared/i18n/messages/nextMove';

const deliver: NextMove = { kind: 'approve_delivery', ref: '0xd1', href: '/deals/0xd1', amountUsdc: '120' };
const offers: NextMove = { kind: 'choose_offer', ref: '0xj1', href: '/jobs/0xj1', count: 2 };
const money: NextMove = { kind: 'setup_step', step: 'money', href: '/add' };
const none = new Set<string>();

test('the most urgent move shows', () => {
  assert.equal(pickNudge({ moves: [deliver, offers], pathname: '/', closed: none })?.kind, 'approve_delivery');
});

test('never on the page the move points to', () => {
  assert.equal(pickNudge({ moves: [deliver, offers], pathname: '/deals/0xd1', closed: none })?.kind, 'choose_offer');
  assert.equal(pickNudge({ moves: [deliver], pathname: '/deals/0xd1/', closed: none }), null);
});

test('a move closed this visit stays closed', () => {
  assert.equal(pickNudge({ moves: [deliver, offers], pathname: '/', closed: new Set(['approve_delivery:0xd1']) })?.kind, 'choose_offer');
});

test('a setup step shows with its step, after deal moves', () => {
  assert.deepEqual(pickNudge({ moves: [money], pathname: '/', closed: none }), { key: 'setup_step:money', kind: 'setup_step', step: 'money', href: '/add' });
  assert.equal(pickNudge({ moves: [deliver, money], pathname: '/', closed: none })?.kind, 'approve_delivery');
  assert.equal(pickNudge({ moves: [money], pathname: '/add', closed: none }), null, 'never on the page the step opens');
});

test('nothing to pick from no moves', () => {
  assert.equal(pickNudge({ moves: [], pathname: '/', closed: none }), null);
});

test('a step is finished once the server stops naming it', () => {
  assert.equal(stepFinished('money', [money]), false);
  assert.equal(stepFinished('money', [{ kind: 'setup_step', step: 'agent_money', href: '/account?tab=agent' }]), true);
  assert.equal(stepFinished('money', []), true);
  assert.equal(stepFinished(null, []), false);
});

test('every move has a line and a button in every language, with no dashes', () => {
  for (const [locale, copy] of Object.entries(nextMoveCopy)) {
    for (const [kind, m] of Object.entries(copy.moves)) {
      assert.ok(m.line && m.action, `${locale} ${kind}`);
      assert.doesNotMatch(m.line + m.action, /—|–/, `${locale} ${kind}`);
    }
    assert.match(copy.moves.approve_delivery.line, /\{amount\}/, locale);
    assert.match(copy.moves.choose_offer.line, /\{count\}/, locale);
    assert.match(copy.moves.deliver_soon.line, /\{days\}/, locale);
    for (const [step, m] of Object.entries(copy.setup)) {
      assert.ok(m.line && m.action, `${locale} ${step}`);
      assert.doesNotMatch(m.line + m.action, /—|–/, `${locale} ${step}`);
    }
    assert.ok(copy.firstDealOwnAction, locale);
  }
});

test('each move names the part of the page Aman sits beside (view 57)', () => {
  const n = (kind: Nudge['kind'], key = `${kind}:0xr1`): Nudge => ({ key, kind, href: '/x' });
  const step = (s: NonNullable<Nudge['step']>): Nudge => ({ key: `setup_step:${s}`, kind: 'setup_step', step: s, href: '/x' });
  assert.equal(anchorFor(step('money')), 'balance');
  assert.equal(anchorFor(step('agent_money')), 'agent');
  assert.equal(anchorFor(step('agent_limits')), 'agent');
  for (const s of ['setup', 'telegram', 'first_deal'] as const) assert.equal(anchorFor(step(s)), null, s);
  assert.equal(anchorFor(n('choose_offer')), 'request:0xr1');
  assert.equal(anchorFor(n('approve_match')), 'request:0xr1');
  for (const kind of ['dispute_statement', 'approve_delivery', 'answer_cancel', 'answer_extension', 'take_back', 'fund_deal', 'agree_terms', 'deliver_soon'] as const) {
    assert.equal(anchorFor(n(kind)), 'deal-move', kind);
  }
  assert.equal(anchorFor(n('choose_offer', 'choose_offer:')), null);
});
