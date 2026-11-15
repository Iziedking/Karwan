import type { QuestionKey } from '@/shared/i18n/messages/guide';

/// Three questions on the empty assistant page, for the page it was opened from (view 57, D6).

export type PageKind = 'deal' | 'market' | 'money' | 'home';

const SETS: Record<PageKind, [QuestionKey, QuestionKey, QuestionKey]> = {
  deal: ['deal.money', 'deal.approvePart', 'deal.moveDate'],
  market: ['market.safe', 'market.post', 'market.cost'],
  money: ['money.where', 'money.withdraw', 'money.agent'],
  home: ['home.first', 'home.findSeller', 'home.getPaid'],
};

const KINDS: Record<string, PageKind> = {
  deals: 'deal',
  market: 'market',
  listings: 'market',
  order: 'market',
  account: 'money',
  add: 'money',
  send: 'money',
  withdraw: 'money',
};

export function pageKind(returnPath: string | null): PageKind {
  if (!returnPath) return 'home';
  const first = returnPath.split(/[?#]/)[0].split('/').filter(Boolean)[0] ?? '';
  return Object.hasOwn(KINDS, first) ? KINDS[first] : 'home';
}

export function suggestedQuestions(returnPath: string | null): [QuestionKey, QuestionKey, QuestionKey] {
  return SETS[pageKind(returnPath)];
}
