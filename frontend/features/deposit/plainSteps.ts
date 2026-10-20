import type { DepositRail } from './railModel';

/// Add and withdraw as one plain question each (view 19, Money board). Each
/// answer opens what already does that move: a rail panel, a page, or the
/// exchange note. The rails underneath are unchanged (railModel.ts).

export type AddOptionId = 'faucet' | 'address' | 'card' | 'fromWallet' | 'fromExchange';
export type WithdrawOptionId = 'ownWallet' | 'someone' | 'bank';

export type Opens = { rail: DepositRail } | { href: string } | { panel: 'exchange' } | null;

export interface PlainOption<Id extends string> {
  id: Id;
  /// Shown as coming, with nothing to press.
  soon?: true;
  opens: Opens;
}

export function addOptions(account: 'email' | 'wallet', network: 'testnet' | 'mainnet'): PlainOption<AddOptionId>[] {
  const faucet: PlainOption<AddOptionId>[] = network === 'testnet' ? [{ id: 'faucet', opens: { href: '/profile/wallets' } }] : [];
  if (account === 'email') {
    return [...faucet, { id: 'address', opens: { rail: 'direct' } }, { id: 'card', soon: true, opens: null }];
  }
  return [{ id: 'fromWallet', opens: { rail: 'cctp' } }, { id: 'fromExchange', opens: { panel: 'exchange' } }, ...faucet];
}

export function withdrawOptions(_account: 'email' | 'wallet'): PlainOption<WithdrawOptionId>[] {
  return [
    { id: 'ownWallet', opens: { rail: 'cctp' } },
    { id: 'someone', opens: { href: '/send' } },
    { id: 'bank', soon: true, opens: null },
  ];
}
