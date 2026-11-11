import test from 'node:test';
import assert from 'node:assert/strict';
import { agentMoveHref, bridgeRedirect, buyerTopUpHref, guaranteeStepHref, moneyHref, moneyTab } from './moneyRoutes';

const q = (s: string) => new URLSearchParams(s);

test('oldAddLinksOpenTheAddPage', () => {
  assert.equal(bridgeRedirect(q('direction=in')), '/add');
  assert.equal(bridgeRedirect(q('direction=in&money=v1')), '/add');
});

test('oldWithdrawLinksOpenTheWithdrawPageAndKeepTheAmount', () => {
  assert.equal(bridgeRedirect(q('direction=out')), '/withdraw');
  assert.equal(bridgeRedirect(q('direction=out&amount=12.5&to=0xabc')), '/withdraw?amount=12.5&to=0xabc');
});

test('paymentLinksRailsAndSendIntentsStayOnBridge', () => {
  assert.equal(bridgeRedirect(q('recipient=0x1111111111111111111111111111111111111111')), null);
  assert.equal(bridgeRedirect(q('rail=gateway')), null);
  assert.equal(bridgeRedirect(q('intent=send')), null);
  assert.equal(bridgeRedirect(q('intent=add')), null);
  assert.equal(bridgeRedirect(q('')), null);
  assert.equal(bridgeRedirect(q('money=v1')), null);
});

test('theMoneyTabReadsFromTheAddress', () => {
  assert.equal(moneyTab('agent'), 'agent');
  assert.equal(moneyTab('agents'), 'agent');
  assert.equal(moneyTab('guarantee'), 'guarantee');
  assert.equal(moneyTab(null), 'balance');
  assert.equal(moneyTab('nonsense'), 'balance');
  assert.equal(moneyHref('balance'), '/account');
  assert.equal(moneyHref('guarantee'), '/account?tab=guarantee');
});

test('agentAndGuaranteeMovesHaveTheirOwnPages', () => {
  assert.equal(agentMoveHref('topUp'), '/account/agent?move=topUp&agent=buyer');
  assert.equal(agentMoveHref('withdraw', 'seller'), '/account/agent?move=withdraw&agent=seller');
  assert.equal(guaranteeStepHref('take_out'), '/account/guarantee?step=take_out');
});

test('shortOfMoneyToAskOpensTheBuyingAgentTopUpWithWhatIsMissing', () => {
  assert.equal(buyerTopUpHref('23.67'), '/account/agent?move=topUp&agent=buyer&amount=23.67');
  assert.equal(buyerTopUpHref(undefined), '/account/agent?move=topUp&agent=buyer');
  assert.equal(buyerTopUpHref('0'), '/account/agent?move=topUp&agent=buyer');
});
