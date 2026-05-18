'use client';
import Link from 'next/link';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
  CTAPill,
} from '@/shared/components/Bands';

/// Plain-language page for the known security limitations of the current
/// release. Linked from the home-page banner. Required disclosure under the
/// pre-launch audit (2026-05-18). The matching v2 plan items are listed so
/// users can see what changes and when.
export default function KnownLimitationsPage() {
  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />} compact>
        <SectionTag tone="dark">KNOWN LIMITATIONS</SectionTag>
        <HeroHeadline>
          What this build does <Accent>not</Accent> protect against yet
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-white/65 max-w-[64ch]">
          Karwan is in production on Arc Testnet. Real-USDC mainnet is a future
          milestone. Before you post a brief or accept a deal, read what the
          current rails do and do not guarantee.
        </p>
      </Band>

      <Band tone="light" compact>
        <div className="max-w-[68ch] mx-auto space-y-10">
          <Section
            tag="A"
            title="Buyer can refund after delivery, on testnet"
            severity="High during testnet, mitigated post-v2.D"
          >
            <p>
              On the current contracts, after the seller marks a deal delivered
              and before the buyer releases the final milestone, the buyer can
              call the on-chain dispute and refund path. The seller would
              receive nothing for the work delivered.
            </p>
            <p>
              The off-chain reputation system records this as a failed deal
              against the buyer, which slashes their score and tags them
              publicly. Future buyers and seller-agents see this and route
              around them. But the seller is still uncompensated for the one
              deal in question.
            </p>
            <p className="font-semibold text-[var(--color-ink)]">
              Mitigation in v2.D:
            </p>
            <p>
              The next contract redeploy introduces hardened staking as deal
              insurance. A portion of the buyer&apos;s active stake reserves
              against the deal at acceptance. If the buyer triggers a
              post-delivery refund, the reserved stake transfers to the seller
              automatically.
            </p>
            <p className="font-semibold text-[var(--color-ink)]">
              What to do today:
            </p>
            <p>
              Sellers should weigh the buyer&apos;s reputation tier (ELITE /
              STRONG / ESTABLISHED) before accepting large briefs from new
              wallets. New buyers force a human-review gate on the seller
              side; that gate exists for this reason.
            </p>
          </Section>

          <Section
            tag="B"
            title="Disputes have no on-chain path back to seller"
            severity="Medium, fixed in v2.D"
          >
            <p>
              Once a deal is marked Disputed on chain, the only on-chain action
              is a refund to the buyer. There is no on-chain function for the
              buyer to release funds to the seller after disputing. Honest
              disputes that should resolve in the seller&apos;s favor have to
              be settled off-chain or via a fresh deal.
            </p>
            <p>
              In the app, both parties can still propose a mutual cancel during
              the dispute state. If the counterparty accepts, the escrow
              refunds in full and no reputation hit is recorded on either side.
              For now, this is the supported consensus-resolution path.
            </p>
            <p className="font-semibold text-[var(--color-ink)]">
              Mitigation in v2.D:
            </p>
            <p>
              The next contract version adds a release-from-dispute function
              so a buyer who agrees the seller delivered can pay them without
              opening a new deal.
            </p>
          </Section>

          <Section
            tag="C"
            title="No professional audit before mainnet"
            severity="Required before real-money deployment"
          >
            <p>
              The current contracts have been internally reviewed and have a
              Foundry test suite. They have NOT been audited by an external
              security firm. Arc Testnet runs use no real money. A
              professional audit is on the roadmap before any deployment to
              Arc Mainnet or a chain holding live USDC.
            </p>
          </Section>

          <div className="pt-6 flex flex-wrap items-center gap-3">
            <CTAPill href="/app" tone="light">
              Back to app
            </CTAPill>
            <Link
              href="https://github.com/anthropics/anthropic-cookbook"
              target="_blank"
              rel="noreferrer"
              className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)]"
            >
              Read the source on GitHub →
            </Link>
          </div>
        </div>
      </Band>
    </FullBleed>
  );
}

function Section({
  tag,
  title,
  severity,
  children,
}: {
  tag: string;
  title: string;
  severity: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="border-l-[3px] pl-5 py-1"
      style={{ borderColor: 'var(--color-critical)' }}
    >
      <div className="flex items-baseline gap-3 mb-2">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-critical)]">
          [:{tag}:]
        </span>
        <h2 className="font-sans text-[18px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
          {title}
        </h2>
      </div>
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)] mb-3">
        {severity}
      </p>
      <div className="space-y-3 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
        {children}
      </div>
    </section>
  );
}
