import { splitRequestText } from '@/features/discovery/model';

/// The request in one line. A deal's agreement text starts with the brief and
/// then carries the composed delivery and payment terms, which belong on the
/// deal page, not in a headline.
export function dealHeadline(terms: string | null | undefined): string {
  const firstLine = (terms ?? '').trim().split('\n')[0] ?? '';
  if (/^(?:Delivery|Payment|Accepted when):/.test(firstLine)) return '';
  const brief = firstLine.split(/\s(?:Delivery|Payment|Accepted when):/)[0] ?? '';
  return splitRequestText(brief).title;
}
