/// The first-trade checklist on Home (docs/architecture/01-workspace.md, "The
/// first trade"). Every step ticks itself from what is true for the account,
/// never from a click, and the list goes away once a deal has finished.

export type FirstTradeStep = 'wallets' | 'money' | 'telegram' | 'deal' | 'finish';

export interface FirstTradeInput {
  activated: boolean | null;
  /// The whole balance; null while it loads.
  balance: number | null;
  /// 'unavailable' when the Telegram bot is not set up on this network.
  telegram: 'linked' | 'unlinked' | 'unavailable' | null;
  /// Any deal, request or offer of theirs exists.
  startedTrade: boolean | null;
  settledTrade: boolean | null;
}

export interface FirstTradeView {
  visible: boolean;
  steps: Array<{ key: FirstTradeStep; done: boolean }>;
  done: number;
  next: FirstTradeStep | null;
}

export function firstTrade(input: FirstTradeInput): FirstTradeView {
  const steps: FirstTradeView['steps'] = [
    { key: 'wallets', done: input.activated === true },
    { key: 'money', done: (input.balance ?? 0) > 0 },
    ...(input.telegram === 'unavailable' ? [] : [{ key: 'telegram' as const, done: input.telegram === 'linked' }]),
    { key: 'deal', done: input.startedTrade === true },
    { key: 'finish', done: input.settledTrade === true },
  ];
  const loading =
    input.activated === null || input.balance === null || input.telegram === null || input.startedTrade === null || input.settledTrade === null;
  return {
    visible: !loading && input.settledTrade === false,
    steps,
    done: steps.filter((s) => s.done).length,
    next: steps.find((s) => !s.done)?.key ?? null,
  };
}
