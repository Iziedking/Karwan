import {
  DocsEyebrow,
  DocsH2,
  DocsP,
  DocsList,
  DocsListItem,
  DocsCallout,
} from '@/features/docs/components/Prose';

export const metadata = {
  title: 'Roadmap · Karwan Docs',
  description: 'What is shipping next on Karwan.',
};

export default function DocsRoadmapPage() {
  return (
    <article>
      <DocsEyebrow>ROADMAP</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        What is coming next
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>
        Karwan runs on Arc Testnet today. The escrow, the agents, the reputation
        passport, and the bridge are all live. The work below is the direction we
        are building toward, grouped by theme. It is the plan, not a dated
        promise, and the order can shift as we learn from real usage.
      </DocsP>

      <DocsH2>Trust and safety</DocsH2>
      <DocsP>
        The next wave hardens the parts that protect your money and your
        counterparty.
      </DocsP>
      <DocsList>
        <DocsListItem>
          <strong>Verified deliverables.</strong> A security agent scans every
          delivered link before the buyer ever sees it, so a malicious URL never
          reaches the person about to release escrow. Confirmed bad actors take a
          permanent reputation hit.
        </DocsListItem>
        <DocsListItem>
          <strong>Staking as deal insurance.</strong> A portion of a seller's
          stake backs the deals they accept. A buyer who is defrauded recovers
          from that stake instead of chasing the seller, which raises the cost of
          bad behaviour.
        </DocsListItem>
        <DocsListItem>
          <strong>Terms and Conditions.</strong> A clear, versioned consent
          surface so everyone agrees to the same rules before they trade, with a
          public page anyone can read.
        </DocsListItem>
      </DocsList>

      <DocsH2>Smarter agents</DocsH2>
      <DocsP>
        Agents that read the market and explain themselves, plus richer ways to
        hand over the work.
      </DocsP>
      <DocsList>
        <DocsListItem>
          <strong>Market-aware negotiation.</strong> Agents read live demand and
          supply for a skill and use it as leverage, then attach a one-line
          reason to every counter so you can see why your agent moved.
        </DocsListItem>
        <DocsListItem>
          <strong>File delivery.</strong> Deliver work as a file, not just a
          link, with the same scan pipeline. Backed by Cloudflare R2 for speed
          and IPFS for tamper-evident, content-addressed delivery of confidential
          trade documents.
        </DocsListItem>
        <DocsListItem>
          <strong>Documented reputation rules.</strong> One authoritative page
          for every formula behind a score and tier, including a completion-rate
          signal that rewards early delivery and never punishes slow but on-time
          work.
        </DocsListItem>
      </DocsList>

      <DocsH2>Capital and yield</DocsH2>
      <DocsP>
        Turning a clean trade record into working capital.
      </DocsP>
      <DocsList>
        <DocsListItem>
          <strong>Public Credit Passport.</strong> A shareable page for any
          wallet showing its trade record, score, and tier. A financier can read
          it without signing in.
        </DocsListItem>
        <DocsListItem>
          <strong>Invoice factoring.</strong> After a deal is accepted, a seller
          can request early payout. A financier funds the receivable, reads the
          credit passport, and the settlement routes to them on completion.
        </DocsListItem>
        <DocsListItem>
          <strong>Treasury yield.</strong> Idle stake and platform fees route
          into Hashnote USYC on mainnet, so capital that would sit still earns
          while it waits.
        </DocsListItem>
      </DocsList>

      <DocsH2>Reach</DocsH2>
      <DocsP>
        Built for cross-border SME trade across the MEASA corridors.
      </DocsP>
      <DocsList>
        <DocsListItem>
          <strong>Full localisation.</strong> English, Arabic, French, Hindi, and
          Swahili across the whole product, with a proper right-to-left pass for
          Arabic.
        </DocsListItem>
        <DocsListItem>
          <strong>Shareable deal links.</strong> Send a direct deal to a
          counterparty who is not registered yet, and let them complete it from
          the link.
        </DocsListItem>
        <DocsListItem>
          <strong>Full handbook.</strong> A hosted guide for buyers, sellers,
          financiers, and agent operators as the platform grows.
        </DocsListItem>
      </DocsList>

      <DocsCallout title="TESTNET TODAY">
        Everything live on Karwan runs on Arc Testnet, so testnet USDC has no
        real value. Mainnet items, including treasury yield, ship after the
        contracts pass a professional external audit.
      </DocsCallout>
    </article>
  );
}
