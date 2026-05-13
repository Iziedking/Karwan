import Link from 'next/link';
import { HeroFlow } from '@/features/activity/components/HeroFlow';
import { AmbientCanvas } from '@/shared/components/AmbientCanvas';
import { PartnerLogos } from '@/shared/components/PartnerLogos';
import { LivePulseStrip } from '@/features/activity/components/LivePulseStrip';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <div className="space-y-24 -mt-2">
      {/* HERO */}
      <section className="relative -mx-6 px-6 pt-4 pb-10">
        <AmbientCanvas />
        <div className="relative grid md:grid-cols-5 gap-10 items-center">
          <div className="md:col-span-3 space-y-6">
            <span className="inline-block text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
              Built on Arc · Circle USDC
            </span>
            <h1 className="text-[40px] md:text-[56px] leading-[1.02] tracking-[-0.02em] font-semibold text-[var(--color-ink)]">
              How cross-border SME trade should settle.
            </h1>
            <p className="text-[16px] text-[var(--color-ink-dim)] leading-relaxed max-w-xl">
              Buyer and seller agents do the legwork. USDC settles on chain. Escrow holds the funds until the work is signed off. Built for UAE buyers and the SMEs they trade with across Africa and South Asia.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/app"
                style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
                className="px-5 py-2.5 rounded-md text-[14px] font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-2"
              >
                Launch app
                <span aria-hidden>→</span>
              </Link>
              <Link
                href="/how-it-works"
                className="px-5 py-2.5 rounded-md border border-[var(--color-line-strong)] text-[14px] font-medium hover:bg-[var(--color-surface-2)] transition-colors"
              >
                How it works
              </Link>
            </div>
          </div>
          <div className="md:col-span-2">
            <HeroFlow />
          </div>
        </div>
      </section>

      {/* PARTNER STRIP */}
      <section className="border-y border-[var(--color-line)] -mx-6 px-6 py-8 bg-[var(--color-surface)]/60">
        <PartnerLogos />
      </section>

      {/* PROBLEM */}
      <section className="grid md:grid-cols-5 gap-10">
        <div className="md:col-span-2">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-critical)]">
            The problem
          </span>
          <h2 className="text-[32px] md:text-[36px] leading-[1.1] tracking-[-0.02em] font-semibold mt-3">
            Cross-border SME trade hasn't really changed since the 1990s.
          </h2>
          <p className="text-[15px] text-[var(--color-ink-dim)] mt-4 leading-relaxed">
            A Lagos developer selling a $500 site to a Dubai SaaS founder waits two months for the wire to land. By then a tenth of the deal is gone to processors, FX spreads, and bank fees. Neither side has a verifiable record of past work to lean on. They start from scratch every time.
          </p>
        </div>
        <div className="md:col-span-3 grid sm:grid-cols-3 gap-3">
          <ProblemStat value="30–90d" label="Settlement time" hint="Cards, wires, reconciliation." />
          <ProblemStat value="5–8%" label="Lost per deal" hint="Processor and FX fees." />
          <ProblemStat value="$0" label="Portable reputation" hint="Trust resets every relationship." />
        </div>
      </section>

      {/* SOLUTION */}
      <section className="space-y-10">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            What we built
          </span>
          <h2 className="text-[32px] md:text-[36px] leading-[1.1] tracking-[-0.02em] font-semibold mt-3">
            Four parts. One settlement layer.
          </h2>
          <p className="text-[15px] text-[var(--color-ink-dim)] mt-4 leading-relaxed">
            Karwan handles four things. USDC settles the deal. A smart contract holds the funds. Buyer and seller agents negotiate the terms. Past outcomes are recorded so the next deal can lean on the last one. It runs on Circle's stack and on Arc.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          <SolutionTile
            n="01"
            title="USDC settlement"
            body="Funds land in seconds on Arc Testnet. USDC is the gas, so fees come out in pennies, not percentage points."
          />
          <SolutionTile
            n="02"
            title="Milestone escrow"
            body="The escrow contract holds the budget until the buyer signs off on each milestone. Up to four tranches per deal."
          />
          <SolutionTile
            n="03"
            title="Agentic coordination"
            body="Both sides have an agent that watches the chain, scores the brief, and bids or counters on its own. You step in only at the points that matter."
          />
          <SolutionTile
            n="04"
            title="Portable reputation"
            body="Built on ERC-8004 identity. The track record lives with the merchant, not on our servers. It travels with them."
          />
        </div>
      </section>

      {/* LIVE METRICS */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">Live</span>
            <h2 className="text-[24px] md:text-[28px] tracking-tight font-semibold mt-1">
              Activity on Arc Testnet, right now
            </h2>
          </div>
          <Link
            href="/activity"
            className="text-[13px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors"
          >
            See full feed →
          </Link>
        </div>
        <LivePulseStrip />
      </section>

      {/* CTA BAND */}
      <section className="-mx-6 px-6 py-16 bg-[var(--color-surface)] border-y border-[var(--color-line)] relative overflow-hidden">
        <AmbientCanvas />
        <div className="relative max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-[32px] md:text-[40px] leading-[1.05] tracking-[-0.02em] font-semibold">
            Run your first deal in about a minute.
          </h2>
          <p className="text-[15px] text-[var(--color-ink-dim)]">
            Post a brief, watch the agents work, see the funds settle. Every step is a real transaction on Arc Testnet.
          </p>
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <Link
              href="/app"
              style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
              className="px-5 py-2.5 rounded-md text-[14px] font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-2"
            >
              Launch app
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/how-it-works"
              className="px-5 py-2.5 rounded-md border border-[var(--color-line-strong)] text-[14px] font-medium hover:bg-[var(--color-surface-2)] transition-colors"
            >
              Read how it works
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProblemStat({ value, label, hint }: { value: string; label: string; hint: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <p className="text-[28px] mono font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="text-[13px] font-medium mt-1.5">{label}</p>
      <p className="text-[12px] text-[var(--color-ink-faint)] mt-1 leading-snug">{hint}</p>
    </div>
  );
}

function SolutionTile({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <p className="text-[11px] mono text-[var(--color-ink-faint)]">{n}</p>
      <h3 className="text-[16px] font-semibold tracking-tight mt-1.5">{title}</h3>
      <p className="text-[13px] text-[var(--color-ink-dim)] mt-2 leading-relaxed">{body}</p>
    </div>
  );
}
