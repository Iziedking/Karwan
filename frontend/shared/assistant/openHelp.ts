/// Opens the Help panel from anywhere, optionally with a question typed in.
/// The panel (shared/components/AssistantWidget.tsx) listens for this event.
export const HELP_OPEN_EVENT = 'karwan:help-open';

export function openHelp(prefill?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(HELP_OPEN_EVENT, { detail: { prefill } }));
}
