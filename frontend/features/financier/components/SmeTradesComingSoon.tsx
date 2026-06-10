import Link from 'next/link';
import { Band, SectionTag, HeroHeadline, Punc, CTAPill } from '@/shared/components/Bands';

/// Holding surface for the SME Trades rail before launch. The /financier
/// route renders this until NEXT_PUBLIC_SME_TRADES_ENABLED is set, so the
/// SME Trades nav slot resolves to a real page that explains what is
/// coming rather than exposing an unfinished desk.

const PILLARS: ReadonlyArray<{ tag: string; title: string; body: string }> = [
  {
    tag: '[:001]',
    title: 'Invoice factoring',
    body: 'Suppliers draw early payout against an accepted invoice. Financiers fund at a tiered discount and are repaid on settlement.',
  },
  {
    tag: '[:002]',
    title: 'PO financing',
    body: 'Working capital against a purchase order, released to the supplier on verified proof of delivery.',
  },
  {
    tag: '[:003]',
    title: 'Credit passport',
    body: 'Every counterparty carries a portable, on-chain record of completed deals, repayment behaviour, and concentration.',
  },
];

export function SmeTradesComingSoon() {
  return (
    <main className="min-h-[70vh]">
      <Band tone="light">
        <SectionTag>[:SME TRADES:]</SectionTag>
        <HeroHeadline size="lg">
          Trade finance, on Arc<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 max-w-[58ch] text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
          The SME rail extends Karwan settlement to working capital: invoice
          factoring, purchase-order financing, and a credit passport that
          travels with each counterparty. It opens to financiers after the
          first pilot.
        </p>

        <div className="mt-12 grid gap-px sm:grid-cols-3 bg-[var(--lp-border-light)]">
          {PILLARS.map((p) => (
            <div key={p.tag} className="bg-[var(--lp-bg)] p-6">
              <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                {p.tag}
              </p>
              <h3 className="mt-3 font-sans text-[18px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
                {p.title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                {p.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex items-center gap-4 flex-wrap">
          <CTAPill href="/financier">Open the financier desk</CTAPill>
          <Link
            href="/docs"
            className="mono text-[11px] uppercase tracking-[0.14em] font-bold text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
          >
            Read the docs
          </Link>
        </div>
      </Band>
    </main>
  );
}
