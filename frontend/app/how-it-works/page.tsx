'use client';

import Link from 'next/link';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { WALLET_HOME } from '@/shared/utils/routes';

const SECTION_LABEL = 'text-[13px] font-medium text-[var(--color-ink-dim)]';

export default function HowItWorksPage() {
  const messages = useTranslations();
  const t = messages.howItWorksPage;
  return (
    <div className="space-y-12 sm:space-y-20">
      {/* HEADER */}
      <header className="max-w-3xl space-y-4">
        <span className={SECTION_LABEL}>
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
          <span className={SECTION_LABEL}>
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
          <DemoStep n="1" title={t.directDeal.step1.title}>
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
          <span className={SECTION_LABEL}>
            {t.trust.eyebrow}
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">
            {t.trust.title}
          </h2>
          <p className="text-[14px] text-[var(--color-ink-dim)] mt-2 leading-relaxed">
            {t.trust.body}
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-x-8">
          <div className="border-t border-[var(--color-line)] py-5">
            <p className="text-[14px] font-semibold">{t.trust.evidenceTitle}</p>
            <p className="text-[13px] text-[var(--color-ink-dim)] mt-2 leading-relaxed">
              {t.trust.evidence}
            </p>
          </div>
          <div className="border-t border-[var(--color-line)] py-5">
            <p className="text-[14px] font-semibold">{t.trust.identityTitle}</p>
            <p className="text-[13px] text-[var(--color-ink-dim)] mt-2 leading-relaxed">
              {t.trust.identity}
            </p>
          </div>
        </div>
        <p className="text-[12px] text-[var(--color-ink-faint)] leading-relaxed max-w-2xl">
          {t.trust.boundary}
        </p>
        <Link href="/docs" className="inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold underline">
          {t.header.eyebrow}<span aria-hidden className="rtl-flip">→</span>
        </Link>
      </section>

      {/* FAQ */}
      <section id="faq" className="space-y-6">
        <div className="max-w-2xl">
          <span className={SECTION_LABEL}>
            {t.faq.eyebrow}
          </span>
          <h2 className="text-[26px] tracking-tight font-semibold mt-2">{t.faq.title}</h2>
        </div>
        <div className="divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
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
            href={DEALS_AVAILABLE ? '/app' : WALLET_HOME}
            className="min-h-11 px-5 py-2.5 rounded-[10px] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] text-[14px] font-semibold hover:bg-[var(--lp-accent-hover)] transition-colors inline-flex items-center gap-2"
          >
            {messages.nav.openApp}
            <span aria-hidden className="rtl-flip">→</span>
          </Link>
        </div>
        <p className="text-[13px] text-[var(--color-ink-faint)] pt-2">
          {messages.networkUi.builtOnArc}
        </p>
      </section>
    </div>
  );
}

function DemoStep({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[var(--color-line)] py-5 space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="text-[26px] mono font-semibold leading-none text-[var(--color-ink-faint)]">{n}</span>
        <span className="text-[15px] font-medium">{title}</span>
      </div>
      <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">{children}</p>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group py-4">
      <summary className="min-h-11 cursor-pointer flex items-center justify-between gap-3 list-none">
        <span className="text-[14px] font-medium">{q}</span>
        <span className="text-[var(--color-ink-faint)] group-open:rotate-45 transition-transform">+</span>
      </summary>
      <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed mt-3">{children}</p>
    </details>
  );
}
