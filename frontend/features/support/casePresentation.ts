import type { SupportPageCopy } from '@/shared/i18n/messages/supportPage';

/// Words for a person's own cases (view 78).

type State = keyof SupportPageCopy['states'];
type Who = keyof SupportPageCopy['who'];

export const caseTitle = (ref: string, copy: SupportPageCopy) => copy.caseTitle.replace('{ref}', ref);
export const stateWords = (state: State, copy: SupportPageCopy) => copy.states[state];
export const whoWords = (role: Who, copy: SupportPageCopy) => copy.who[role];

const DEAL_ID = /^0x[0-9a-fA-F]{64}$/;
const TRANSFER_REF = /^[A-Z0-9][A-Z0-9-]{3,40}$/i;

/// "Get help with this" opens the help bot already talking about that deal or
/// transfer. Anything that is not a deal id or a movement reference is ignored.
export function helpPrefill(
  q: { deal?: string | null; dealRef?: string | null; transfer?: string | null },
  copy: SupportPageCopy,
): { text: string; viewingDeal: string | undefined } | null {
  if (q.deal && DEAL_ID.test(q.deal)) {
    const ref = q.dealRef && TRANSFER_REF.test(q.dealRef) ? q.dealRef : q.deal.slice(0, 10);
    return { text: copy.aboutDeal.replace('{ref}', ref), viewingDeal: q.deal };
  }
  if (q.transfer && TRANSFER_REF.test(q.transfer)) {
    return { text: copy.aboutTransfer.replace('{ref}', q.transfer), viewingDeal: undefined };
  }
  return null;
}
