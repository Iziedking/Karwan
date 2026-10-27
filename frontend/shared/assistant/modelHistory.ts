import type { AssistantAction, PastAssistantAction } from '@/core/api';

/// The longest message the chat route takes (backend assistant/chatBody.ts).
const MAX_CONTENT = 4000;

type Shown = { role: 'user' | 'assistant'; content: string; actions?: Array<AssistantAction | PastAssistantAction> };

/// One turn as the assistant reads it on the next message. A reply that showed
/// a card says only "review the card", so the card's rows and whether it ran are
/// added: "make the deadline 10 days" can then be prepared again with the change.
/// Rows only, never the card's id or payload.
export function contentForModel(turn: Shown, ran: (a: AssistantAction) => boolean): string {
  if (turn.role !== 'assistant' || !turn.actions?.length) return turn.content;
  const cards = turn.actions.flatMap((a) => {
    if (a.kind !== 'confirm') return [];
    const done = 'status' in a ? a.status === 'done' : ran(a);
    const title = a.title ?? ('label' in a ? a.label : undefined) ?? 'A card';
    const rows = ('fields' in a ? a.fields ?? [] : []).map((f) => `${f.label}: ${f.value}.`);
    return [[done ? `Card confirmed: ${title}.` : `Card shown, not confirmed: ${title}.`, ...rows].join(' ')];
  });
  if (!cards.length) return turn.content;
  return `${turn.content}\n\n${cards.join('\n')}`.slice(0, MAX_CONTENT);
}
