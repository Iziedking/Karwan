/// The way from a new account to fully set up (view 57, 15 Nov amendment).
/// One list on the shared core: Aman, Home and the assistant in every channel
/// read it, so they always name the same next step. Each step ticks itself
/// from what is true for the account, never from a click.

export const SETUP_KEYS = ['setup', 'money', 'agent_money', 'agent_limits', 'telegram', 'first_deal'] as const;
export type SetupKey = (typeof SETUP_KEYS)[number];

export interface SetupFacts {
  setupDone: boolean;
  /// What the account holds; null when it could not be read.
  balance: number | null;
  /// What the person's assistant (their agent wallets) holds; null when unread.
  agentsBalance: number | null;
  /// They chose how their assistant works (make offers, ask me first, agree for me).
  agentMode: boolean;
  /// Their price or budget could be read, so the assistant knows its limits.
  priceSet: boolean;
  telegram: 'linked' | 'unlinked' | 'unavailable';
  /// How they asked to be reached in setup; email alone needs no Telegram step.
  reach: 'telegram' | 'email' | 'both' | null;
  startedTrade: boolean;
  settledTrade: boolean;
  /// They have their own clients: the first deal is a payment request.
  ownClients: boolean;
}

export interface SetupView {
  steps: { key: SetupKey; done: boolean; href: string }[];
  next: SetupKey | null;
  complete: boolean;
  /// False when a balance could not be read: then nothing is asked of the person.
  known: boolean;
}

export function setupSteps(facts: SetupFacts, network: 'testnet' | 'mainnet'): SetupView {
  const steps: SetupView['steps'] = [
    { key: 'setup', done: facts.setupDone, href: '/setup' },
    { key: 'money', done: (facts.balance ?? 0) > 0, href: network === 'testnet' ? '/profile/wallets' : '/add' },
    { key: 'agent_money', done: (facts.agentsBalance ?? 0) > 0, href: '/account?tab=agent' },
    { key: 'agent_limits', done: facts.agentMode && facts.priceSet, href: '/profile/setup' },
    ...(facts.telegram === 'unavailable' || facts.reach === 'email'
      ? []
      : [{ key: 'telegram' as const, done: facts.telegram === 'linked', href: '/profile/contact' }]),
    { key: 'first_deal', done: facts.startedTrade, href: facts.ownClients ? '/request' : '/market' },
  ];
  const next = steps.find((s) => !s.done)?.key ?? null;
  return { steps, next, complete: next === null, known: facts.balance !== null && facts.agentsBalance !== null };
}
