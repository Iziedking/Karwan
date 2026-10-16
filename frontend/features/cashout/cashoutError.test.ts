import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ApiError } from '@/core/api';
import { cashoutErrorKey } from './cashoutError';

const refused = (code: string | undefined, status = 409) => new ApiError(status, 'x', undefined, code, { code, error: 'x' });

test('each refusal the cash-out route gives reads as its own plain line', () => {
  assert.equal(cashoutErrorKey(refused('INSUFFICIENT_BALANCE')), 'notEnough');
  assert.equal(cashoutErrorKey(refused('NO_DEAL_WALLET')), 'walletUnavailable');
  assert.equal(cashoutErrorKey(refused('NO_BUYER_WALLET')), 'walletUnavailable');
  assert.equal(cashoutErrorKey(refused('WALLET_ACCOUNT')), 'walletUnavailable');
  assert.equal(cashoutErrorKey(refused('WITHDRAW_IN_PROGRESS')), 'busy');
  assert.equal(cashoutErrorKey(refused('NOT_SETTLED')), 'notSettled');
});

test('anything unknown falls back to try again', () => {
  assert.equal(cashoutErrorKey(refused(undefined, 500)), 'failed');
  assert.equal(cashoutErrorKey(new Error('network')), 'failed');
});

test('the cash-out screen shows the guard notice for a money-out refusal and never the raw backend text', () => {
  const view = readFileSync(new URL('./CashoutView.tsx', import.meta.url), 'utf8');
  assert.match(view, /moneyOutRefusalOf\(err\)/);
  assert.match(view, /<MoneyOutNotice/);
  assert.match(view, /cashoutErrorKey\(err\)/);
  assert.doesNotMatch(view, /err\.detail/);
});
