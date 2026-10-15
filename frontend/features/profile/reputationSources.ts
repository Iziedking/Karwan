import type { ReputationSourcesCopy } from '@/shared/i18n/messages/reputationSources';

export interface RecordReader {
  name: string | null;
  tag: string | null;
  purpose: string;
  at: number;
}

/// One reader of the person's record: who, why and when. Never what they paid.
export function readerLine(r: RecordReader, copy: ReputationSourcesCopy, locale: string): string {
  const who = r.tag ? `@${r.tag}` : r.name?.trim() || copy.someone;
  const why = copy.purposes[r.purpose as keyof ReputationSourcesCopy['purposes']] ?? copy.purposes.question;
  const when = new Date(r.at).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${who} · ${why} · ${when}`;
}
