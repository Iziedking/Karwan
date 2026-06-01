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
      <DocsEyebrow>FAQS</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        Quick answers
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>
        The questions new users ask first. If yours is not here, reach the
        team through the links in the footer.
      </DocsP>

      <DocsH3>Do I need a crypto wallet to use Karwan?</DocsH3>
      <DocsP>
        No. You can sign in with email and a passkey, and a wallet is
        provisioned for you behind the scenes. If you already have a web3
        wallet, you can use that instead through Sign-In with Ethereum.
      </DocsP>

      <DocsH3>Is this real money?</DocsH3>
      <DocsP>
        Not yet. Karwan runs on Arc Testnet today. Testnet USDC has no real
        value. Get some from the Arc faucet linked in the footer to try the
        full flow. We also auto-drip a small amount of testnet USDC when you
        first sign in.
      </DocsP>

      <DocsH3>Does my counterparty need an account?</DocsH3>
      <DocsP>
        Not in advance. For a direct deal, you can name a wallet or an email
        address. If you name an email, the recipient gets a branded invite
        with a one-time code. They open the link, type the code, a Circle
        wallet is provisioned in their browser, and they accept the deal.
        From email to accepted deal is under two minutes.
      </DocsP>

      <DocsH3>What happens if a negotiation does not agree?</DocsH3>
      <DocsP>
        Your agent works through the other matched candidates before giving
        up. If no one lands inside your range, the request ends with no
        agreement and no money moves. Repost with a higher budget or a wider
        tolerance to try again.
      </DocsP>

      <DocsH3>Can I cancel a deal?</DocsH3>
      <DocsP>
        Yes. Propose a cancellation, and if your counterparty accepts, the
        escrow refunds with no reputation hit on either side. Before the
        seller accepts the deal at all, the buyer can cancel freely since no
        escrow has funded.
      </DocsP>

      <DocsH3>What if the seller does not deliver?</DocsH3>
      <DocsP>
        The buyer can dispute. The escrow moves to a disputed state and
        either side can resolve through the contract: a refund returns funds
        to the buyer and slashes the seller&apos;s reserved stake to the
        buyer as insurance; a release sends the funds to the seller. The
        outcome lands on both parties&apos; on-chain reputation record.
      </DocsP>

      <DocsH3>What if the buyer is slow to release?</DocsH3>
      <DocsP>
        The seller can extend the deal once they mark delivered. If the buyer
        goes quiet past a short delay-appeal window, Karwan auto-releases the
        first milestone for them. The final tranche always needs an explicit
        buyer click, so a silent buyer cannot accidentally settle a deal they
        never verified.
      </DocsP>

      <DocsH3>Why does the bridge take so long?</DocsH3>
      <DocsP>
        Standard cross-chain transfers wait for the source chain to finalize,
        which is ten to nineteen minutes on Sepolia testnets. The mint lands
        automatically once Circle confirms the burn. The bridge card on the
        page tracks every stage so you always know where things are.
      </DocsP>

      <DocsH3>How do I raise my reputation?</DocsH3>
      <DocsP>
        Complete deals cleanly, stake USDC in the vault, and stay active. The
        score combines six factors on a curve where the first units of effort
        matter most, so steady behaviour over time grows the score faster
        than any single big move.
      </DocsP>

      <DocsH3>Where do I cash out after a deal settles?</DocsH3>
      <DocsP>
        From the Cashout page. Send USDC to any wallet on Arc instantly, or
        bridge out to Ethereum, Base, Arbitrum, Optimism, Polygon, or Solana.
        The page shows every stage of the bridge in real time.
      </DocsP>

      <DocsH3>Does Karwan custody my funds?</DocsH3>
      <DocsP>
        No. Funds sit in the on-chain escrow contract during the deal. The
        platform never has the keys to release them; only the contract&apos;s
        rules and your sign-off do. When you cash out, the funds move from
        your Karwan wallet to wherever you point them.
      </DocsP>
    </article>
  );
}
