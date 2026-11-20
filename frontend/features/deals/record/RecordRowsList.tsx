'use client';
import { explorerTxUrl, settlementChain } from '@/core/arcNetwork';
import type { DealRecordCopy } from '@/shared/i18n/messages/dealRecord';
import type { RecordRow } from './recordRows';

/// The record's rows, the same on the deal page and on a shared link.
export function RecordRowsList({ rows, t }: { rows: RecordRow[]; t: DealRecordCopy }) {
  return (
    <dl className="divide-y divide-[var(--lp-border-light)]">
      {rows.map((row) => (
        <div key={row.key} data-row={row.key} className="py-3 first:pt-0 last:pb-0">
          <dt className="text-[13px] font-medium text-[var(--lp-text-sub)]">{row.label}</dt>
          {row.lines.map((line, i) => (
            <dd key={i} className="mt-0.5">
              <span dir="auto" className="block text-[15px] font-semibold text-[var(--lp-dark)]">{line.text}</span>
              {line.tx ? (
                <a
                  href={explorerTxUrl(settlementChain, line.tx)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4"
                >
                  {t.viewOnArc}
                </a>
              ) : null}
            </dd>
          ))}
        </div>
      ))}
    </dl>
  );
}
