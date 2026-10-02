'use client';
import type { ReactNode } from 'react';
import { CaravanStamp } from '@/shared/components/CaravanStamp';
import { PayLinkQr } from '@/features/payLink/ShareLink';
import { cn } from '@/shared/utils/cn';

export interface ReceiptRow {
  label: string;
  value: ReactNode;
  sub?: string;
  mono?: boolean;
}

export interface ReceiptCardProps {
  status: { label: string; tone: 'done' | 'pending' | 'failed' };
  kind: string;
  amount: string | null;
  sentence: string;
  rows: ReceiptRow[];
  /// What actually landed, read from the record or the chain. Omitted when
  /// nothing verified says so.
  total?: { label: string; value: string };
  verify?: { href: string; title: string; body: string; qrLabel: string };
  footnote?: string;
  className?: string;
}

/// One receipt for every money moment. Paper in both themes, because it is a
/// document: the same card is printed, shared and read in the app. Amount first,
/// one sentence of what happened, rows of facts, what landed, then the proof and
/// the caravan stamp.
export function ReceiptCard(props: ReceiptCardProps) {
  const [whole, unit] = splitAmount(props.amount);
  return (
    <article
      className={cn('karwan-receipt-print relative rounded-[22px] bg-[#FBFBF8] p-6 text-[#16202A] shadow-[0_1px_0_#d3d9e0] sm:p-8', props.className)}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      <header className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5 text-[17px] font-bold tracking-[-0.01em]">
          <img src="/brand/karwan-mark-lime.svg" alt="" aria-hidden width={30} height={30} className="size-[30px]" />
          Karwan
        </span>
        <span
          className={cn(
            'rounded-full px-3 py-1 text-[12px] font-semibold',
            props.status.tone === 'done' ? 'bg-[#E7F0CF] text-[#33410f]' : props.status.tone === 'failed' ? 'bg-[#F6E1E0] text-[#7a2421]' : 'bg-[#EEF1F4] text-[#4b545d]',
          )}
        >
          {props.status.label}
        </span>
      </header>

      <p className="mt-7 text-[13px] text-[#5d666f]">{props.kind}</p>
      {whole ? (
        <p className="mt-1.5 text-[44px] font-semibold leading-none tracking-[-0.03em] sm:text-[52px]">
          {whole}
          {unit ? <span className="ms-2 text-[18px] font-medium tracking-normal text-[#5d666f]">{unit}</span> : null}
        </p>
      ) : null}
      <p className="mt-3 break-words text-[15px] leading-relaxed text-[#2c353e]">{props.sentence}</p>

      <dl className="mt-6 border-t border-[#E3E6E1]">
        {props.rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4 border-b border-[#E3E6E1] py-3 text-[14.5px]">
            <dt className="shrink-0 text-[#5d666f]">{row.label}</dt>
            <dd className={cn('min-w-0 break-words text-end font-medium', row.mono && 'font-mono text-[13.5px] font-normal')}>
              {row.value}
              {row.sub ? <span className="mt-0.5 block text-[12.5px] font-normal text-[#5d666f]">{row.sub}</span> : null}
            </dd>
          </div>
        ))}
      </dl>

      {props.total ? (
        <div className="flex items-baseline justify-between gap-4 pt-4 text-[15px]">
          <span>{props.total.label}</span>
          <b className="text-[20px] font-semibold">{props.total.value}</b>
        </div>
      ) : null}

      <footer className="mt-7 flex items-end justify-between gap-4">
        {props.verify ? (
          <a href={props.verify.href} target="_blank" rel="noopener noreferrer" data-proof-url={props.verify.href} className="karwan-receipt-proof flex items-center gap-3 rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AFC95B]">
            <span className="[&_div]:rounded-[8px] [&_div]:p-1.5 [&_canvas]:!h-[64px] [&_canvas]:!w-[64px]">
              <PayLinkQr value={props.verify.href} label={props.verify.qrLabel} />
            </span>
            <span className="text-[12px] leading-snug text-[#5d666f]">
              <b className="block text-[12.5px] font-semibold text-[#16202A]">{props.verify.title}</b>
              {props.verify.body}
            </span>
          </a>
        ) : <span />}
        <CaravanStamp size={58} />
      </footer>
      {props.footnote ? <p className="mt-4 text-center text-[11.5px] text-[#8a929a]">{props.footnote}</p> : null}
    </article>
  );
}

function splitAmount(amount: string | null): [string | null, string | null] {
  if (!amount) return [null, null];
  const match = amount.match(/^(.*?)\s*(USDC)$/);
  return match ? [match[1]!, match[2]!] : [amount, null];
}
