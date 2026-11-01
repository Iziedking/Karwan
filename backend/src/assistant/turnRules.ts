import { mayAnswer } from './safety.js';

/// What one try of the assistant produced, as the turn judges it.
export interface TryOutcome {
  text: string;
  hasActions: boolean;
  /// It prepared a card for the person to confirm.
  proposal: boolean;
  /// How many tools changed something on this try (see grounding.ts).
  acted: number;
  needsLiveState: boolean;
  grounded: boolean;
  subjects: number;
}

/// Whether to run the turn once more with a required account read. A try that
/// already changed something is never run again, so nothing happens twice.
export function retryWithRead(t: TryOutcome): boolean {
  if (t.acted > 0 || t.proposal) return false;
  const unread = !!t.text && !mayAnswer({ needsLiveState: t.needsLiveState, grounded: t.grounded, subjects: t.subjects, reply: t.text });
  const silent = !t.text && !t.hasActions && t.needsLiveState;
  return unread || silent;
}

/// Whether the reply goes out as written: a card, what a tool just did, or an
/// answer that claims nothing about the account it did not read.
export function replyStands(t: TryOutcome): boolean {
  if (t.proposal) return true;
  if (!t.text) return false;
  return t.acted > 0 || mayAnswer({ needsLiveState: t.needsLiveState, grounded: t.grounded, subjects: t.subjects, reply: t.text });
}
