import type { AssistantConversationSummary } from '@/core/api';

export type ConversationWhen = 'today' | 'yesterday' | 'earlier';

const dayStart = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/// Today, Yesterday and Earlier by the viewer's local day, newest first. A
/// group with nothing in it is left out.
export function groupConversations(
  list: readonly AssistantConversationSummary[],
  now: number,
): Array<{ when: ConversationWhen; items: AssistantConversationSummary[] }> {
  const today = dayStart(now);
  const yesterday = dayStart(today - 1);
  const when = (c: AssistantConversationSummary): ConversationWhen =>
    c.updatedAt >= today ? 'today' : c.updatedAt >= yesterday ? 'yesterday' : 'earlier';
  const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  return (['today', 'yesterday', 'earlier'] as const)
    .map((w) => ({ when: w, items: sorted.filter((c) => when(c) === w) }))
    .filter((g) => g.items.length > 0);
}

/// Morning until noon, afternoon until six, evening otherwise.
export function greetingKey(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}
