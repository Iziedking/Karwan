import type { SetupKey, SetupView } from '@/features/guide/pickNudge';

/// "Your first trade" on Home (docs/architecture/01-workspace.md). The steps are
/// the server's setup list (view 57, 15 Nov), the same one Aman and the
/// assistant read, plus Finish; the list goes away once a deal has finished.

export type FirstTradeStep = 'setup' | 'money' | 'agentMoney' | 'agentLimits' | 'telegram' | 'deal' | 'finish';

export interface FirstTradeView {
  visible: boolean;
  steps: Array<{ key: FirstTradeStep; done: boolean; href: string }>;
  done: number;
  next: FirstTradeStep | null;
  dealAction: 'paymentRequest' | 'market';
}

const HOME_KEY: Record<SetupKey, FirstTradeStep> = {
  setup: 'setup',
  money: 'money',
  agent_money: 'agentMoney',
  agent_limits: 'agentLimits',
  telegram: 'telegram',
  first_deal: 'deal',
};

export function homeChecklist(reply: SetupView | null, settled: boolean | null): FirstTradeView {
  // A reply without a list (an error page, an old server) counts as not read.
  const setup = reply && Array.isArray(reply.steps) ? reply : null;
  const steps: FirstTradeView['steps'] = [
    ...(setup?.steps ?? []).map((s) => ({ key: HOME_KEY[s.key], done: s.done, href: s.href })),
    { key: 'finish' as const, done: settled === true, href: '/activity' },
  ];
  const deal = setup?.steps.find((s) => s.key === 'first_deal');
  return {
    visible: !!setup && setup.known && settled === false,
    steps,
    done: steps.filter((s) => s.done).length,
    next: steps.find((s) => !s.done)?.key ?? null,
    dealAction: deal?.href.startsWith('/request') ? 'paymentRequest' : 'market',
  };
}
