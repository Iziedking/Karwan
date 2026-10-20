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

/// Where each step is done on the website.
export const FIRST_TRADE_ROUTE: Record<FirstTradeStep, string> = {
  wallets: '/profile/agent-funds',
  money: '/bridge?direction=in',
  telegram: '/profile',
  deal: '/market',
  finish: '/activity',
};

export function firstTradeSteps(facts: FirstTradeFacts) {
  const steps: Array<{ key: FirstTradeStep; done: boolean }> = [
    { key: 'wallets', done: facts.activated },
    { key: 'money', done: facts.balance > 0 },
    ...(facts.telegram === 'unavailable' ? [] : [{ key: 'telegram' as const, done: facts.telegram === 'linked' }]),
    { key: 'deal', done: facts.startedTrade },
    { key: 'finish', done: facts.settledTrade },
  ];
  return {
    complete: facts.settledTrade,
    steps: steps.map((s) => ({ ...s, route: FIRST_TRADE_ROUTE[s.key] })),
    next: steps.find((s) => !s.done)?.key ?? null,
  };
}
