import type { OfferFlowCopy } from '@/shared/i18n/messages/offerFlow';

export const MIN_TITLE = 3;
export const MIN_DESCRIPTION = 5;

/// What step one still needs before Continue works; null when it is ready.
export function stepOneBlocker(title: string, description: string, t: Pick<OfferFlowCopy, 'titleShort' | 'descriptionShort'>): string | null {
  if (title.trim().length < MIN_TITLE) return t.titleShort;
  if (description.trim().length < MIN_DESCRIPTION) return t.descriptionShort;
  return null;
}
