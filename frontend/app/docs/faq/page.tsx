import {
  DocsEyebrow,
  DocsH3,
  DocsP,
} from '@/features/docs/components/Prose';

export const metadata = {
  title: 'FAQs · Karwan Docs',
  description: 'Quick answers for first-time users.',
};

export default function DocsFaqPage() {
  return (
    <article>
      <DocsEyebrow>FAQs</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        Quick answers
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>
        The questions new users ask first. If yours is not here, reach the team
        through the links in the footer.
      </DocsP>

      <DocsH3>Do I need a crypto wallet to use Karwan?</DocsH3>
      <DocsP>
        No. You can sign in with email and a passkey, and a wallet is
        provisioned for you behind the scenes. If you already have a web3
        wallet, you can use that instead.
      </DocsP>

      <DocsH3>Is this real money?</DocsH3>
      <DocsP>
        Not yet. Karwan runs on Arc Testnet today. Testnet USDC has no real
        value. Get some from the Arc faucet linked in the footer to try the
        full flow.
      </DocsP>

      <DocsH3>Does my counterparty need an account?</DocsH3>
      <DocsP>
        For a direct deal, they sign in with the wallet you named on the deal
        and accept. A profile is set up for them on first accept, so they do not
        need to register ahead of time.
      </DocsP>

      <DocsH3>What happens if a negotiation does not agree?</DocsH3>
      <DocsP>
        Your agent works through the other matched sellers before giving up. If
        no one lands inside your range, the request ends with no agreement and no
        money moves. Post a fresh request with a higher budget or more tolerance
        to try again.
      </DocsP>

      <DocsH3>Can I cancel a deal?</DocsH3>
      <DocsP>
        Yes. Propose a cancellation and, if your counterparty accepts, the
        escrow refunds with no reputation hit on either side. Before the seller
        accepts the deal at all, the buyer can cancel freely since no escrow has
        funded.
      </DocsP>

      <DocsH3>Why does the bridge take so long?</DocsH3>
      <DocsP>
        Standard cross-chain transfers wait for the source chain to finalize,
        which is 10 to 19 minutes on testnet. The mint lands automatically once
        Circle confirms the burn.
      </DocsP>

      <DocsH3>How do I raise my reputation?</DocsH3>
      <DocsP>
        Complete deals cleanly, stake USDC in the vault, and stay active. Each
        settled deal and each day on the platform lifts your score.
      </DocsP>
    </article>
  );
}
