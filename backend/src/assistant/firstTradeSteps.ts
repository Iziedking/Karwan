/// The first-trade checklist, the same one Home shows (frontend
/// features/home/firstTrade.ts), so a person who starts in Telegram is told the
/// same next step as on the website.

export type FirstTradeStep = 'wallets' | 'money' | 'telegram' | 'deal' | 'finish';

export interface FirstTradeFacts {
  activated: boolean;
  balance: number;
  telegram: 'linked' | 'unlinked' | 'unavailable';
  startedTrade: boolean;
  settledTrade: boolean;
}

/// Where each step is done on the website. On testnet nobody holds USDC
/// yet, so adding money starts at the faucet.
export function firstTradeRoute(step: FirstTradeStep, network: 'testnet' | 'mainnet'): string {
  const routes: Record<FirstTradeStep, string> = {
    wallets: '/profile/agent-funds',
    money: network === 'testnet' ? '/profile/wallets' : '/bridge?direction=in',
    telegram: '/profile',
    deal: '/market',
    finish: '/activity',
  };
  return routes[step];
}

export function firstTradeSteps(facts: FirstTradeFacts, network: 'testnet' | 'mainnet' = 'testnet') {
  const steps: Array<{ key: FirstTradeStep; done: boolean }> = [
    { key: 'wallets', done: facts.activated },
    { key: 'money', done: facts.balance > 0 },
    ...(facts.telegram === 'unavailable' ? [] : [{ key: 'telegram' as const, done: facts.telegram === 'linked' }]),
    { key: 'deal', done: facts.startedTrade },
    { key: 'finish', done: facts.settledTrade },
  ];
  return {
    complete: facts.settledTrade,
    steps: steps.map((s) => ({ ...s, route: firstTradeRoute(s.key, network) })),
    next: steps.find((s) => !s.done)?.key ?? null,
  };
}
