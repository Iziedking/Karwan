import assert from 'node:assert/strict';
import test from 'node:test';
import { anchorFor, helloDue, moodFor, pickNudge, stepFinished, type Moment, type NextMove, type Nudge } from './pickNudge';
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

/// Aman alive (view 57, 15 Nov evening): a moment, once, between deal moves and setup.
const paid: Moment = { id: 'escrow.seller.paid:0xd9:5', at: 5, mood: 'excited', line: 'paid', href: '/deals/0xd9', amountUsdc: '120' };

test('a deal waiting on the person comes first, then a moment, then a setup step', () => {
  assert.equal(pickNudge({ moves: [deliver, money], pathname: '/', closed: none, moment: paid })?.kind, 'approve_delivery');
  const m = pickNudge({ moves: [money, offers], pathname: '/', closed: none, moment: paid });
  assert.deepEqual(m, { key: 'moment:escrow.seller.paid:0xd9:5', kind: 'moment', href: '/deals/0xd9', moment: paid, amountUsdc: '120' });
  assert.equal(pickNudge({ moves: [money], pathname: '/', closed: none, moment: null })?.kind, 'setup_step');
  assert.equal(pickNudge({ moves: [money], pathname: '/', closed: new Set(['moment:escrow.seller.paid:0xd9:5']), moment: paid })?.kind, 'setup_step');
});

test('the face fits what Aman says', () => {
  const moment = pickNudge({ moves: [], pathname: '/', closed: none, moment: { ...paid, mood: 'sad', line: 'lapsed' } })!;
  assert.equal(moodFor(moment), 'sad');
  assert.equal(moodFor(pickNudge({ moves: [deliver], pathname: '/', closed: none })!), 'waiting');
  assert.equal(moodFor(pickNudge({ moves: [money], pathname: '/', closed: none })!), 'talking');
  assert.equal(moodFor(pickNudge({ moves: [offers], pathname: '/', closed: none })!), 'talking');
});

test('a hello once a day, on Home only, never on a money screen', () => {
  assert.equal(helloDue(undefined, '2026-11-15', '/app'), true);
  assert.equal(helloDue('2026-11-14', '2026-11-15', '/app'), true);
  assert.equal(helloDue('2026-11-15', '2026-11-15', '/app'), false);
  assert.equal(helloDue(undefined, '2026-11-15', '/market'), false);
  assert.equal(helloDue(undefined, '2026-11-15', '/send'), false);
});
