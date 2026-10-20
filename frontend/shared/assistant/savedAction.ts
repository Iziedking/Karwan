import type { AssistantAction, PastAssistantAction } from '@/core/api';

/// A card as a saved conversation keeps it: what it was and whether it was
/// done, never its id or payload. Navigate links are not kept. A card counts
/// as done only once it ran.
export function savedAction(
  a: AssistantAction | PastAssistantAction,
  outcomeOf: (id: string) => unknown,
): Record<string, unknown> | null {
  if ('status' in a) return { kind: a.kind, title: a.title, label: a.label, status: a.status };
  if (a.kind !== 'confirm') return null;
  const outcome = outcomeOf(a.id);
  return { kind: a.kind, intent: a.intent, title: a.title, status: outcome && typeof outcome === 'object' ? 'done' : 'expired' };
}
