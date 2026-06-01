import {
  DocsEyebrow,
  DocsH2,
  DocsH3,
  DocsP,
  DocsList,
  DocsListItem,
  DocsFigure,
  DocsCallout,
} from '@/features/docs/components/Prose';

export const metadata = {
  title: 'Agents · Karwan Docs',
  description: 'How the buyer and seller agents negotiate on your behalf.',
};

export default function DocsAgentsPage() {
  return (
    <article>
      <DocsEyebrow>AGENTS</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        Agents that trade like people
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>
        When you post a request or an offer, you get an agent. It finds
        matches, negotiates price and deadline, and brings the final terms
        back to you before any money moves. It is a matchmaker, not a
        spender. It never opens an escrow without your sign-off.
      </DocsP>

      <DocsH2>How a negotiation runs</DocsH2>
      <DocsP>
        Post a request and your buyer agent opens a short auction window.
        Seller agents bid. Your agent scores every bid on price, the
        seller&apos;s reputation, their completion rate, how long they have
        been on the platform, and how active they are. The best bids line up
        in a queue.
      </DocsP>
      <DocsP>
        Your agent negotiates with the top candidate first. Both sides concede
        in shrinking steps, the way people do: a big move early, smaller moves
        as they close in. If the top candidate will not land in your range,
        your agent moves to the next one in the queue instead of giving up.
      </DocsP>
      <DocsP>
        Each agent only sees its own principal&apos;s range. The buyer agent
        knows the budget and the tolerance ceiling; the seller agent knows
        the asking price and the floor. Neither side ever reads the
        other&apos;s reservation. The two agents meet in the middle on a
        deterministic concession curve, with the current market median and
        recent counterparty reputation as shared, public references.
      </DocsP>

      <DocsFigure
        src="/docs/images/negotiation-timeline.png"
        alt="Activity timeline showing counter rounds between buyer and seller agents"
        caption="A live negotiation, round by round, in the deal timeline"
      />

      <DocsH3>Why it feels human</DocsH3>
      <DocsList>
        <DocsListItem>
          <strong>It anchors and concedes.</strong> A seller opens above their
          floor; a buyer holds near their budget. Each round closes part of the
          gap, with smaller steps as the deal nears agreement.
        </DocsListItem>
        <DocsListItem>
          <strong>It reads reputation.</strong> A trusted counterparty earns a
          faster concession. A brand-new wallet gets more caution.
        </DocsListItem>
        <DocsListItem>
          <strong>It closes instead of stalling.</strong> On the final round,
          if the offer is inside your range, your agent accepts rather than
          walking away over a few dollars.
        </DocsListItem>
        <DocsListItem>
          <strong>It tries alternatives.</strong> If the first negotiation
          fails, your agent works down the candidate list before declaring no
          match.
        </DocsListItem>
      </DocsList>

      <DocsCallout title="YOU ALWAYS APPROVE">
        The agent negotiates, but it never funds an escrow on its own. When it
        reaches agreement, it surfaces a proposal. You review it and approve
        before any USDC moves.
      </DocsCallout>

      <DocsH2>Setting your guardrails</DocsH2>
      <DocsP>
        Your agent only acts inside the limits you set in your profile: your
        budget or asking price, your acceptable delivery window, and your
        tolerance for moving off the posted number. Set these once and the
        agent respects them on every deal.
      </DocsP>

      <DocsFigure
        src="/docs/images/agent-guardrails.png"
        alt="The request form showing budget, deadline, and tolerance guardrails"
        caption="The guardrails your agent negotiates within"
      />
    </article>
  );
}
