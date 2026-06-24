'use client';

import Link from 'next/link';
import { Card } from '@/shared/components/Card';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

const CHAIN_ID = 5042002;
const EXPLORER_HOST = 'testnet.arcscan.app';

export default function HowItWorksPage() {
  const t = useTranslations().howItWorksPage;
  return (
    <div className="space-y-20">
      {/* HEADER */}
      <header className="max-w-3xl space-y-4">
        <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
          {t.header.eyebrow}
        </span>
        <h1 className="text-[40px] md:text-[48px] leading-[1.05] tracking-[-0.02em] font-semibold">
          {t.header.title}
        </h1>
        <p className="text-[15px] text-[var(--color-ink-dim)] leading-relaxed">
          {t.header.body}
        </p>
      </header>

      {/* DIRECT DEAL FLOW */}
      <section className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            {t.directDeal.eyebrow}
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">
            {t.directDeal.title}
          </h2>
          <p className="text-[14px] text-[var(--color-ink-dim)] mt-2">
            {t.directDeal.body}
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <DemoStep
            n="1"
            title={t.directDeal.step1.title}
            cta={<Link href="/buyer" className="underline">{t.directDeal.step1.cta}</Link>}
          >
            {t.directDeal.step1.bodyA}<span className="mono">/buyer</span>{t.directDeal.step1.bodyB}
          </DemoStep>
          <DemoStep n="2" title={t.directDeal.step2.title}>
            {t.directDeal.step2.body}
          </DemoStep>
          <DemoStep n="3" title={t.directDeal.step3.title}>
            {t.directDeal.step3.body}
          </DemoStep>
        </div>
      </section>

      {/* MANAGED DEAL FLOW */}
      <section className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            {t.managedDeal.eyebrow}
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">
            {t.managedDeal.title}
          </h2>
          <p className="text-[14px] text-[var(--color-ink-dim)] mt-2">
            {t.managedDeal.body}
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <DemoStep n="1" title={t.managedDeal.step1.title}>
            {t.managedDeal.step1.bodyA}<span className="mono">/buyer</span>{t.managedDeal.step1.bodyB}<span className="mono">postJob</span>{t.managedDeal.step1.bodyC}
          </DemoStep>
          <DemoStep n="2" title={t.managedDeal.step2.title}>
            {t.managedDeal.step2.bodyA}<span className="mono">submitBid</span>{t.managedDeal.step2.bodyB}
          </DemoStep>
          <DemoStep n="3" title={t.managedDeal.step3.title}>
            {t.managedDeal.step3.body}
          </DemoStep>
        </div>
      </section>

      {/* CONTRACT FLOW */}
      <section className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            {t.contract.eyebrow}
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">{t.contract.title}</h2>
          <p className="text-[14px] text-[var(--color-ink-dim)] mt-2">
            {t.contract.bodyA}<span className="mono">fundEscrow</span>{t.contract.bodyB}
          </p>
        </div>
        <Card>
          <ol className="space-y-4">
            <Step label="postJob(bytes32, uint256, uint64, string)" actor={t.contract.step1.actor}>
              {t.contract.step1.bodyA}<span className="mono">JobPosted</span>{t.contract.step1.bodyB}
            </Step>
            <Step label="submitBid · counterOffer · respondToCounter · acceptBid" actor={t.contract.step2.actor}>
              {t.contract.step2.body}
            </Step>
            <Step label="USDC.approve(escrow, fundedAmount)" actor={t.contract.step3.actor}>
              {t.contract.step3.body}
            </Step>
            <Step label="fundEscrow(bytes32, address, uint256, uint8[])" actor={t.contract.step4.actor}>
              {t.contract.step4.bodyA}<span className="mono">dealAmount + feeHalf</span>{t.contract.step4.bodyB}<span className="mono">EscrowFunded</span>{t.contract.step4.bodyC}
            </Step>
            <Step label="releaseProgress(bytes32, uint8)" actor={t.contract.step5.actor}>
              {t.contract.step5.body}
            </Step>
            <Step label="recordCompletion(bytes32, address, address, uint8)" actor={t.contract.step6.actor}>
              {t.contract.step6.body}
            </Step>
          </ol>
        </Card>
      </section>

      {/* STAKE AND REPUTATION */}
      <section className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            {t.stake.eyebrow}
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">
            {t.stake.title}
          </h2>
          <p className="text-[14px] text-[var(--color-ink-dim)] mt-2">
            {t.stake.body}
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <DemoStep n="1" title={t.stake.step1.title}>
            {t.stake.step1.bodyA}<span className="mono">/profile · STAKE</span>{t.stake.step1.bodyB}<span className="mono">KarwanVault</span>{t.stake.step1.bodyC}
          </DemoStep>
          <DemoStep n="2" title={t.stake.step2.title}>
            <span className="mono">NEW · COLD · ESTABLISHED · STRONG · ELITE</span>{t.stake.step2.body}
          </DemoStep>
          <DemoStep n="3" title={t.stake.step3.title}>
            {t.stake.step3.body}
          </DemoStep>
        </div>
      </section>

      {/* CIRCLE STACK */}
      <section className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            {t.stack.eyebrow}
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">{t.stack.title}</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <StackTile
            name="USDC"
            role={t.stack.usdc}
          />
          <StackTile
            name="Developer-Controlled Wallets"
            role={t.stack.dcw}
          />
          <StackTile
            name="CCTP V2"
            role={t.stack.cctp}
          />
          <StackTile
            name="App Kit"
            role={t.stack.appKit}
          />
          <StackTile
            name="Gas Station"
            role={t.stack.gasStation}
          />
          <StackTile
            name="Arc Testnet"
            role={t.stack.arc}
          />
          <StackTile
            name="Hashnote USYC"
            role={t.stack.usyc}
          />
        </div>
      </section>

      {/* ROADMAP */}
      <section className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            {t.roadmap.eyebrow}
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">{t.roadmap.title}</h2>
          <p className="text-[14px] text-[var(--color-ink-dim)] mt-2">
            {t.roadmap.body}
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          <RoadmapTile
            title={t.roadmap.x402.title}
            body={t.roadmap.x402.body}
          />
          <RoadmapTile
            title={t.roadmap.factoring.title}
            body={t.roadmap.factoring.body}
          />
          <RoadmapTile
            title={t.roadmap.mainnet.title}
            body={t.roadmap.mainnet.body}
          />
          <RoadmapTile
            title={t.roadmap.i18n.title}
            body={t.roadmap.i18n.body}
          />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            {t.faq.eyebrow}
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">{t.faq.title}</h2>
        </div>
        <div className="divide-y divide-[var(--color-line)] border border-[var(--color-line)] rounded-xl bg-[var(--color-surface)]">
          <Faq q={t.faq.q1.q}>
            {t.faq.q1.a}
          </Faq>
          <Faq q={t.faq.q2.q}>
            {t.faq.q2.a}
          </Faq>
          <Faq q={t.faq.q3.q}>
            {t.faq.q3.a}
          </Faq>
          <Faq q={t.faq.q4.q}>
            {t.faq.q4.a}
          </Faq>
          <Faq q={t.faq.q5.q}>
            {t.faq.q5.a}
          </Faq>
          <Faq q={t.faq.q6.q}>
            {t.faq.q6.a}
          </Faq>
          <Faq q={t.faq.q7.q}>
            {t.faq.q7.a}
          </Faq>
          <Faq q={t.faq.q8.q}>
            {t.faq.q8.a}
          </Faq>
          <Faq q={t.faq.q10.q}>
            {t.faq.q10.a}
          </Faq>
        </div>
      </section>

      {/* VIDEO GUIDES (placeholder until the walkthroughs are recorded) */}
      <section className="space-y-4">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            {t.videoGuides.eyebrow}
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">{t.videoGuides.title}</h2>
        </div>
        <div className="rounded-xl border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface)] p-6 flex items-start gap-4">
          <div
            aria-hidden
            className="shrink-0 w-11 h-11 rounded-full border border-[var(--color-line-strong)] flex items-center justify-center text-[var(--color-ink-faint)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M5 3.5v9l7-4.5-7-4.5z" />
            </svg>
          </div>
          <div className="space-y-1.5">
            <span className="inline-block text-[10px] uppercase tracking-[0.14em] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-ink-dim)]">
              {t.videoGuides.badge}
            </span>
            <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
              {t.videoGuides.body}
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center space-y-4 py-6">
        <h2 className="text-[28px] tracking-tight font-semibold">{t.cta.title}</h2>
        <p className="text-[14px] text-[var(--color-ink-dim)]">
          {t.cta.body}
        </p>
        <div className="pt-2">
          <Link
            href="/buyer"
            style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
            className="px-5 py-2.5 rounded-md text-[14px] font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-2"
          >
            {t.cta.button}
            <span aria-hidden>→</span>
          </Link>
        </div>
        <p className="text-[11px] text-[var(--color-ink-faint)] mono pt-2">
          {t.cta.chainPrefix} {CHAIN_ID} · {EXPLORER_HOST}
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
