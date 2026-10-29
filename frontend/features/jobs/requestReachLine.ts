import type { RequestReach } from '@/core/api';
import type { AgentQuestionsCopy } from '@/shared/i18n/messages/agentQuestions';

/// The one line under "your agent is asking sellers" (view 41): counts only,
/// never a name. Null while nobody fits; the nobody block decides what to say
/// then, and only once a minute has passed.
export function reachLine(copy: Pick<AgentQuestionsCopy, 'reachOne' | 'reachMany'>, reach: RequestReach | null): string | null {
  if (!reach || reach.fit === 0) return null;
  const template = reach.fit === 1 ? copy.reachOne : copy.reachMany;
  return template
    .replace('{fit}', String(reach.fit))
    .replace('{offered}', String(reach.offered))
    .replace('{asked}', String(reach.asked));
}

export function showNobodyYet(reach: RequestReach | null): boolean {
  return !!reach && reach.fit === 0 && reach.nobodyYet;
}
