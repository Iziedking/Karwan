'use client';

import Link from 'next/link';
import { Card } from '@/shared/components/Card';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

const CHAIN_ID = 5042002;
const EXPLORER_HOST = 'testnet.arcscan.app';

export default function HowItWorksPage() {
  const t = useTranslations().howItWorksPage;
  return (
    <div className="space-y-12 sm:space-y-20">
      {/* HEADER */}
      <header className="max-w-3xl space-y-4">
        <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
          {t.header.eyebrow}
        </span>
        <h1 className="text-[34px] sm:text-[40px] md:text-[48px] leading-[1.05] tracking-[-0.02em] font-semibold">
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
            cta={(
              <Link href="/buyer" className="-mx-2 inline-flex min-h-11 items-center px-2 underline">
                {t.directDeal.step1.cta}
              </Link>
            )}
          >
            {t.directDeal.step1.bodyA}<Link href="/buyer" className="underline">{t.directDeal.step1.cta}</Link>{t.directDeal.step1.bodyB}
          </DemoStep>
          <DemoStep n="2" title={t.directDeal.step2.title}>
            {t.directDeal.step2.body}
          </DemoStep>
          <DemoStep n="3" title={t.directDeal.step3.title}>
            {t.directDeal.step3.body}
          </DemoStep>
        </div>
      </section>

      <section className="border-y border-[var(--color-line)] py-6">
        <h2 className="text-[22px] font-semibold">{t.managedDeal.title}</h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[var(--color-ink-dim)]">{t.managedDeal.body}</p>
        <Link href="/market" className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold underline">{t.managedDeal.eyebrow}<span aria-hidden>→</span></Link>
      </section>

      {/* TRUST AND PROOF */}
      <section className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            {t.trust.eyebrow}
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">
            {t.trust.title}
          </h2>
          <p className="text-[14px] text-[var(--color-ink-dim)] mt-2 leading-relaxed">
            {t.trust.body}
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <p className="text-[14px] font-semibold">{t.trust.evidenceTitle}</p>
            <p className="text-[13px] text-[var(--color-ink-dim)] mt-2 leading-relaxed">
              {t.trust.evidence}
            </p>
          </Card>
          <Card>
            <p className="text-[14px] font-semibold">{t.trust.identityTitle}</p>
            <p className="text-[13px] text-[var(--color-ink-dim)] mt-2 leading-relaxed">
              {t.trust.identity}
            </p>
          </Card>
        </div>
        <p className="text-[12px] text-[var(--color-ink-faint)] leading-relaxed max-w-2xl">
          {t.trust.boundary}
        </p>
      </section>

      <details className="group border-y border-[var(--color-line)]">
        <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-4 font-semibold">
          {t.contract.eyebrow}<span aria-hidden className="group-open:rotate-45">+</span>
        </summary>
        <p className="max-w-2xl text-[14px] leading-relaxed text-[var(--color-ink-dim)]">{t.trust.boundary}</p>
        <Link href="/docs" className="inline-flex min-h-11 items-center py-3 underline">{t.header.eyebrow}<span aria-hidden> ↗</span></Link>
      </details>

      {/* FAQ */}
      <section id="faq" className="space-y-6">
        <div className="max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
            {t.faq.eyebrow}
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">{t.faq.title}</h2>
        </div>
        <div className="divide-y divide-[var(--color-line)] border border-[var(--color-line)] rounded-xl bg-[var(--color-surface)]">
          <Faq q={t.faq.q2.q}>
            {t.faq.q2.a}
          </Faq>
          <Faq q={t.faq.q5.q}>
            {t.faq.q5.a}
          </Faq>
          <Faq q={t.faq.q6.q}>
            {t.faq.q6.a}
          </Faq>
          <Faq q={t.faq.q8.q}>
            {t.faq.q8.a}
          </Faq>
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
            className="min-h-11 px-5 py-2.5 rounded-md text-[14px] font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-2"
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
    <div className="border-t border-[var(--color-line)] py-5 space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="text-[26px] mono font-semibold leading-none text-[var(--color-ink-faint)]">{n}</span>
        <span className="text-[15px] font-medium">{title}</span>
      </div>
      <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">{children}</p>
      {cta && <div className="text-[12px]">{cta}</div>}
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group px-5 py-4">
      <summary className="min-h-11 cursor-pointer flex items-center justify-between gap-3 list-none">
        <span className="text-[14px] font-medium">{q}</span>
        <span className="text-[var(--color-ink-faint)] group-open:rotate-45 transition-transform">+</span>
      </summary>
      <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed mt-3">{children}</p>
    </details>
  );
}
