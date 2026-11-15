import type { AssistantWaitCopy } from '../i18n/messages/assistantWait';

export type WaitStep = { kind: 'status'; tool: string } | { kind: 'retrying' };

/// The line under Aman for the step it is on. A step with no line of its own
/// falls back by the tool's name, so a new tool never shows a blank line.
export function statusLine(step: WaitStep | null, copy: AssistantWaitCopy): string {
  if (!step) return copy.first;
  if (step.kind === 'retrying') return copy.retrying;
  const own = copy.tools[step.tool];
  if (own) return own;
  if (step.tool.startsWith('propose_')) return copy.groups.propose;
  if (/^(get|list|whats)_/.test(step.tool)) return copy.groups.read;
  return copy.groups.other;
}
