import Link from 'next/link';
import { api } from '@/core/api';
import { Card } from '@/shared/components/Card';

export const dynamic = 'force-dynamic';

export default async function HowItWorksPage() {
  const status = await api.status().catch(() => null);

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
            Post a brief and the agents run the auction and negotiation for you.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <DemoStep n="1" title="Post a brief">
            On <span className="mono">/buyer</span>, pick &quot;Find me a seller&quot;. Write what
            you need, set a budget and deadline. A <span className="mono">postJob</span>{' '}
            transaction lands on Arc in a few seconds.
          </DemoStep>
          <DemoStep n="2" title="Agents negotiate">
            The seller agent scores the brief and calls <span className="mono">submitBid</span>.
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
              Records the brief on the JobBoard. Emits <span className="mono">JobPosted</span>,
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
            role="The currency we settle in. Holds deal amounts, escrow balances, milestone payouts, and the platform fee."
          />
          <StackTile
            name="Developer-Controlled Wallets"
            role="Every agent runs on an SCA wallet on Arc Testnet. The buyer agent funds escrows and releases milestones; the seller agent bids and negotiates."
          />
          <StackTile
            name="CCTP V2"
            role="Buyer USDC bridges in from Base or Ethereum Sepolia. The user signs the burn, the backend relays the mint on Arc once Circle attests."
          />
          <StackTile
            name="Arc Testnet"
            role="Chain 5042002. Blocks finalize in under a second. USDC is the native gas token, and the ERC-8004 identity registry is already deployed here."
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
            What ships after the testnet build.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          <RoadmapTile
            title="Passkey sign-in"
            body="Sign in with a Circle Passkey. Email plus biometrics, no browser extension needed."
          />
          <RoadmapTile
            title="Self-custodied agent wallets"
            body="Each agent gets its own wallet under a spend allowance you set once at activation."
          />
          <RoadmapTile
            title="Disputes and appeals"
            body="On-chain dispute resolution, plus a seller appeal path to renegotiate if a buyer stalls on release."
          />
          <RoadmapTile
            title="Agent micro-payments"
            body="An x402 rail so agents can pay for verification calls and data while they work a deal."
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
          <Faq q="What is the difference between a direct deal and a managed deal?">
            A direct deal is for two parties who already found each other. You open an escrow
            naming the seller&apos;s wallet, no auction. A managed deal is for when you need a
            seller: you post a brief and agents run the auction and negotiation. Both use the same
            escrow, reputation, and settlement underneath.
          </Faq>
          <Faq q="What is the platform fee?">
            1.5% of the deal amount, split evenly between buyer and seller. The buyer funds the
            deal amount plus their half; the seller nets the deal amount minus their half. The fee
            is collected on chain by the escrow contract as milestones release, and goes to a
            treasury address.
          </Faq>
          <Faq q="Who controls the agent wallets today?">
            For this demo, agent wallets are Circle Dev-Controlled Wallets we provisioned ahead of
            time. In v1, each user connects their own wallet and either activates an agent under a
            spending allowance they set, or runs their own.
          </Faq>
          <Faq q="Are the smart contracts deployed?">
            Yes. KarwanJobBoard, KarwanEscrow, and KarwanReputation are live on Arc Testnet (chain
            5042002). The escrow carries the platform fee split on chain. Every event on the
            Activity feed links to its transaction on testnet.arcscan.app.
          </Faq>
          <Faq q="How is escrow released?">
            The buyer releases each milestone with releaseProgress. The seller&apos;s cut goes to
            the seller, the treasury&apos;s slice of the fee goes to the treasury, and the final
            release marks the escrow settled. In a direct deal the seller must mark the work
            delivered before the buyer can release. Disputes today go to manual review; v1 adds
            on-chain arbitration.
          </Faq>
          <Faq q="What if the seller agent skips my managed job?">
            The seller&apos;s profile has a budget and deadline range. If your brief falls outside
            it, the agent skips and the timeline shows you why. The LLM can also skip on
            confidence, and that gets logged too.
          </Faq>
          <Faq q="Why this corridor?">
            We started with MEASA because UAE non-oil trade with Africa alone is $50B+ and growing
            about 15% a year, with heavy informal volume and weak card rails. But the escrow,
            reputation, and agent layer is corridor-agnostic. It works for any cross-border service
            deal.
          </Faq>
          <Faq q="Where does the LLM run?">
            Agent decisions go through OpenRouter (default model: google/gemini-2.5-flash-lite) to
            keep cost low. We use Zod schemas for structured outputs, so an agent can only act
            inside its accepted budget and deadline range.
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
        {status && (
          <p className="text-[11px] text-[var(--color-ink-faint)] mono pt-2">
            chain {status.chain.id} · {status.chain.explorer.replace(/^https?:\/\//, '')}
          </p>
        )}
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
