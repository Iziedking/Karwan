import Link from 'next/link';
import { HeroFlow } from '@/features/activity/components/HeroFlow';
import { PeerNetwork } from '@/shared/components/PeerNetwork';
import { PartnerLogos } from '@/shared/components/PartnerLogos';
import { LivePulseStrip } from '@/features/activity/components/LivePulseStrip';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <div className="space-y-24 -mt-2">
      {/* HERO */}
      <section className="relative -mx-6 px-6 pt-4 pb-10">
        <PeerNetwork />
        <div className="relative grid md:grid-cols-5 gap-10 items-center">
          <div className="md:col-span-3 space-y-6">
            <span className="inline-block text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
              Built on Arc · Circle USDC
            </span>
            <h1 className="text-[40px] md:text-[56px] leading-[1.02] tracking-[-0.02em] font-semibold text-[var(--color-ink)]">
              Service payments, settled on delivery.
            </h1>
            <p className="text-[16px] text-[var(--color-ink-dim)] leading-relaxed max-w-xl">
              Karwan is an on-chain settlement network for service deals. Open an escrow with a
              counterparty you already have, or post a brief and let agents find one. USDC settles
              on Arc in seconds, and milestones release as the work lands.
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
            Getting paid for work across borders still runs on 1990s rails.
          </h2>
          <p className="text-[15px] text-[var(--color-ink-dim)] mt-4 leading-relaxed">
            A Lagos developer selling a $500 site to a Dubai founder waits two months for the wire
            to land. By then a tenth of the deal is gone to processors, FX spreads, and bank fees.
            Neither side has a verifiable record of past work to lean on. They start from scratch
            every time. The corridor changes, the friction does not.
          </p>
        </div>
        <div className="md:col-span-3 grid sm:grid-cols-3 gap-3">
          <ProblemStat value="30–90d" label="Settlement time" hint="Cards, wires, reconciliation." decoration="timeline" />
          <ProblemStat value="5–8%" label="Lost per deal" hint="Processor and FX fees." decoration="leak" />
          <ProblemStat value="$0" label="Portable reputation" hint="Trust resets every relationship." decoration="reset" />
        </div>
      </section>

      {/* TWO MODES */}
      <section className="space-y-10">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            Two ways in
          </span>
          <h2 className="text-[32px] md:text-[36px] leading-[1.1] tracking-[-0.02em] font-semibold mt-3">
            Bring your own counterparty, or let an agent find one.
          </h2>
          <p className="text-[15px] text-[var(--color-ink-dim)] mt-4 leading-relaxed">
            Same settlement spine underneath. The difference is how the deal starts.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <ModeTile
            tag="Direct deal"
            title="You already have a seller"
            body="You agreed with someone on X, Discord, anywhere. Open an escrow naming their wallet. They sign in, deliver the work, and you release the funds in tranches. No auction, no waiting."
            points={[
              'Name the seller wallet, set the amount and a first-release slice',
              'Seller marks the work delivered to unlock your releases',
              'You release the first slice, then the rest once it is verified',
            ]}
          />
          <ModeTile
            tag="Managed deal"
            title="You need a seller"
            body="Post a brief and your buyer agent runs a sealed auction against seller agents. It scores bids, counters once, and accepts the best terms. You wake up to a funded escrow."
            points={[
              'Write the brief, set a budget and deadline',
              'Buyer and seller agents negotiate on chain, on their own',
              'Escrow funds on acceptance, you release on sign-off',
            ]}
          />
        </div>
      </section>

      {/* SETTLEMENT SPINE */}
      <section className="space-y-10">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            What we built
          </span>
          <h2 className="text-[32px] md:text-[36px] leading-[1.1] tracking-[-0.02em] font-semibold mt-3">
            One settlement spine, four primitives.
          </h2>
          <p className="text-[15px] text-[var(--color-ink-dim)] mt-4 leading-relaxed">
            USDC settles the deal. A smart contract holds the funds and splits a small fee. Past
            outcomes are recorded so the next deal can lean on the last. Funds bridge in from other
            chains when they need to. It runs on Circle&apos;s stack and on Arc.
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
            body="The escrow contract holds the budget until each milestone is released. A 1.5% platform fee is split evenly between buyer and seller, collected on chain."
          />
          <SolutionTile
            n="03"
            title="Portable reputation"
            body="Built on ERC-8004. When a deal settles, the outcome is recorded on chain against the seller. The track record travels with the wallet, not our servers."
          />
          <SolutionTile
            n="04"
            title="Cross-chain funding"
            body="Bring USDC over from Base or Ethereum Sepolia with CCTP V2, or top up an agent straight from your Arc balance. Liquidity follows the deal."
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
        <PeerNetwork />
        <div className="relative max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-[32px] md:text-[40px] leading-[1.05] tracking-[-0.02em] font-semibold">
            Open your first deal in about a minute.
          </h2>
          <p className="text-[15px] text-[var(--color-ink-dim)]">
            Direct or agent-run, your call. Every step is a real transaction on Arc Testnet.
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

function ModeTile({
  tag,
  title,
  body,
  points,
}: {
  tag: string;
  title: string;
  body: string;
  points: string[];
}) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6 hover:-translate-y-0.5 hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-card-hover)] transition-[transform,border-color,box-shadow] duration-200">
      <span className="inline-block text-[10px] uppercase tracking-[0.14em] text-[var(--color-accent)] font-semibold">
        {tag}
      </span>
      <h3 className="text-[20px] font-semibold tracking-tight mt-2">{title}</h3>
      <p className="text-[13px] text-[var(--color-ink-dim)] mt-2 leading-relaxed">{body}</p>
      <ul className="mt-4 pt-4 border-t border-[var(--color-line)] space-y-2">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-[12px] text-[var(--color-ink-dim)]">
            <span
              aria-hidden
              className="mt-[6px] w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shrink-0"
            />
            <span className="leading-relaxed">{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProblemStat({
  value,
  label,
  hint,
  decoration,
}: {
  value: string;
  label: string;
  hint: string;
  decoration: 'timeline' | 'leak' | 'reset';
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 hover:-translate-y-0.5 hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-card-hover)] transition-[transform,border-color,box-shadow] duration-200">
      {/* diagonal stripe wash, subtle */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, var(--color-ink) 0 1px, transparent 1px 9px)',
          maskImage: 'radial-gradient(ellipse 80% 60% at 100% 0%, black, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 100% 0%, black, transparent 70%)',
        }}
      />

      {/* corner brackets */}
      <CornerBrackets />

      {/* per-stat decoration top-right */}
      <span className="absolute top-3 right-3 text-[var(--color-critical)] opacity-70 group-hover:opacity-100 transition-opacity">
        <StatGlyph kind={decoration} />
      </span>

      <div className="relative">
        <p className="text-[28px] mono font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="text-[13px] font-medium mt-1.5">{label}</p>
        <p className="text-[12px] text-[var(--color-ink-faint)] mt-1 leading-snug">{hint}</p>
      </div>

      {/* animated baseline */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-5 right-5 bottom-3 h-px bg-[var(--color-line)] overflow-hidden"
      >
        <span className="stat-sweep block h-full w-1/3 bg-[var(--color-critical)] opacity-70" />
      </span>
    </div>
  );
}

function CornerBrackets() {
  const stroke = 'currentColor';
  const cls = 'pointer-events-none absolute w-3.5 h-3.5 text-[var(--color-line-strong)]';
  return (
    <>
      <svg className={`${cls} top-1.5 left-1.5`} viewBox="0 0 12 12" aria-hidden>
        <path d="M1 5V1h4" stroke={stroke} strokeWidth="1.2" fill="none" />
      </svg>
      <svg className={`${cls} top-1.5 right-1.5`} viewBox="0 0 12 12" aria-hidden>
        <path d="M11 5V1H7" stroke={stroke} strokeWidth="1.2" fill="none" />
      </svg>
      <svg className={`${cls} bottom-1.5 left-1.5`} viewBox="0 0 12 12" aria-hidden>
        <path d="M1 7v4h4" stroke={stroke} strokeWidth="1.2" fill="none" />
      </svg>
      <svg className={`${cls} bottom-1.5 right-1.5`} viewBox="0 0 12 12" aria-hidden>
        <path d="M11 7v4H7" stroke={stroke} strokeWidth="1.2" fill="none" />
      </svg>
    </>
  );
}

function StatGlyph({ kind }: { kind: 'timeline' | 'leak' | 'reset' }) {
  if (kind === 'timeline') {
    // long horizontal bar slowly filling, settlement that drags
    return (
      <svg width="44" height="22" viewBox="0 0 44 22" fill="none" aria-hidden>
        <rect x="0.5" y="6" width="43" height="10" rx="2" stroke="currentColor" strokeWidth="1" opacity="0.4" />
        <rect x="2" y="7.5" width="0" height="7" fill="currentColor" rx="1">
          <animate attributeName="width" values="0;40;40;0" keyTimes="0;0.7;0.95;1" dur="4.5s" repeatCount="indefinite" />
        </rect>
        <circle cx="2" cy="11" r="1.4" fill="currentColor" />
        <circle cx="42" cy="11" r="1.4" fill="currentColor" />
      </svg>
    );
  }
  if (kind === 'leak') {
    // chunks being chipped off, fees eating into the deal
    return (
      <svg width="36" height="22" viewBox="0 0 36 22" fill="none" aria-hidden>
        <rect x="0.5" y="6" width="35" height="10" rx="2" stroke="currentColor" strokeWidth="1" opacity="0.4" />
        <g fill="currentColor">
          <rect x="3" y="8" width="6" height="6" rx="1">
            <animate attributeName="opacity" values="1;0;1" dur="2.2s" repeatCount="indefinite" begin="0s" />
          </rect>
          <rect x="11" y="8" width="6" height="6" rx="1">
            <animate attributeName="opacity" values="1;0;1" dur="2.2s" repeatCount="indefinite" begin="0.5s" />
          </rect>
          <rect x="19" y="8" width="6" height="6" rx="1">
            <animate attributeName="opacity" values="1;0;1" dur="2.2s" repeatCount="indefinite" begin="1s" />
          </rect>
          <rect x="27" y="8" width="6" height="6" rx="1" opacity="0.4" />
        </g>
      </svg>
    );
  }
  // reset, three empty slots with a sweeping wipe
  return (
    <svg width="44" height="22" viewBox="0 0 44 22" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" fill="none" opacity="0.55">
        <rect x="1" y="6" width="12" height="10" rx="1.5" />
        <rect x="16" y="6" width="12" height="10" rx="1.5" />
        <rect x="31" y="6" width="12" height="10" rx="1.5" />
      </g>
      <line x1="0" y1="11" x2="44" y2="11" stroke="currentColor" strokeWidth="1" opacity="0.7">
        <animate attributeName="x1" values="-10;44" dur="3.2s" repeatCount="indefinite" />
        <animate attributeName="x2" values="-2;52" dur="3.2s" repeatCount="indefinite" />
      </line>
    </svg>
  );
}

function SolutionTile({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 hover:-translate-y-0.5 hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-card-hover)] transition-[transform,border-color,box-shadow] duration-200">
      <p className="text-[11px] mono text-[var(--color-ink-faint)]">{n}</p>
      <h3 className="text-[16px] font-semibold tracking-tight mt-1.5">{title}</h3>
      <p className="text-[13px] text-[var(--color-ink-dim)] mt-2 leading-relaxed">{body}</p>
    </div>
  );
}
