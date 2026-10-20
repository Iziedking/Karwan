import type { AgentKey } from '@/features/money/moneySheetModel';

/// What each wallet on the balance page lets you do, as button tiles (view 19,
/// Money board; owner 20 Oct 2026). Your wallet adds, takes out, sends and asks
/// to be paid; each agent wallet moves money to and from your wallet.

export type WalletTab = 'you' | 'buyer' | 'seller';
export type WalletActionKey = 'add' | 'withdraw' | 'send' | 'request' | 'topUp' | 'moveBack' | 'moveEarnings';
/// Which line of copy explains the tile; the add tile depends on the account.
export type WalletActionNote = WalletActionKey | 'topUpSeller' | 'addEmail' | 'addWallet' | 'addEmailTestnet' | 'addWalletTestnet';
export type WalletActionIcon = 'plus' | 'out' | 'send' | 'request' | 'back';

export interface WalletAction {
  key: WalletActionKey;
  note: WalletActionNote;
  icon: WalletActionIcon;
  primary: boolean;
  /// A page to open, or an instant move between your wallet and an agent.
  go: { href: string } | { move: 'topUp' | 'withdraw'; agent: AgentKey };
}

export function walletActions(tab: WalletTab, account: 'email' | 'wallet', network: 'testnet' | 'mainnet'): WalletAction[] {
  if (tab === 'buyer') {
    return [
      { key: 'topUp', note: 'topUp', icon: 'plus', primary: true, go: { move: 'topUp', agent: 'buyer' } },
      { key: 'moveBack', note: 'moveBack', icon: 'back', primary: false, go: { move: 'withdraw', agent: 'buyer' } },
    ];
  }
  if (tab === 'seller') {
    return [
      { key: 'moveEarnings', note: 'moveEarnings', icon: 'back', primary: true, go: { move: 'withdraw', agent: 'seller' } },
      { key: 'topUp', note: 'topUpSeller', icon: 'plus', primary: false, go: { move: 'topUp', agent: 'seller' } },
    ];
  }
  const addNote = `add${account === 'email' ? 'Email' : 'Wallet'}${network === 'testnet' ? 'Testnet' : ''}` as WalletActionNote;
  return [
    { key: 'add', note: addNote, icon: 'plus', primary: true, go: { href: '/bridge?direction=in' } },
    { key: 'withdraw', note: 'withdraw', icon: 'out', primary: false, go: { href: '/bridge?direction=out' } },
    { key: 'send', note: 'send', icon: 'send', primary: false, go: { href: '/send' } },
    { key: 'request', note: 'request', icon: 'request', primary: false, go: { href: '/request' } },
  ];
}
