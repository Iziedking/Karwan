/// The first-trade checklist, the same one Home shows (frontend
/// features/home/firstTrade.ts), so a person who starts in Telegram is told the
/// same next step as on the website.

export type FirstTradeStep = 'setup' | 'wallets' | 'money' | 'telegram' | 'connect' | 'deal' | 'finish';

export interface FirstTradeFacts {
  activated: boolean;
  balance: number;
  telegram: 'linked' | 'unlinked' | 'unavailable';
  startedTrade: boolean;
  settledTrade: boolean;
  /// They finished the setup conversation (view 19).
  setupDone: boolean;
  goals: readonly string[];
  /// They said they have clients already: start with a payment request.
  ownClients: boolean;
  /// At least one account of theirs is proven.
  connected: boolean;
}

/// Where each step is done on the website. On testnet nobody holds USDC
/// yet, so adding money starts at the faucet.
export function firstTradeRoute(step: FirstTradeStep, network: 'testnet' | 'mainnet', ownClients = false): string {
  const routes: Record<FirstTradeStep, string> = {
    setup: '/setup',
    connect: '/profile/setup',
    wallets: '/profile/agent-funds',
    money: network === 'testnet' ? '/profile/wallets' : '/bridge?direction=in',
    telegram: '/profile',
    deal: ownClients ? '/request' : '/market',
    finish: '/activity',
  };
  return routes[step];
}

export function firstTradeSteps(facts: FirstTradeFacts, network: 'testnet' | 'mainnet' = 'testnet') {
  const steps: Array<{ key: FirstTradeStep; done: boolean }> = [
    ...(facts.setupDone ? [] : [{ key: 'setup' as const, done: false }]),
    { key: 'wallets', done: facts.activated },
    { key: 'money', done: facts.balance > 0 },
    ...(facts.telegram === 'unavailable' ? [] : [{ key: 'telegram' as const, done: facts.telegram === 'linked' }]),
    ...(facts.goals.includes('record') ? [{ key: 'connect' as const, done: facts.connected }] : []),
    { key: 'deal', done: facts.startedTrade },
    { key: 'finish', done: facts.settledTrade },
  ];
  return {
    complete: facts.settledTrade,
    steps: steps.map((s) => ({ ...s, route: firstTradeRoute(s.key, network, facts.ownClients) })),
    next: steps.find((s) => !s.done)?.key ?? null,
  };
}
