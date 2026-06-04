'use client';

import type { ReactNode } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Single source of the visible Terms text used by `/terms` (public page) and
/// by the first-signin TermsModal. The backend has its own copy in
/// `docs/terms-and-conditions.md`; bumping the `TERMS_CURRENT_VERSION` env on
/// the backend AND editing the version here together is what triggers a
/// re-prompt across the product.
export const TERMS_LAST_UPDATED = '2026-05-29';

/// Bump this in lockstep with the backend's TERMS_CURRENT_VERSION when the
/// visible text changes materially. The modal records whatever the backend
/// says is current, so the source of truth for "is this user up to date" lives
/// on the backend; this constant is just for the human-visible footer.
export const TERMS_DISPLAY_VERSION = 1;

export function TermsContent({ heading }: { heading?: ReactNode }) {
  const t = useTranslations().termsPage;
  return (
    <div className="space-y-7">
      {heading}
      <p className="text-[13.5px] leading-relaxed text-[var(--lp-text-sub)]">
        {t.preamble}
      </p>

      <Section title={t.s1.title}>
        <p>{t.s1.lead}</p>
        <Bullets>
          <li>
            <strong>{t.s1.bullets.escrow.label}</strong> {t.s1.bullets.escrow.body}
          </li>
          <li>
            <strong>{t.s1.bullets.settlement.label}</strong> {t.s1.bullets.settlement.body}
          </li>
          <li>
            <strong>{t.s1.bullets.reputation.label}</strong> {t.s1.bullets.reputation.body}
          </li>
          <li>
            <strong>{t.s1.bullets.agent.label}</strong> {t.s1.bullets.agent.body}
          </li>
          <li>
            <strong>{t.s1.bullets.bridging.label}</strong> {t.s1.bullets.bridging.body}
          </li>
        </Bullets>
        <p>{t.s1.tail}</p>
      </Section>

      <Section title={t.s2.title}>
        <p>{t.s2.lead}</p>
        <Bullets>
          <li>
            <strong>{t.s2.bullets.keys.label}</strong> {t.s2.bullets.keys.body}
          </li>
          <li>
            <strong>{t.s2.bullets.review.label}</strong> {t.s2.bullets.review.body}
          </li>
          <li>
            <strong>{t.s2.bullets.deadlines.label}</strong> {t.s2.bullets.deadlines.body}
          </li>
          <li>
            <strong>{t.s2.bullets.offPlatform.label}</strong> {t.s2.bullets.offPlatform.body}
          </li>
          <li>
            <strong>{t.s2.bullets.disputes.label}</strong> {t.s2.bullets.disputes.body}
          </li>
        </Bullets>
      </Section>

      <Section title={t.s3.title}>
        <p>{t.s3.lead}</p>
        <Bullets>
          <li>{t.s3.bullets.success}</li>
          <li>{t.s3.bullets.disputes}</li>
          <li>{t.s3.bullets.malicious}</li>
          <li>{t.s3.bullets.staking}</li>
        </Bullets>
        <p>{t.s3.tail}</p>
      </Section>

      <Section title={t.s4.title}>
        <p>{t.s4.lead}</p>
        <Bullets>
          <li>
            <strong>{t.s4.bullets.depeg.label}</strong> {t.s4.bullets.depeg.body}
          </li>
          <li>
            <strong>{t.s4.bullets.contract.label}</strong> {t.s4.bullets.contract.body}
          </li>
          <li>
            <strong>{t.s4.bullets.outage.label}</strong> {t.s4.bullets.outage.body}
          </li>
          <li>
            <strong>{t.s4.bullets.fiat.label}</strong> {t.s4.bullets.fiat.body}
          </li>
          <li>
            <strong>{t.s4.bullets.regulatory.label}</strong> {t.s4.bullets.regulatory.body}
          </li>
          <li>
            <strong>{t.s4.bullets.testnet.label}</strong> {t.s4.bullets.testnet.body}
          </li>
        </Bullets>
      </Section>

      <Section title={t.s5.title}>
        <p>{t.s5.storeLead}</p>
        <Bullets>
          <li>{t.s5.store.addresses}</li>
          <li>{t.s5.store.email}</li>
          <li>{t.s5.store.chats}</li>
          <li>{t.s5.store.reputation}</li>
        </Bullets>
        <p>{t.s5.notStoreLead}</p>
        <Bullets>
          <li>{t.s5.notStore.keys}</li>
          <li>{t.s5.notStore.fiat}</li>
        </Bullets>
        <p>{t.s5.tail}</p>
      </Section>

      <Section title={t.s6.title}>
        <p>{t.s6.lead}</p>
        <Bullets>
          <li>{t.s6.bullets.age}</li>
          <li>{t.s6.bullets.lawful}</li>
          <li>{t.s6.bullets.address}</li>
        </Bullets>
        <p>{t.s6.changes}</p>
        <p>{t.s6.organisation}</p>
      </Section>

      <Section title={t.s7.title}>
        <p>{t.s7.body}</p>
      </Section>

      <p className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] pt-4 border-t border-[var(--lp-border-light)]">
        {t.footer.version} {TERMS_DISPLAY_VERSION} . {t.footer.updated} {TERMS_LAST_UPDATED}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-sans text-[18px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
        {title}
      </h2>
      <div className="space-y-3 text-[13.5px] leading-relaxed text-[var(--lp-text-sub)]">
        {children}
      </div>
    </section>
  );
}

function Bullets({ children }: { children: ReactNode }) {
  return <ul className="space-y-2 list-disc ps-5 marker:text-[var(--lp-text-muted)]">{children}</ul>;
}
