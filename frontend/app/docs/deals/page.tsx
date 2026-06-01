import {
  DocsEyebrow,
  DocsH2,
  DocsP,
  DocsList,
  DocsListItem,
  DocsFigure,
  DocsCallout,
} from '@/features/docs/components/Prose';

export const metadata = {
  title: 'Deals and Escrow · Karwan Docs',
  description: 'The deal lifecycle from acceptance to settlement, plus shareable links and cashout.',
};

export default function DocsDealsPage() {
  return (
    <article>
      <DocsEyebrow>DEALS AND ESCROW</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        From handshake to settlement
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>
        Every deal moves money through a milestone escrow on Arc. The buyer
        funds it, the seller delivers, and the buyer releases in tranches. No
        one can pull funds out of turn, and either side can settle a dispute
        through the contract rather than waiting on a support inbox.
      </DocsP>

      <DocsH2>The lifecycle</DocsH2>
      <DocsList>
        <DocsListItem>
          <strong>Open.</strong> A buyer creates a direct deal or approves an
          agent-matched proposal.
        </DocsListItem>
        <DocsListItem>
          <strong>Accept and fund.</strong> The seller accepts the terms. The
          escrow funds with the deal amount and the buyer&apos;s half of the
          platform fee. A portion of the seller&apos;s stake reserves against
          the deal as insurance.
        </DocsListItem>
        <DocsListItem>
          <strong>Deliver.</strong> The seller marks the work delivered with an
          optional proof link or note.
        </DocsListItem>
        <DocsListItem>
          <strong>Release.</strong> The buyer releases the first milestone,
          then verifies and releases the rest. The escrow settles, the
          reservation returns to the seller&apos;s free stake, and the
          reputation registry records a clean outcome.
        </DocsListItem>
      </DocsList>

      <DocsP>
        The deal page tracks every stage with a progress strip on top and a
        next-move panel below it, so both sides always know exactly where the
        deal is and what they can do.
      </DocsP>

      <DocsFigure
        src="/docs/images/deal-lifecycle1.png"
        alt="Deal page after escrow funding, with the seller's mark-delivered action"
        caption="Escrow funded. The seller marks the work delivered."
      />
      <DocsFigure
        src="/docs/images/deal-lifecycle2.png"
        alt="Deal page from the buyer's side while waiting for delivery"
        caption="The buyer waits for delivery, with cancel as a fallback."
      />
      <DocsFigure
        src="/docs/images/deal-lifecycle3.png"
        alt="Deal page after delivery, the first milestone awaiting release"
        caption="Delivered. The first half is up for release."
      />
      <DocsFigure
        src="/docs/images/deal-lifecycle4.png"
        alt="Deal page with the buyer's release-first-milestone action"
        caption="The buyer releases the first half, or appeals."
      />
      <DocsFigure
        src="/docs/images/deal-lifecycle5.png"
        alt="Deal page after the first release, the final milestone awaiting verification"
        caption="First half released. The buyer verifies and releases the rest."
      />
      <DocsFigure
        src="/docs/images/deal-lifecycle6.png"
        alt="Deal page in the settled state, fully paid"
        caption="Settled. The seller is paid in full and reputation is recorded on chain."
      />

      <DocsH2>Shareable deal links</DocsH2>
      <DocsP>
        A buyer can point a direct deal at an email address instead of a
        wallet. Karwan sends a branded invite. The recipient opens the link,
        types the one-time code we just emailed, and a Circle wallet is
        provisioned in their browser. They accept the deal. From email to
        accepted deal is under two minutes, with no signup form.
      </DocsP>

      <DocsH2>The platform fee</DocsH2>
      <DocsP>
        Karwan takes a 1.5% platform fee on each deal, split evenly between
        buyer and seller. The fee collects on chain as each milestone releases.
        The buyer funds their half up front; the seller&apos;s half comes out
        of their payout.
      </DocsP>

      <DocsH2>Review windows and auto-release</DocsH2>
      <DocsP>
        Two timers protect both sides from a stalling counterparty. After the
        seller marks delivered, the buyer has a window to release the first
        milestone. If the buyer goes quiet past a short delay-appeal grace,
        the deal watcher releases the first milestone on their behalf. The
        final tranche never releases automatically; it always needs a buyer
        click. The buyer can extend the review window when they need more
        time.
      </DocsP>

      <DocsH2>Stake as deal insurance</DocsH2>
      <DocsP>
        When the seller accepts a deal, a configurable portion of their free
        stake reserves against the deal amount. The default is thirty percent;
        the buyer can dial it on the accept panel. On a clean settlement, the
        reservation releases back to the seller&apos;s free stake. On a failed
        dispute, the reservation slashes to the buyer as insurance.
      </DocsP>
      <DocsP>
        This is what makes a seller&apos;s reputation more than a number.
        A buyer can read the seller&apos;s free-stake balance and know what is
        actually backing the deal.
      </DocsP>

      <DocsH2>Cashing out after settlement</DocsH2>
      <DocsP>
        The Cashout page sends your settled USDC where you want it. Arc to
        Arc transfers are instant. Cross-chain transfers to Ethereum, Base,
        Arbitrum, Optimism, Polygon, or Solana run on the same Circle
        Cross-Chain Transfer Protocol that powers the inbound bridge. A
        progress card on the page shows every stage in real time.
      </DocsP>

      <DocsH2>If something goes wrong</DocsH2>
      <DocsList>
        <DocsListItem>
          <strong>Mutual cancel.</strong> Either side can propose a
          cancellation. If the other accepts, the escrow refunds and neither
          side takes a reputation hit.
        </DocsListItem>
        <DocsListItem>
          <strong>Dispute.</strong> A buyer can dispute from the funded or
          delivered state. Either side can resolve the dispute through the
          escrow contract, so the disputed state is not a one-way trapdoor.
          The outcome lands on the reputation record on chain.
        </DocsListItem>
      </DocsList>

      <DocsCallout title="ON ARC TESTNET TODAY">
        All deals on Karwan today settle in testnet USDC on Arc Testnet, which
        has no real value. Mainnet ships after the contracts pass a
        professional external audit.
      </DocsCallout>
    </article>
  );
}
