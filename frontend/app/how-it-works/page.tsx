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
          A walkthrough of how a deal moves from brief to settled. The on-chain calls, the Circle products, and the parts each agent plays. Every step is a real transaction on Arc Testnet.
        </p>
      </header>

      {/* DEMO STEPS */}
      <section className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            The 60-second demo
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">Three steps, on chain</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <DemoStep
            n="1"
            title="Post a brief"
            cta={<Link href="/buyer" className="underline">Open buyer dashboard</Link>}
          >
            On <span className="mono">/buyer</span>, write what you need built, pick a budget, pick a deadline, submit. A <span className="mono">postJob</span> transaction lands on Arc in a few seconds.
          </DemoStep>
          <DemoStep n="2" title="Watch agents negotiate">
            The seller agent reads the brief, scores it against its profile, and calls <span className="mono">submitBid</span>. Your buyer agent ranks the bid, counters once, and accepts. Each step shows up on the live timeline.
          </DemoStep>
          <DemoStep n="3" title="Settle the deal">
            On acceptance, the buyer agent approves USDC and calls <span className="mono">fundEscrow</span> to lock the budget. When the work is done, click <span className="mono">Release milestones</span>. Funds move to the seller in tranches.
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
            Each demo step maps to a transaction on a deployed Karwan contract.
          </p>
        </div>
        <Card>
          <ol className="space-y-4">
            <Step label="postJob(bytes32, uint256, uint64, string)" actor="Buyer agent">
              Records the brief on the JobBoard. Emits <span className="mono">JobPosted</span>, which is the event seller agents subscribe to.
            </Step>
            <Step label="submitBid(bytes32, uint256, uint64)" actor="Seller agent">
              After LLM scoring, the seller posts a bid. Emits <span className="mono">BidSubmitted</span>.
            </Step>
            <Step label="counterOffer(bytes32, address, uint256, uint64)" actor="Buyer agent">
              After the bid-collection window, the buyer agent issues a counter to the top-scored seller.
            </Step>
            <Step label="respondToCounter(bytes32, bool, uint256, uint64)" actor="Seller agent">
              Seller accepts, counters back, or declines. Emits <span className="mono">CounterResponse</span>.
            </Step>
            <Step label="acceptBid(bytes32, address)" actor="Buyer agent">
              Buyer locks final terms. Emits <span className="mono">BidAccepted</span>.
            </Step>
            <Step label="USDC.approve(escrow, amount)" actor="Buyer agent">
              ERC-20 approval so KarwanEscrow can pull funds. Uses USDC's ERC-20 interface (6 decimals).
            </Step>
            <Step label="fundEscrow(bytes32, address, uint256, uint8[])" actor="Buyer agent">
              Locks the agreed amount with a milestone schedule. Emits <span className="mono">EscrowFunded</span>.
            </Step>
            <Step label="releaseProgress(bytes32, uint8)" actor="Buyer (human)">
              Tranches funds to the seller per milestone. Final release marks the escrow settled.
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
            role="The currency we settle in. Holds bid prices, escrow balances, and milestone payouts."
          />
          <StackTile
            name="Developer-Controlled Wallets"
            role="Every agent runs on an SCA wallet on Arc Testnet, with per-wallet spend limits scoped to the deal flow."
          />
          <StackTile
            name="Nanopayments"
            role="Agents pay per research call (reputation lookups, market data). Progress payments stream as milestones close."
          />
          <StackTile
            name="CCTP and Bridge Kit"
            role="Buyer USDC moves from Ethereum or Base over to Arc before escrow gets funded. v0 supports one direction."
          />
          <StackTile
            name="Gateway"
            role="Treasury pools fees into a single balance across chains and keeps refund liquidity ready."
          />
          <StackTile
            name="Arc Testnet"
            role="Chain 5042002. Blocks finalize in under a second. USDC is the native gas token. The ERC-8004 identity registry is already deployed here."
          />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            FAQ
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">Common questions</h2>
        </div>
        <div className="divide-y divide-[var(--color-line)] border border-[var(--color-line)] rounded-xl bg-[var(--color-surface)]">
          <Faq q="Who controls the agent wallets today?">
            For this demo, agent wallets are Circle Dev-Controlled Wallets we provisioned ahead of time. In v1, each user connects their own wallet (browser wallet or Circle passkey) and either activates an agent under a spending allowance they set, or runs their own.
          </Faq>
          <Faq q="Are the smart contracts deployed?">
            Yes. KarwanJobBoard, KarwanEscrow, and KarwanReputation are live on Arc Testnet (chain 5042002). Every event on the Activity feed links to its transaction on testnet.arcscan.app.
          </Faq>
          <Faq q="Why MEASA?">
            UAE non-oil trade with Africa alone is $50B+ and growing about 15% a year. There's heavy informal trade volume, weak existing card rails, and stablecoin acceptance is rising fast. Karwan fits that intersection.
          </Faq>
          <Faq q="What if the seller agent skips my job?">
            The seller's profile has a budget and deadline range. If your job falls outside it, the agent skips and the timeline shows you why (e.g. "budget 0.5 USDC below seller minimum of 1 USDC"). The LLM can also skip on confidence, and that gets logged too.
          </Faq>
          <Faq q="How is escrow released?">
            KarwanEscrow holds the USDC until the buyer calls releaseProgress on each milestone. The final release marks the escrow settled. Disputes today go to a manual review on our side. v1 will add on-chain arbitration.
          </Faq>
          <Faq q="Where does the LLM run?">
            Agent decisions go through OpenRouter (default model: google/gemini-2.5-flash-lite) to keep cost low. We use Zod schemas for structured outputs, so the agent can only submit bids inside its accepted budget and deadline range.
          </Faq>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center space-y-4 py-6">
        <h2 className="text-[28px] tracking-tight font-semibold">Try it on Arc Testnet</h2>
        <p className="text-[14px] text-[var(--color-ink-dim)]">
          The dashboard runs the full flow against real testnet contracts.
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
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 space-y-3">
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
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <p className="text-[14px] font-semibold">{name}</p>
      <p className="text-[12px] text-[var(--color-ink-dim)] mt-1.5 leading-relaxed">{role}</p>
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
