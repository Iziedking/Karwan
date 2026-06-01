import Link from 'next/link';
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
  title: 'Reputation and Stake · Karwan Docs',
  description: 'How your reputation score is built, how it resists gaming, and how staking lifts your tier.',
};

export default function DocsReputationPage() {
  return (
    <article>
      <DocsEyebrow>REPUTATION AND STAKE</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        Reputation is the golden ticket
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>
        Every wallet on Karwan carries a public reputation score from 0 to 1000.
        It follows you from deal to deal. A higher score earns better terms,
        skips haggling with trusted counterparties, and clears human review
        faster.
      </DocsP>

      <DocsH2>What moves your score</DocsH2>
      <DocsP>
        Five signals feed the score today, each on a curve where the first
        units of effort matter most and the last units matter least. The mix
        is designed so no single shortcut takes you to the top, in order of
        weight:
      </DocsP>
      <DocsList>
        <DocsListItem>
          <strong>Locked stake.</strong> USDC deposited in the vault. The
          largest single contributor, and the only one that doubles as deal
          insurance.
        </DocsListItem>
        <DocsListItem>
          <strong>Settled deals.</strong> Completed outcomes against your
          wallet, weighted by your success rate.
        </DocsListItem>
        <DocsListItem>
          <strong>Lifetime volume.</strong> Total USDC moved through escrow.
          One huge deal does not dominate.
        </DocsListItem>
        <DocsListItem>
          <strong>Tenure.</strong> Days since the wallet first registered.
          Slow to earn, impossible to fake.
        </DocsListItem>
        <DocsListItem>
          <strong>Activity.</strong> Distinct days the wallet was active.
          Showing up over time matters, not raw deal count.
        </DocsListItem>
      </DocsList>
      <DocsP>
        A penalty multiplier reduces the score for confirmed dispute losses,
        cancellations, spam patterns, and abandoned negotiations. The penalty
        is capped, so a slashed wallet always keeps a path back through
        honest behaviour.
      </DocsP>
      <DocsP>
        A sixth signal, referrals through real deals, joins the score on
        mainnet as a marketing rail. It is not live today, so it does not
        factor into your score yet.{' '}
        <Link
          href="/docs/roadmap#referral-marketing-rail"
          className="underline decoration-[var(--lp-accent)] underline-offset-2 hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
        >
          Read the roadmap entry
        </Link>
        .
      </DocsP>

      <DocsH2>The five tiers</DocsH2>
      <DocsP>
        Your score buckets into one of five tiers. Your agent and your
        counterparty&apos;s agent both read the tier when scoring a match.
      </DocsP>
      <DocsList>
        <DocsListItem><strong>NEW (0 to 199).</strong> Fresh wallet. Agents route to human review and price cautiously.</DocsListItem>
        <DocsListItem><strong>COLD (200 to 399).</strong> Some history. Standard handling with a small caution premium.</DocsListItem>
        <DocsListItem><strong>ESTABLISHED (400 to 599).</strong> Earned baseline. Normal terms.</DocsListItem>
        <DocsListItem><strong>STRONG (600 to 799).</strong> Preferred counterparty. Faster matches, fewer rounds.</DocsListItem>
        <DocsListItem><strong>ELITE (800 to 1000).</strong> Top tier. Agents accept first-look within range, no auction.</DocsListItem>
      </DocsList>
      <DocsP>
        Tier breakpoints are fixed at the same numbers on testnet and mainnet.
        The score scale does the work; the labels mean the same thing wherever
        you read them.
      </DocsP>

      <DocsFigure
        src="/docs/images/reputation-tiers.png"
        alt="Reputation score and tier ladder on the profile page"
        caption="Your score and tier on the profile page."
      />

      <DocsH2>How the score resists gaming</DocsH2>
      <DocsP>
        Reputation systems usually fail because a determined user can find a
        cheap path to the top. Karwan&apos;s formula closes the most common
        ones by design.
      </DocsP>
      <DocsH3>Volume farming</DocsH3>
      <DocsP>
        Posting many small deals with yourself does not pay off. The volume
        curve is concave, so each extra unit of volume contributes less than
        the one before. The activity and referral factors also look at distinct
        counterparties, so repeating the same partner stops crediting your
        score.
      </DocsP>
      <DocsH3>Stake and run</DocsH3>
      <DocsP>
        Depositing a large stake to spike the score, doing one deal, then
        withdrawing the same day will not work. Withdrawals pass through a
        3-day cooling window. The position stops contributing to the score
        the moment you request the withdrawal, and the system runs fraud checks
        before the funds release. Cancel inside the window to keep your accrued
        tenure.
      </DocsP>
      <DocsH3>Self-dealing</DocsH3>
      <DocsP>
        The on-chain reputation registry refuses to let an agent&apos;s owner
        rate their own agent. The constraint is enforced at the contract layer,
        not just in our application, so a determined user cannot bypass it by
        writing their own client.
      </DocsP>
      <DocsH3>Match and cancel</DocsH3>
      <DocsP>
        Bidding on many requests and pulling out before settlement counts
        toward the cancellation penalty. The penalty hits in days, not months,
        so cycling through this pattern drops the score fast.
      </DocsP>
      <DocsH3>Decay on idleness</DocsH3>
      <DocsP>
        A once-strong wallet that goes silent for months is no longer trusted
        as currently strong. The decay term reduces the displayed score so
        agents weigh inactive history less. A returning user re-earns trust by
        completing a deal or two.
      </DocsP>

      <DocsH2>Staking lifts your tier and backs your deals</DocsH2>
      <DocsP>
        Deposit USDC into the vault to raise your reputation. The stake is a
        signal: it shows you have skin in the game. The same position also acts
        as deal insurance: when you accept a deal, a portion of your free stake
        reserves against the deal amount. A clean settlement releases the
        reservation back; a failed dispute slashes it to the buyer.
      </DocsP>
      <DocsP>
        You can withdraw any time. Withdrawals pass through a 3-day cooling
        window during which the stake signal pauses while the system runs
        fraud checks. Cancel inside the window to keep your accrued tenure.
      </DocsP>

      <DocsCallout title="ON MAINNET, YOUR STAKE EARNS YIELD">
        On Arc Testnet the vault holds plain USDC. On mainnet the same deposit
        routes through Hashnote USYC via the standard ERC-4626 interface, so
        your locked stake also earns yield in tokenized T-bills instead of
        sitting idle.
      </DocsCallout>

      <DocsFigure
        src="/docs/images/stake-card.png"
        alt="The staking card showing deposit amount and cooldown state"
        caption="Deposit, cooldown, and claim in one card."
      />
    </article>
  );
}
