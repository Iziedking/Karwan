/// Opens the Help panel from anywhere, optionally with a question typed in.
/// The panel (shared/components/AssistantWidget.tsx) listens for this event.
export const HELP_OPEN_EVENT = 'karwan:help-open';

export interface HelpOpenDetail {
  prefill?: string;
  /// Bring in a person straight away, with this conversation for context.
  person?: boolean;
  transcript?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export function openHelp(prefill?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<HelpOpenDetail>(HELP_OPEN_EVENT, { detail: { prefill } }));
}

/// The assistant could not do it, or the person asked for one: Help opens and
/// connects them to the team with the conversation so far.
export function callPerson(transcript: HelpOpenDetail['transcript']): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<HelpOpenDetail>(HELP_OPEN_EVENT, { detail: { person: true, transcript } }));
}
