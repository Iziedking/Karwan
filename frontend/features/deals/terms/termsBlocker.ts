import { termsIssues, type TermsDraft, type TermsIssue } from './composeTerms';
import type { TermsBuilderCopy } from './termsCopy';

export function termsIssueText(issue: TermsIssue, t: TermsBuilderCopy): string {
  if (issue.code === 'no-what') return t.noWhat.replace('{n}', String(issue.part));
  if (issue.code === 'split') return t.split.replace('{sum}', String(issue.total));
  return t.vague.replace('{item}', issue.item);
}

/// The first thing stopping the terms from being ready, in words a person can
/// act on; null when they are ready.
export function termsBlocker(draft: TermsDraft, t: TermsBuilderCopy): string | null {
  const first = termsIssues(draft)[0];
  return first ? termsIssueText(first, t) : null;
}
