/// The first-trade checklist on Home (docs/architecture/01-workspace.md, "The
/// first trade"). Every step ticks itself from what is true for the account,
/// never from a click, and the list goes away once a deal has finished.

export type FirstTradeStep = 'setup' | 'money' | 'telegram' | 'connect' | 'deal' | 'finish';

export interface FirstTradeInput {
  /// How they asked to be reached in setup; email alone needs no Telegram step.
  reach: 'telegram' | 'email' | 'both' | null;
  /// The whole balance; null while it loads.
  balance: number | null;
  /// 'unavailable' when the Telegram bot is not set up on this network.
  telegram: 'linked' | 'unlinked' | 'unavailable' | null;
  /// Any deal, request or offer of theirs exists.
  startedTrade: boolean | null;
  settledTrade: boolean | null;
  /// They finished the setup conversation (view 19); null while loading.
  setupDone: boolean | null;
  goals: readonly string[];
  /// They said they have clients already: start with a payment request.
  ownClients: boolean;
  /// At least one account of theirs is proven (for the record goal).
  connected?: boolean;
}

export interface FirstTradeView {
  visible: boolean;
  steps: Array<{ key: FirstTradeStep; done: boolean }>;
  done: number;
  next: FirstTradeStep | null;
  dealAction: 'paymentRequest' | 'market';
}

export function firstTrade(input: FirstTradeInput): FirstTradeView {
  const steps: FirstTradeView['steps'] = [
    ...(input.setupDone === false ? [{ key: 'setup' as const, done: false }] : []),
    { key: 'money', done: (input.balance ?? 0) > 0 },
    ...(input.telegram === 'unavailable' || input.reach === 'email' ? [] : [{ key: 'telegram' as const, done: input.telegram === 'linked' }]),
    ...(input.goals.includes('record') ? [{ key: 'connect' as const, done: input.connected === true }] : []),
    { key: 'deal', done: input.startedTrade === true },
    { key: 'finish', done: input.settledTrade === true },
  ];
  const loading =
    input.balance === null || input.telegram === null || input.startedTrade === null || input.settledTrade === null || input.setupDone === null;
  return {
    visible: !loading && input.settledTrade === false,
    steps,
    done: steps.filter((s) => s.done).length,
    next: steps.find((s) => !s.done)?.key ?? null,
    dealAction: input.ownClients ? 'paymentRequest' : 'market',
  };
}
