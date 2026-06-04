'use client';

import {
  DocsEyebrow,
  DocsH2,
  DocsH3,
  DocsP,
  DocsList,
  DocsListItem,
  DocsFigure,
  DocsCallout,
} from '@/features/docs/components/Prose';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export default function DocsBridgePage() {
  const t = useTranslations().docsBridgePage;
  return (
    <article>
      <DocsEyebrow>{t.eyebrow}</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        {t.title}
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>{t.intro}</DocsP>

      <DocsH2>{t.supportedChains.heading}</DocsH2>
      <DocsP>{t.supportedChains.body}</DocsP>
      <DocsList>
        <DocsListItem>Base Sepolia</DocsListItem>
        <DocsListItem>Ethereum Sepolia</DocsListItem>
        <DocsListItem>Arbitrum Sepolia</DocsListItem>
        <DocsListItem>Optimism Sepolia</DocsListItem>
        <DocsListItem>Polygon Amoy</DocsListItem>
        <DocsListItem>Solana Devnet</DocsListItem>
      </DocsList>

      <DocsH2>{t.bringingIn.heading}</DocsH2>
      <DocsList>
        <DocsListItem>
          <strong>{t.bringingIn.steps.pickSource.label}</strong>{' '}
          {t.bringingIn.steps.pickSource.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.bringingIn.steps.approveBurn.label}</strong>{' '}
          {t.bringingIn.steps.approveBurn.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.bringingIn.steps.attestation.label}</strong>{' '}
          {t.bringingIn.steps.attestation.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.bringingIn.steps.mintArc.label}</strong>{' '}
          {t.bringingIn.steps.mintArc.body}
        </DocsListItem>
      </DocsList>

      <DocsFigure
        src="/docs/images/bridge-steps.png"
        alt={t.figure.alt}
        caption={t.figure.caption}
      />

      <DocsCallout tone="warn" title={t.callout.title}>
        {t.callout.body}
      </DocsCallout>

      <DocsH2>{t.cashout.heading}</DocsH2>
      <DocsP>{t.cashout.body}</DocsP>
      <DocsList>
        <DocsListItem>
          <strong>{t.cashout.options.arcToArc.label}</strong>{' '}
          {t.cashout.options.arcToArc.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.cashout.options.crossChain.label}</strong>{' '}
          {t.cashout.options.crossChain.body}
        </DocsListItem>
      </DocsList>

      <DocsH2>{t.emailPasskey.heading}</DocsH2>
      <DocsP>{t.emailPasskey.body}</DocsP>

      <DocsH3>{t.whyThisRail.heading}</DocsH3>
      <DocsP>{t.whyThisRail.body}</DocsP>
    </article>
  );
}
