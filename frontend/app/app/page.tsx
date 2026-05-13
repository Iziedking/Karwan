import Link from 'next/link';
import { api } from '@/core/api';
import { Card } from '@/shared/components/Card';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
import { LivePulseStrip } from '@/features/activity/components/LivePulseStrip';
import { shortAddress } from '@/shared/utils/format';

export const dynamic = 'force-dynamic';

export default async function AppHome() {
  let status;
  try {
    status = await api.status();
  } catch (err) {
    return (
      <Card title="Backend offline">
        <p className="text-sm text-[var(--color-ink-dim)] mono">{String(err)}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-10">
      <header className="fade-up flex flex-wrap items-end justify-between gap-4 pb-2">
        <div>
          <h1 className="text-[28px] tracking-tight font-semibold">Welcome to Karwan</h1>
          <p className="text-[13px] text-[var(--color-ink-dim)] mt-1">
            Your pre-provisioned demo agents are running on Arc Testnet. Pick where to start.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--color-positive-soft)] text-[var(--color-positive)] text-[12px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-positive)]" />
          Agents live
        </span>
      </header>

      <section className="fade-up fade-up-1 grid md:grid-cols-3 gap-4">
        <ActionCard
          href="/buyer"
          eyebrow="Buyer"
          title="Post a brief"
          body="Describe what you need built. Set a budget. Hit post. The seller agent reads it and bids within seconds."
        />
        <ActionCard
          href="/seller"
          eyebrow="Seller"
          title="See the agent at work"
          body="The seller agent watches the chain, scores incoming briefs, and bids on the ones that fit its profile."
        />
        <ActionCard
          href="/activity"
          eyebrow="Activity"
          title="Watch chain events"
          body="Live SSE feed of every event from both agents. Each row links to its transaction on Arcscan."
        />
      </section>

      <section className="fade-up fade-up-2 grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <BalancesCard />
        </div>
        <Card title="Network">
          <div className="space-y-3 text-[13px]">
            <Row label="Chain" value={`Arc Testnet · ${status.chain.id}`} />
            <Row label="Settlement" value="USDC" />
            <Row label="Buyer wallet" value={shortAddress(status.agents.buyer.address)} mono />
            <Row label="Seller wallet" value={shortAddress(status.agents.seller.address)} mono />
          </div>
        </Card>
      </section>

      <section className="fade-up fade-up-3 space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">Live</span>
            <h2 className="text-[20px] tracking-tight font-semibold mt-1">Today on chain</h2>
          </div>
          <Link
            href="/activity"
            className="text-[12px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors"
          >
            See full feed →
          </Link>
        </div>
        <LivePulseStrip />
      </section>

      <section className="fade-up fade-up-3 grid md:grid-cols-2 gap-4">
        <Card title="New here?">
          <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
            The fastest way to see Karwan work is to post a one-line brief. Pick a small budget, a short deadline, and submit. The seller agent will respond on chain in seconds.
          </p>
          <div className="pt-3">
            <Link
              href="/how-it-works"
              className="text-[13px] underline decoration-dotted text-[var(--color-ink)]"
            >
              Or read the full walkthrough
            </Link>
          </div>
        </Card>
        <Card title="Coming in v1">
          <ul className="space-y-2 text-[13px] text-[var(--color-ink-dim)]">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-[var(--color-ink-faint)] shrink-0" />
              <span>Connect your own wallet via Circle passkey or browser extension.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-[var(--color-ink-faint)] shrink-0" />
              <span>Activate a buyer or seller agent under your control. Set your own spend limits.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-[var(--color-ink-faint)] shrink-0" />
              <span>On-chain dispute resolution. CCTP bridging from Ethereum and Base.</span>
            </li>
          </ul>
        </Card>
      </section>
    </div>
  );
}

function ActionCard({
  href,
  eyebrow,
  title,
  body,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 hover:border-[var(--color-ink)] transition-colors"
    >
      <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">{eyebrow}</p>
      <h3 className="text-[17px] font-semibold tracking-tight mt-1.5">{title}</h3>
      <p className="text-[13px] text-[var(--color-ink-dim)] mt-2 leading-relaxed">{body}</p>
      <p className="text-[12px] text-[var(--color-ink-dim)] mt-3 group-hover:text-[var(--color-ink)] transition-colors">
        Open →
      </p>
    </Link>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">{label}</span>
      <span className={`text-[13px] text-[var(--color-ink)] ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  );
}
