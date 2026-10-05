'use client';

import { useId, type ReactNode } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Single source of the visible Terms text used by `/terms` (public page) and
/// by the first-signin TermsModal. The backend has its own copy in
/// `docs/terms-and-conditions.md`; bumping the `TERMS_CURRENT_VERSION` env on
/// the backend AND editing the version here together is what triggers a
/// re-prompt across the product.
export const TERMS_LAST_UPDATED = '2026-08-08';

/// Bump this in lockstep with the backend's TERMS_CURRENT_VERSION when the
/// visible text changes materially. The modal records whatever the backend
/// says is current, so the source of truth for "is this user up to date" lives
/// on the backend; this constant is just for the human-visible footer.
export const TERMS_DISPLAY_VERSION = '2.2.0';

export function TermsContent({ heading, contents = false }: { heading?: ReactNode; contents?: boolean }) {
  const messages = useTranslations();
  const t = messages.termsPage;
  const id = useId();
  const sections = [t.s1, t.s2, t.s3, t.s4, t.s5, t.verification, t.s6, t.s7, t.s8, t.s9];
  return (
    <article className="space-y-9">
      {heading}
      <p className="text-[16px] leading-[1.8] text-[var(--lp-text-sub)]">
        {t.preamble}
      </p>

      {contents && <nav aria-label={messages.docsProduct.toc.title} className="border-y border-[var(--lp-border-light)] py-6">
        <h2 className="text-[14px] font-semibold text-[var(--lp-dark)]">{messages.docsProduct.toc.title}</h2>
        <ol className="mt-3 grid gap-x-8 sm:grid-cols-2">
          {sections.map((section, index) => <li key={index}><a href={`#${id}-terms-${index + 1}`} className="flex min-h-11 items-center py-2 text-[14px] leading-relaxed text-[var(--lp-text-sub)] underline decoration-[var(--lp-border-light)] underline-offset-4 hover:text-[var(--lp-dark)] focus-visible:outline-2 focus-visible:outline-[var(--lp-accent)] font-medium">{section.title}</a></li>)}
        </ol>
      </nav>}

      <Section id={`${id}-terms-1`} title={t.s1.title}>
        <p>{t.s1.lead}</p>
        <Bullets>
          <li>
            <strong>{t.s1.bullets.deals.label}</strong> {t.s1.bullets.deals.body}
          </li>
          <li>
            <strong>{t.s1.bullets.settlement.label}</strong> {t.s1.bullets.settlement.body}
          </li>
          <li>
            <strong>{t.s1.bullets.localCurrency.label}</strong> {t.s1.bullets.localCurrency.body}
          </li>
          <li>
            <strong>{t.s1.bullets.invite.label}</strong> {t.s1.bullets.invite.body}
          </li>
          <li>
            <strong>{t.s1.bullets.moving.label}</strong> {t.s1.bullets.moving.body}
          </li>
          <li>
            <strong>{t.s1.bullets.reputation.label}</strong> {t.s1.bullets.reputation.body}
          </li>
          <li>
            <strong>{t.s1.bullets.agents.label}</strong> {t.s1.bullets.agents.body}
          </li>
          <li>
            <strong>{t.s1.bullets.assistant.label}</strong> {t.s1.bullets.assistant.body}
          </li>
          <li>
            <strong>{t.s1.bullets.staking.label}</strong> {t.s1.bullets.staking.body}
          </li>
        </Bullets>
        <p>{t.s1.tail}</p>
      </Section>

      <Section id={`${id}-terms-2`} title={t.s2.title}>
        <p>{t.s2.lead}</p>
        <p>
          <strong>{t.s2.ownWallet.label}</strong> {t.s2.ownWallet.body}
        </p>
        <p>
          <strong>{t.s2.passkey.label}</strong> {t.s2.passkey.body}
        </p>
        <p>
          <strong>{t.s2.operated.label}</strong> {t.s2.operated.body}
        </p>
        <p>{t.s2.scope}</p>
        <p>{t.s2.contractLimit}</p>
        <p>{t.s2.why}</p>
        <p>{t.s2.research}</p>
      </Section>

      <Section id={`${id}-terms-3`} title={t.s3.title}>
        <p>{t.s3.lead}</p>
        <Bullets>
          <li>
            <strong>{t.s3.bullets.signin.label}</strong> {t.s3.bullets.signin.body}
          </li>
          <li>
            <strong>{t.s3.bullets.review.label}</strong> {t.s3.bullets.review.body}
          </li>
          <li>
            <strong>{t.s3.bullets.deadlines.label}</strong> {t.s3.bullets.deadlines.body}
          </li>
          <li>
            <strong>{t.s3.bullets.offPlatform.label}</strong> {t.s3.bullets.offPlatform.body}
          </li>
          <li>
            <strong>{t.s3.bullets.counterparty.label}</strong> {t.s3.bullets.counterparty.body}
          </li>
          <li>
            <strong>{t.s3.bullets.currency.label}</strong> {t.s3.bullets.currency.body}
          </li>
        </Bullets>
      </Section>

      <Section id={`${id}-terms-4`} title={t.s4.title}>
        <p>{t.s4.lead}</p>
        <Bullets>
          <li>
            <strong>{t.s4.bullets.release.label}</strong> {t.s4.bullets.release.body}
          </li>
          <li>
            <strong>{t.s4.bullets.autoRelease.label}</strong> {t.s4.bullets.autoRelease.body}
          </li>
          <li>
            <strong>{t.s4.bullets.deadline.label}</strong> {t.s4.bullets.deadline.body}
          </li>
          <li>
            <strong>{t.s4.bullets.cancel.label}</strong> {t.s4.bullets.cancel.body}
          </li>
          <li>
            <strong>{t.s4.bullets.disputes.label}</strong> {t.s4.bullets.disputes.body}
          </li>
        </Bullets>
        <p>{t.s4.tail}</p>
      </Section>

      <Section id={`${id}-terms-5`} title={t.s5.title}>
        <p>{t.s5.lead}</p>
        <Bullets>
          <li>{t.s5.bullets.success}</li>
          <li>{t.s5.bullets.disputes}</li>
          <li>{t.s5.bullets.malicious}</li>
          <li>{t.s5.bullets.deadline}</li>
          <li>{t.s5.bullets.staking}</li>
        </Bullets>
        <p>{t.s5.tail}</p>
        <p>{t.s5.agentWallet}</p>
      </Section>

      <Section id={`${id}-terms-6`} title={t.verification.title}>
        <p>{t.verification.lead}</p>
        <Bullets>
          <li>
            <strong>{t.verification.individual.label}</strong> {t.verification.individual.body}
          </li>
          <li>{t.verification.individualStatus}</li>
          <li>
            <strong>{t.verification.business.label}</strong> {t.verification.business.body}
          </li>
          <li>
            <strong>{t.verification.limits.label}</strong> {t.verification.limits.body}
          </li>
        </Bullets>
        <p>{t.verification.policy}</p>
      </Section>

      <Section id={`${id}-terms-7`} title={t.s6.title}>
        <p>{t.s6.lead}</p>
        <Bullets>
          <li>
            <strong>{t.s6.bullets.testnet.label}</strong> {t.s6.bullets.testnet.body}
          </li>
          <li>
            <strong>{t.s6.bullets.mainnetAccess.label}</strong> {t.s6.bullets.mainnetAccess.body}
          </li>
          <li>
            <strong>{t.s6.bullets.contract.label}</strong> {t.s6.bullets.contract.body}
          </li>
          <li>
            <strong>{t.s6.bullets.depeg.label}</strong> {t.s6.bullets.depeg.body}
          </li>
          <li>
            <strong>{t.s6.bullets.outage.label}</strong> {t.s6.bullets.outage.body}
          </li>
          <li>
            <strong>{t.s6.bullets.crossChain.label}</strong> {t.s6.bullets.crossChain.body}
          </li>
          <li>
            <strong>{t.s6.bullets.fiat.label}</strong> {t.s6.bullets.fiat.body}
          </li>
          <li>
            <strong>{t.s6.bullets.compliance.label}</strong> {t.s6.bullets.compliance.body}
          </li>
          <li>
            <strong>{t.s6.bullets.regulatory.label}</strong> {t.s6.bullets.regulatory.body}
          </li>
        </Bullets>
      </Section>

      <Section id={`${id}-terms-8`} title={t.s7.title}>
        <p>{t.s7.storeLead}</p>
        <Bullets>
          <li>{t.s7.store.addresses}</li>
          <li>{t.s7.store.email}</li>
          <li>{t.s7.store.chats}</li>
          <li>{t.s7.store.reputation}</li>
          <li>{t.s7.store.business}</li>
        </Bullets>
        <p>{t.s7.notStoreLead}</p>
        <Bullets>
          <li>{t.s7.notStore.keys}</li>
          <li>{t.s7.notStore.fiat}</li>
        </Bullets>
        <p>{t.s7.custody}</p>
        <p>{t.s7.tail}</p>
      </Section>

      <Section id={`${id}-terms-9`} title={t.s8.title}>
        <p>{t.s8.lead}</p>
        <Bullets>
          <li>{t.s8.bullets.age}</li>
          <li>{t.s8.bullets.lawful}</li>
          <li>{t.s8.bullets.address}</li>
        </Bullets>
        <p>{t.s8.changes}</p>
        <p>{t.s8.organisation}</p>
      </Section>

      <Section id={`${id}-terms-10`} title={t.s9.title}>
        <p>{t.s9.body}</p>
      </Section>

      <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] pt-6 border-t border-[var(--lp-border-light)] font-medium">
        {t.footer.version} {TERMS_DISPLAY_VERSION} . {t.footer.updated} {TERMS_LAST_UPDATED}
      </p>
    </article>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-28 space-y-4 border-t border-[var(--lp-border-light)] pt-8">
      <h2 id={`${id}-heading`} className="font-sans text-[21px] font-semibold leading-snug tracking-[-0.01em] text-[var(--lp-dark)]">
        {title}
      </h2>
      <div className="space-y-4 text-[16px] leading-[1.8] text-[var(--lp-text-sub)] [&_strong]:font-semibold [&_strong]:text-[var(--lp-dark)]">
        {children}
      </div>
    </section>
  );
}

function Bullets({ children }: { children: ReactNode }) {
  return <ul className="space-y-3 list-disc ps-6 marker:text-[var(--lp-text-muted)]">{children}</ul>;
}
