import Link from 'next/link';
import { Card } from '@/shared/components/Card';

// Chain identity is a constant; no need to round-trip the backend just to
// render a one-line mono footer. Keeps the page statically renderable.
const CHAIN_ID = 5042002;
const EXPLORER_HOST = 'testnet.arcscan.app';

export default function HowItWorksPage() {
  return (
    <div className="space-y-20">
      {/* HEADER */}
      <header className="max-w-3xl space-y-4">
        <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
          Documentation
        </span>
        <h1 className="text-[40px] md:text-[48px] leading-[1.05] tracking-[-0.02em] font-semibold">
          How Karwan works
        </h1>
        <p className="text-[15px] text-[var(--color-ink-dim)] leading-relaxed">
          Karwan secures USDC in escrow while a service is delivered. There are two ways to open a
          deal, one settlement spine underneath. This is the walkthrough: the flows, the on-chain
          calls, and the Circle products behind them. Every step is a real transaction on Arc
          Testnet.
        </p>
      </header>

      {/* DIRECT DEAL FLOW */}
      <section className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            Direct deal
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">
            When you already have a counterparty
          </h2>
          <p className="text-[14px] text-[var(--color-ink-dim)] mt-2">
            You agreed with someone off-platform. Karwan just secures the money while the work gets
            done.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <DemoStep
            n="1"
            title="Open the deal"
            cta={<Link href="/buyer" className="underline">Open buyer dashboard</Link>}
          >
            On <span className="mono">/buyer</span>, pick &quot;I have a seller&quot;. Enter their
            wallet address, the amount, a deadline, and how much releases on delivery. The escrow
            funds on Arc, naming that seller directly.
          </DemoStep>
          <DemoStep n="2" title="Seller delivers">
            The seller signs in with the wallet you named. The deal is waiting on their dashboard.
            When the work is done, they mark it delivered, which unlocks your releases.
          </DemoStep>
          <DemoStep n="3" title="Release in tranches">
            You release the first slice, then verify the work and release the rest. The escrow
            settles, the platform fee is collected, and the seller&apos;s reputation is recorded
            on chain.
          </DemoStep>
        </div>
      </section>

      {/* MANAGED DEAL FLOW */}
      <section className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            Managed deal
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">
            When you need an agent to find one
          </h2>
          <p className="text-[14px] text-[var(--color-ink-dim)] mt-2">
            Post a request and the agents run the auction and negotiation for you.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <DemoStep n="1" title="Post a request">
            On <span className="mono">/buyer</span>, pick &quot;Find me a seller&quot;. Write what
            you need, set a budget and deadline. A <span className="mono">postJob</span>{' '}
            transaction lands on Arc in a few seconds.
          </DemoStep>
          <DemoStep n="2" title="Agents negotiate">
            The seller agent scores the request and calls <span className="mono">submitBid</span>.
            Your buyer agent ranks it, counters once, and accepts the best terms. Each step shows
            on the live timeline.
          </DemoStep>
          <DemoStep n="3" title="Settle the deal">
            On acceptance, the buyer agent approves USDC and funds the escrow. When the work is
            done, release the milestones. Funds move to the seller in tranches.
          </DemoStep>
        </div>
      </section>

      {/* CONTRACT FLOW */}
      <section className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            Under the hood
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">The on-chain calls</h2>
          <p className="text-[14px] text-[var(--color-ink-dim)] mt-2">
            A managed deal walks the full path below. A direct deal skips straight to{' '}
            <span className="mono">fundEscrow</span>, naming the seller without an auction.
          </p>
        </div>
        <Card>
          <ol className="space-y-4">
            <Step label="postJob(bytes32, uint256, uint64, string)" actor="Buyer agent · managed only">
              Records the request on the JobBoard. Emits <span className="mono">JobPosted</span>,
              the event seller agents subscribe to.
            </Step>
            <Step label="submitBid · counterOffer · respondToCounter · acceptBid" actor="Both agents · managed only">
              The negotiation loop. Seller bids, buyer counters once, seller responds, buyer locks
              final terms.
            </Step>
            <Step label="USDC.approve(escrow, fundedAmount)" actor="Buyer agent">
              ERC-20 approval so KarwanEscrow can pull funds. The approval covers the deal amount
              plus the buyer&apos;s half of the platform fee.
            </Step>
            <Step label="fundEscrow(bytes32, address, uint256, uint8[])" actor="Buyer agent">
              Locks the deal amount with a milestone schedule. The contract pulls{' '}
              <span className="mono">dealAmount + feeHalf</span>, stores what the seller nets and
              what the treasury collects. Emits <span className="mono">EscrowFunded</span>.
            </Step>
            <Step label="releaseProgress(bytes32, uint8)" actor="Buyer">
              Releases one milestone. The seller gets their cut, the treasury gets its
              proportional slice of the 1.5% fee. The final milestone sweeps any remainder and
              marks the escrow settled.
            </Step>
            <Step label="recordCompletion(bytes32, address, address, uint8)" actor="Buyer agent">
              On settlement, records the outcome against the seller on KarwanReputation. ERC-8004
              forbids self-rating, so the buyer rates the seller.
            </Step>
          </ol>
        </Card>
      </section>

      {/* STAKE AND REPUTATION */}
      <section className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            Stake to grow reputation
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">
            The reputation engine, end to end
          </h2>
          <p className="text-[14px] text-[var(--color-ink-dim)] mt-2">
            Every wallet has a composite score in [0, 1000] derived from completed deals, locked
            stake, time on the platform, and a spam-detection penalty. The score binds to one of
            five tiers and gates how aggressively the agent loop negotiates on your behalf.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <DemoStep n="1" title="Deposit USDC">
            On <span className="mono">/profile · STAKE</span>, deposit any amount into{' '}
            <span className="mono">KarwanVault</span>. No forced lock, no minimum tenure. The
            longer it sits, the more weight it carries in the formula.
          </DemoStep>
          <DemoStep n="2" title="Climb tiers">
            <span className="mono">NEW · COLD · ESTABLISHED · STRONG · ELITE</span>. Each tier
            unlocks specific agent behavior. ELITE sellers skip the auction; NEW buyers pay a
            premium that surfaces to the seller for human review before approval.
          </DemoStep>
          <DemoStep n="3" title="Withdraw anytime">
            Request a withdrawal and the position enters a three-day cool-down while fraud
            checks run. Cancel inside the window to resume without losing tenure. After the
            cool-down, claim returns the principal in a single transaction.
          </DemoStep>
        </div>
      </section>

      {/* CIRCLE STACK */}
      <section className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            Circle stack
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">What we use, and where</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <StackTile
            name="USDC"
            role="The currency we settle in. Holds deal amounts, escrow balances, milestone payouts, the platform fee, and KarwanVault staking principal."
          />
          <StackTile
            name="Developer-Controlled Wallets"
            role="Every agent runs on an SCA wallet on Arc Testnet. The buyer agent funds escrows and releases milestones; the seller agent bids and negotiates. Identity DCWs sign vault deposits and withdrawals for Circle-auth users with no wallet popup."
          />
          <StackTile
            name="CCTP V2"
            role="Bidirectional USDC bridge across six chains today: Base, Ethereum, Arbitrum, Optimism, and Polygon Sepolia, plus Solana Devnet. The user signs the burn, Karwan relays the mint on the destination, and the cashout page runs the same pipe in reverse."
          />
          <StackTile
            name="App Kit"
            role="Circle's unified SDK for bridge, swap, send, and unified balance. Reuses our Developer-Controlled Wallets as the source so we add new cross-chain features without managing extra credentials."
          />
          <StackTile
            name="Gas Station"
            role="Sponsors source-chain gas for our Circle wallet users on Base Sepolia and Ethereum Sepolia, so a non-crypto user only ever holds USDC. No buy ETH first detour."
          />
          <StackTile
            name="Arc Testnet"
            role="Chain 5042002. Blocks finalize in under a second. USDC is the native gas token, and the ERC-8004 identity and reputation registries are already deployed."
          />
          <StackTile
            name="Resend"
            role="Transactional email for one-time code sign-in, deal invites, and deal alerts. Inline brand logo, dark-mode safe template."
          />
          <StackTile
            name="Hashnote USYC (mainnet)"
            role="On mainnet the vault and treasury route idle USDC through Hashnote USYC via the standard ERC-4626 interface, so locked principal earns the short rate while reputation is unchanged. Testnet runs against a deterministic mock adapter on the same interface so the demo path works today."
          />
        </div>
      </section>

      {/* ROADMAP */}
      <section className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            Roadmap
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">Coming next</h2>
          <p className="text-[14px] text-[var(--color-ink-dim)] mt-2">
            What ships after the current testnet build.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          <RoadmapTile
            title="x402 nanopayment rails"
            body="Wire Circle's x402 micropayment surface so agents can pay sub-cent USDC fees to call paid data, run credit checks, and pull news during a deal. Every paid signal lands on the deal timeline so users see what their agent paid for and why."
          />
          <RoadmapTile
            title="Invoice factoring"
            body="A financier funds an accepted deal at a discount; the escrow routes the payout to the financier on release. The credit passport becomes a financing surface, with reputation tier setting the discount floor."
          />
          <RoadmapTile
            title="Mainnet hardening"
            body="External smart-contract audit, a Safe multisig treasury, and higher branch coverage on the escrow and vault before any mainnet deployment."
          />
          <RoadmapTile
            title="Full multi-language coverage"
            body="Extend the five-locale framework to every page and add a right-to-left layout pass for Arabic, replacing the fallback default direction."
          />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            FAQs
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">Common questions</h2>
        </div>
        <div className="divide-y divide-[var(--color-line)] border border-[var(--color-line)] rounded-xl bg-[var(--color-surface)]">
          <Faq q="What is the difference between a direct deal and an agent-matched deal?">
            A direct deal is for two parties who already know each other. You open an escrow
            naming the seller&apos;s wallet, or even an email address, and skip the auction. An
            agent-matched deal is for when you need a counterparty: you post a request as a buyer
            or an offer as a seller, and the agents run the matching and negotiation. Both use the
            same escrow, reputation, and settlement underneath.
          </Faq>
          <Faq q="What is the platform fee?">
            1.5% of the deal amount, split evenly between buyer and seller. The buyer funds the
            deal amount and their half of the fee; the seller nets the deal amount minus their
            half. The fee collects on chain as each milestone releases.
          </Faq>
          <Faq q="Who controls my agent wallet?">
            Your agent wallet is a Circle Developer-Controlled Wallet whose owner is you. Karwan
            can sign on its behalf to negotiate while you sleep, but it never opens an escrow
            without your sign-off. You can sweep funds out of it at any time from the profile
            page.
          </Faq>
          <Faq q="Are the smart contracts deployed?">
            Yes. The escrow, vault, reputation, treasury, and job-board contracts are live on Arc
            Testnet (chain 5042002). The current addresses are in the public repository. Every
            event in the activity feed links to its transaction on the Arc explorer.
          </Faq>
          <Faq q="How does the escrow release?">
            The buyer releases each milestone with a single click. The seller gets their share,
            the treasury gets the platform fee in proportion, and the final release marks the
            escrow settled. The final milestone always needs an explicit buyer click; it never
            auto-releases.
          </Faq>
          <Faq q="What if a deal goes to dispute?">
            A buyer can dispute from the funded or delivered state. The escrow moves to a
            disputed state and either side can resolve through the contract. A refund returns the
            money to the buyer and slashes the seller&apos;s reserved stake to the buyer as
            insurance. A release sends the money to the seller. The outcome lands on both
            parties&apos; on-chain reputation record.
          </Faq>
          <Faq q="What if a seller agent skips my agent-matched request?">
            The seller&apos;s profile has a budget and deadline range. If your request falls
            outside it, the agent skips and the timeline shows you why. If the agent is uncertain
            for any other reason, that is logged too, so the next move is never silent.
          </Faq>
          <Faq q="Which corridors does this serve?">
            Karwan works for any cross-border service deal anywhere in the world. The early
            language roster covers several corridors where bank rails are slowest today,
            including the Gulf, North and West Africa, the Indian subcontinent, and East Africa,
            but the escrow, reputation, and agent layer is corridor-agnostic. New languages and
            corridors come on as the user base grows.
          </Faq>
          <Faq q="Where does the agent reasoning run?">
            Every decision that touches money is handled by a deterministic rule set in the
            backend: budget and deadline bounds, topical match, stake requirements, reservation
            math. A language model only handles the parts that need judgement, such as whether
            two non-overlapping skill descriptions describe the same job, or how to phrase a
            counter. If the language model goes offline, the agent keeps working through its
            deterministic fallbacks.
          </Faq>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center space-y-4 py-6">
        <h2 className="text-[28px] tracking-tight font-semibold">Try it on Arc Testnet</h2>
        <p className="text-[14px] text-[var(--color-ink-dim)]">
          The dashboard runs both flows against real testnet contracts.
        </p>
        <div className="pt-2">
          <Link
            href="/buyer"
            style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
            className="px-5 py-2.5 rounded-md text-[14px] font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-2"
          >
            Launch app
            <span aria-hidden>→</span>
          </Link>
        </div>
        <p className="text-[11px] text-[var(--color-ink-faint)] mono pt-2">
          chain {CHAIN_ID} · {EXPLORER_HOST}
        </p>
      </section>
    </div>
  );
}

function DemoStep({
  n,
  title,
  children,
  cta,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
  cta?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-3 hover:-translate-y-0.5 hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-card-hover)] transition-[transform,border-color,box-shadow] duration-200">
      <div className="flex items-baseline gap-3">
        <span className="text-[26px] mono font-semibold leading-none text-[var(--color-ink-faint)]">{n}</span>
        <span className="text-[15px] font-medium">{title}</span>
      </div>
      <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">{children}</p>
      {cta && <div className="text-[12px]">{cta}</div>}
    </div>
  );
}

function Step({
  label,
  actor,
  children,
}: {
  label: string;
  actor: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid md:grid-cols-12 gap-3 py-3 border-b border-[var(--color-line)] last:border-0">
      <div className="md:col-span-5">
        <p className="text-[13px] mono break-all">{label}</p>
        <p className="text-[11px] text-[var(--color-ink-faint)] mt-0.5">{actor}</p>
      </div>
      <p className="md:col-span-7 text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
        {children}
      </p>
    </li>
  );
}

function StackTile({ name, role }: { name: string; role: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 hover:-translate-y-0.5 hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-card-hover)] transition-[transform,border-color,box-shadow] duration-200">
      <p className="text-[14px] font-semibold">{name}</p>
      <p className="text-[12px] text-[var(--color-ink-dim)] mt-1.5 leading-relaxed">{role}</p>
    </div>
  );
}

function RoadmapTile({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 hover:-translate-y-0.5 hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-card-hover)] transition-[transform,border-color,box-shadow] duration-200">
      <p className="text-[14px] font-semibold">{title}</p>
      <p className="text-[12px] text-[var(--color-ink-dim)] mt-1.5 leading-relaxed">{body}</p>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group px-5 py-4">
      <summary className="cursor-pointer flex items-start justify-between gap-3 list-none">
        <span className="text-[14px] font-medium">{q}</span>
        <span className="text-[var(--color-ink-faint)] group-open:rotate-45 transition-transform">+</span>
      </summary>
      <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed mt-3">{children}</p>
    </details>
  );
}
