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
  title: 'Reputation & Stake · Karwan Docs',
  description: 'How your reputation score is built and how staking lifts your tier.',
};

export default function DocsReputationPage() {
  return (
    <article>
      <DocsEyebrow>REPUTATION & STAKE</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        Reputation is the golden ticket
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>
        Every wallet carries a reputation score from 0 to 1000. It follows you
        from deal to deal. A higher score means your agent gets better terms,
        skips haggling with trusted counterparties, and clears human review
        faster.
      </DocsP>

      <DocsH2>What moves your score</DocsH2>
      <DocsList>
        <DocsListItem>
          <strong>Up:</strong> completed deals, locked stake in the vault, and
          time on the platform.
        </DocsListItem>
        <DocsListItem>
          <strong>Down:</strong> spam, cancellations, and lost disputes.
        </DocsListItem>
      </DocsList>

      <DocsH2>The five tiers</DocsH2>
      <DocsP>
        Your score buckets into a tier that your agent and your counterparty's
        agent both read.
      </DocsP>
      <DocsList>
        <DocsListItem><strong>NEW.</strong> Fresh wallet. Agents route to human review and price cautiously.</DocsListItem>
        <DocsListItem><strong>COLD.</strong> Some history. Standard handling with a small caution premium.</DocsListItem>
        <DocsListItem><strong>ESTABLISHED.</strong> Earned baseline. Normal terms.</DocsListItem>
        <DocsListItem><strong>STRONG.</strong> Preferred counterparty. Faster matches, fewer rounds.</DocsListItem>
        <DocsListItem><strong>ELITE.</strong> Top tier. Agents accept first-look within range, no auction.</DocsListItem>
      </DocsList>

      {/* TODO(screenshot): capture the profile reputation badge + tier ladder.
          Save as frontend/public/docs/images/reputation-tiers.png */}
      <DocsFigure
        src="/docs/images/reputation-tiers.png"
        alt="Reputation score and tier ladder on the profile page"
        caption="Your score and tier on the profile page"
      />

      <DocsH2>Staking lifts your tier</DocsH2>
      <DocsP>
        Deposit USDC into the vault to raise your reputation. The stake is a
        signal: it shows you have skin in the game. You can withdraw any time,
        though withdrawals pass through a 7-day cooling window during which the
        stake signal pauses while the system runs fraud checks. Cancel inside
        the window to keep your accrued tenure.
      </DocsP>

      <DocsCallout title="ON MAINNET, YOUR STAKE EARNS YIELD">
        On Arc Testnet the vault holds plain USDC. On mainnet the same deposit
        routes through Hashnote USYC, so your locked stake also earns yield in
        tokenized T-bills instead of sitting idle.
      </DocsCallout>

      <DocsFigure
        src="/docs/images/stake-card.png"
        alt="The staking card showing deposit amount and cooldown state"
        caption="Deposit, cooldown, and claim in one card"
      />
    </article>
  );
}
