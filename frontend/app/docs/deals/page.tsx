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
  title: 'Deals & Escrow · Karwan Docs',
  description: 'The deal lifecycle from acceptance to settlement.',
};

export default function DocsDealsPage() {
  return (
    <article>
      <DocsEyebrow>DEALS & ESCROW</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        From handshake to settlement
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>
        Every deal moves money through a milestone escrow on Arc. The buyer
        funds it, the seller delivers, and the buyer releases in tranches. No
        one can pull funds out of turn.
      </DocsP>

      <DocsH2>The lifecycle</DocsH2>
      <DocsList>
        <DocsListItem>
          <strong>Open.</strong> A buyer creates a direct deal or approves an
          agent-matched proposal.
        </DocsListItem>
        <DocsListItem>
          <strong>Accept and fund.</strong> The seller accepts the terms; the
          escrow funds with the deal amount plus the buyer's half of the fee.
        </DocsListItem>
        <DocsListItem>
          <strong>Deliver.</strong> The seller marks the work delivered with an
          optional proof link.
        </DocsListItem>
        <DocsListItem>
          <strong>Release.</strong> The buyer releases the first milestone, then
          verifies and releases the rest. The escrow settles.
        </DocsListItem>
      </DocsList>

      <DocsP>
        Here is the deal page at each stage. The progress track on top and the
        next-move panel below it always tell you exactly where the deal is and
        what you can do.
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
        caption="Delivered. The first 50% is up for release."
      />
      <DocsFigure
        src="/docs/images/deal-lifecycle4.png"
        alt="Deal page with the buyer's release-first-milestone action"
        caption="The buyer releases the first 50%, or appeals."
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

      <DocsH2>The fee</DocsH2>
      <DocsP>
        A platform fee of 1.5% splits evenly between buyer and seller and
        collects on chain as each milestone releases. The buyer funds their
        half up front; the seller's half comes out of their payout.
      </DocsP>

      <DocsH2>Review windows and auto-release</DocsH2>
      <DocsP>
        Two timers protect both sides. After the seller marks delivered, the
        buyer has a window to release. If the buyer goes quiet, the deal watcher
        releases the milestone for them so the seller is not left hanging. The
        buyer can add time once if they are still reviewing.
      </DocsP>

      <DocsH2>If something goes wrong</DocsH2>
      <DocsList>
        <DocsListItem>
          <strong>Mutual cancel.</strong> Either side can propose a
          cancellation. If the other accepts, the escrow refunds and neither
          side takes a reputation hit.
        </DocsListItem>
        <DocsListItem>
          <strong>Dispute.</strong> A buyer can dispute after delivery. The
          escrow moves to a disputed state and the reputation system records
          the outcome.
        </DocsListItem>
      </DocsList>

      <DocsCallout tone="warn" title="KNOWN LIMITATION ON TESTNET">
        In the current build a buyer can dispute and refund after delivery, and
        the seller's only recourse is the reputation slash that follows. The
        next contract version hardens staking as deal insurance to fix this.
        Testnet runs use no real money.
      </DocsCallout>
    </article>
  );
}
