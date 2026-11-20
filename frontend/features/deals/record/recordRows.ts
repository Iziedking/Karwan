import type { DealRecordView } from '@/core/api';
import type { DealRecordCopy } from '@/shared/i18n/messages/dealRecord';

export type RecordRowKey = 'agreed' | 'held' | 'confirmed' | 'released' | 'signed';

export interface RecordRow {
  key: RecordRowKey;
  label: string;
  lines: Array<{ text: string; tx?: string | null }>;
}

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
const positive = (usdc: string | null | undefined) => !!usdc && Number(usdc) > 0;

/// The five rows of a finished deal's signed record (view 94, Figma 382:570),
/// from the side reading it: the seller reads "to you", the buyer and anyone
/// with a shared link read "to the seller". What the deal did not record says
/// so; nothing is guessed.
export function recordRows(
  record: DealRecordView,
  reader: 'buyer' | 'seller' | null,
  writtenAt: number,
  t: DealRecordCopy,
  date: (ms: number) => string,
): RecordRow[] {
  const many = record.stages.length > 1;
  const staged = (index: number, text: string) => (many ? `${fill(t.stage, { n: String(index + 1) })}: ${text}` : text);
  const none = [{ text: t.notRecorded }];

  const { agreed } = record;
  const bothAt = agreed.buyerAt && agreed.sellerAt ? Math.max(agreed.buyerAt, agreed.sellerAt) : null;
  const agreedText = [fill(t.agreedLine, { price: agreed.priceUsdc, title: agreed.title }), bothAt ? fill(t.bothOn, { date: date(bothAt) }) : null]
    .filter(Boolean)
    .join(' · ');

  const held = record.held
    ? [{ text: record.held.at ? fill(t.heldLine, { amount: record.held.usdc, date: date(record.held.at) }) : `${record.held.usdc} USDC`, tx: record.held.tx }]
    : none;

  const confirmed = record.stages.length
    ? record.stages.map((s) => ({ text: staged(s.index, [t.ways[s.confirmed.way] ?? t.ways.not_recorded, s.confirmed.at ? date(s.confirmed.at) : null].filter(Boolean).join(' · ')) }))
    : none;

  const released = record.stages
    .filter((s) => s.released)
    .map((s) => {
      const r = s.released!;
      const parts = [
        positive(r.sellerUsdc) ? fill(reader === 'seller' ? t.toYou : t.toSeller, { amount: r.sellerUsdc! }) : null,
        positive(r.refundUsdc) ? fill(reader === 'buyer' ? t.backToYou : t.backToBuyer, { amount: r.refundUsdc }) : null,
        positive(r.feeUsdc) ? fill(t.fee, { amount: r.feeUsdc! }) : null,
        date(r.at),
      ].filter(Boolean);
      return { text: staged(s.index, parts.join(' · ')), tx: r.tx };
    });

  return [
    { key: 'agreed', label: t.agreed, lines: [{ text: agreedText }] },
    { key: 'held', label: t.held, lines: held },
    { key: 'confirmed', label: t.confirmed, lines: confirmed },
    { key: 'released', label: t.released, lines: released.length ? released : none },
    { key: 'signed', label: t.signed, lines: [{ text: `${t.signedBy} · ${date(writtenAt)}` }] },
  ];
}
