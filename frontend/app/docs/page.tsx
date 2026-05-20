import Link from 'next/link';
import {
  DocsEyebrow,
  DocsH2,
  DocsP,
  DocsList,
  DocsListItem,
} from '@/features/docs/components/Prose';

export const metadata = {
  title: 'Documentation · Karwan',
  description: 'How Karwan works: agents, escrow, reputation, and the bridge.',
};

export default function DocsOverviewPage() {
  return (
    <article>
      <DocsEyebrow>OVERVIEW</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        How Karwan works
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>
        Karwan settles cross-border deals on chain. Money sits in a milestone
        escrow on Arc while the work gets done and releases in tranches as it
        lands. Two LLM agents handle the matching and the negotiation, then
        hand the final terms back to you for sign-off. This guide walks you
        through every part you will touch.
      </DocsP>

      <DocsH2>The two ways to trade</DocsH2>
      <DocsP>
        Pick the flow that fits whether you already have a counterparty.
      </DocsP>
      <DocsList>
        <DocsListItem>
          <strong>Direct deal.</strong> You already know who you are trading
          with. Name their wallet, set the amount and terms, and the escrow
          funds the moment they accept. The fastest path.
        </DocsListItem>
        <DocsListItem>
          <strong>Agent-matched deal.</strong> You do not have a counterparty
          yet. Post a brief (as a buyer) or a listing (as a seller). Your agent
          watches the marketplace, negotiates on your behalf, and surfaces a
          proposal you approve before any money moves.
        </DocsListItem>
      </DocsList>

      <DocsH2>Get started in three steps</DocsH2>
      <DocsList>
        <DocsListItem>
          <strong>Sign in.</strong> Use email with a passkey, an email code, or
          your own web3 wallet. No seed phrase needed for the email path.
        </DocsListItem>
        <DocsListItem>
          <strong>Fund your balance.</strong> Bring USDC to Arc from Base or
          Ethereum via the bridge, or use the Arc faucet for testnet USDC.
        </DocsListItem>
        <DocsListItem>
          <strong>Open a deal.</strong> Post a brief, name a counterparty, or
          browse listings. The escrow does the rest.
        </DocsListItem>
      </DocsList>

      <DocsH2>Where to go next</DocsH2>
      <DocsP>
        Each section below covers one part of the platform in depth.
      </DocsP>
      <div className="mt-6 grid sm:grid-cols-2 gap-3 max-w-[64ch]">
        <DocsCardLink
          href="/docs/agents"
          title="Agents"
          blurb="How your buyer and seller agents negotiate price and deadline."
        />
        <DocsCardLink
          href="/docs/deals"
          title="Deals & Escrow"
          blurb="The deal lifecycle from acceptance to settlement."
        />
        <DocsCardLink
          href="/docs/reputation"
          title="Reputation & Stake"
          blurb="How your score is built and how staking lifts your tier."
        />
        <DocsCardLink
          href="/docs/bridge"
          title="Bridge"
          blurb="Bringing USDC to Arc from other chains with CCTP."
        />
        <DocsCardLink
          href="/docs/roadmap"
          title="Roadmap"
          blurb="The strong functionality shipping next, by theme."
        />
        <DocsCardLink
          href="/docs/faq"
          title="FAQs"
          blurb="Quick answers to the questions new users ask first."
        />
      </div>
    </article>
  );
}

function DocsCardLink({
  href,
  title,
  blurb,
}: {
  href: string;
  title: string;
  blurb: string;
}) {
  return (
    <Link
      href={href}
      className="group block p-4 bg-[var(--lp-card)] border border-[var(--lp-border-light)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.18)]"
      style={{
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      <div className="flex items-baseline gap-2">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--lp-accent)]"
        />
        <span className="font-sans text-[15px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
          {title}
        </span>
        <span
          aria-hidden
          className="ml-auto text-[var(--lp-text-muted)] transition-transform group-hover:translate-x-0.5"
        >
          →
        </span>
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-[var(--lp-text-sub)]">{blurb}</p>
    </Link>
  );
}
