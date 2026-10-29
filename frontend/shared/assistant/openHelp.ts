/// Opens the Help panel from anywhere, optionally with a question typed in.
/// The panel (shared/components/AssistantWidget.tsx) listens for this event.
export const HELP_OPEN_EVENT = 'karwan:help-open';

type Turn = { role: 'user' | 'assistant'; content: string };

export interface HelpOpenDetail {
  prefill?: string;
  /// Send the prefill as the person's message straight away.
  send?: boolean;
  /// Bring in a person straight away.
  person?: boolean;
  /// What the person already said elsewhere, such as assistant mode. It goes
  /// to the person joining as context; Help keeps its own conversation.
  context?: Turn[];
  /// A first message for the person joining, sent and shown in Help. Goes
  /// into an open ticket when there is one.
  message?: string;
  /// A deal this is about, so support opens it without asking.
  dealId?: string;
}

export function openHelp(prefill?: string, opts: { send?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  const detail: HelpOpenDetail = opts.send ? { prefill, send: true } : { prefill };
  window.dispatchEvent(new CustomEvent<HelpOpenDetail>(HELP_OPEN_EVENT, { detail }));
}

/// The assistant could not do it, or the person asked for one: Help opens and
/// connects them to the team, with what was said so far as context.
export function callPerson(context: Turn[], options: { message?: string; dealId?: string } = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<HelpOpenDetail>(HELP_OPEN_EVENT, { detail: { person: true, context, ...options } }));
}
