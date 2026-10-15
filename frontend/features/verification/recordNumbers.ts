import type { RecordCopy } from '@/shared/i18n/messages/record';
import { fill } from '@/features/deals/workspace/presentation';

/// The numbers anyone may see on a public record: the score and the counts.
/// Never an amount or who the deals were with.
export function recordNumbers(
  record: { score?: number; counts?: { completed: number; onTimeRate: number | null; disputesLost: number } },
  copy: RecordCopy,
): Array<{ label: string; value: string }> {
  if (record.score == null || !record.counts) return [];
  const rows = [
    { label: copy.score, value: fill(copy.scoreOf, { n: record.score }) },
    { label: copy.completed, value: String(record.counts.completed) },
  ];
  if (record.counts.onTimeRate !== null) rows.push({ label: copy.onTime, value: `${record.counts.onTimeRate}%` });
  rows.push({ label: copy.disputesLost, value: String(record.counts.disputesLost) });
  return rows;
}
