'use client';

import {
  DocsEyebrow,
  DocsH2,
  DocsP,
  DocsList,
  DocsListItem,
  DocsCallout,
} from '@/features/docs/components/Prose';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Public docs surface for Karwan's paid x402 data endpoints. Read-only;
/// the live catalogue is GET /api/x402. Endpoint paths, prices and code
/// samples stay literal; the surrounding prose localises.

const ENDPOINTS = [
  { key: 'intro', path: '/api/x402', priceUsd: 0 },
  { key: 'creditPassport', path: '/api/x402/credit-passport/:address', priceUsd: 0.01 },
  { key: 'repaymentBehavior', path: '/api/x402/repayment-behavior/:address', priceUsd: 0.005 },
  { key: 'concentration', path: '/api/x402/concentration/:address', priceUsd: 0.005 },
  { key: 'documentAnchors', path: '/api/x402/document-anchors/:invoiceId', priceUsd: 0.005 },
] as const;

const EXAMPLE_SNIPPET = `import { GatewayClient } from '@circle-fin/x402-batching/client';

const gateway = new GatewayClient({ chain: 'arcTestnet', privateKey });
await gateway.deposit('5'); // one-time Gateway deposit on Arc

const { data, transaction } = await gateway.pay(
  'https://api.karwan.site/api/x402/credit-passport/0xSELLER',
);
// data.score, data.tier, data.concentrationRatio ...
// transaction = on-chain settlement hash`;

function CodeBlock({ children }: { children: string }) {
  return (
    <pre
      className="mt-5 max-w-[720px] overflow-x-auto bg-[var(--lp-card)] border border-[var(--lp-border-light)] p-5 mono text-[12px] leading-relaxed text-[var(--lp-dark)]"
      style={{
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 4,
      }}
    >
      <code>{children}</code>
    </pre>
  );
}

export default function X402Page() {
  const t = useTranslations().x402Page;
  return (
    <div className="bg-[var(--lp-light)] text-[var(--lp-dark)] -mt-10">
      <div className="mx-auto max-w-[1440px] px-[clamp(20px,5vw,72px)] py-[clamp(36px,5vw,64px)]">
        <main className="min-w-0 max-w-[860px]">
          <article>
            <DocsEyebrow>{t.eyebrow}</DocsEyebrow>
            <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
              {t.title}
              <span style={{ color: 'var(--lp-accent)' }}>.</span>
            </h1>
            <DocsP>{t.intro}</DocsP>

            <DocsH2>{t.endpoints.heading}</DocsH2>
            <DocsP>{t.endpoints.body}</DocsP>
            <DocsList>
              {ENDPOINTS.map((ep) => (
                <DocsListItem key={ep.key}>
                  <strong>{t.endpoints.items[ep.key].name}</strong>
                  <span className="mono text-[12px] text-[var(--lp-text-muted)]">
                    {' '}
                    {ep.path} ·{' '}
                    {ep.priceUsd === 0 ? t.endpoints.freeLabel : `$${ep.priceUsd}`}
                  </span>
                  <br />
                  {t.endpoints.items[ep.key].returns}
                </DocsListItem>
              ))}
            </DocsList>
            <DocsP>{t.endpoints.privacy}</DocsP>

            <DocsH2>{t.howToPay.heading}</DocsH2>
            <DocsP>{t.howToPay.body}</DocsP>
            <DocsList>
              <DocsListItem>
                <strong>{t.howToPay.steps.deposit.label}</strong>{' '}
                {t.howToPay.steps.deposit.body}
              </DocsListItem>
              <DocsListItem>
                <strong>{t.howToPay.steps.call.label}</strong>{' '}
                {t.howToPay.steps.call.body}
              </DocsListItem>
              <DocsListItem>
                <strong>{t.howToPay.steps.retry.label}</strong>{' '}
                {t.howToPay.steps.retry.body}
              </DocsListItem>
            </DocsList>

            <DocsCallout tone="info" title={t.sameChain.title}>
              {t.sameChain.body}
            </DocsCallout>

            <DocsH2>{t.example.heading}</DocsH2>
            <DocsP>{t.example.body}</DocsP>
            <CodeBlock>{EXAMPLE_SNIPPET}</CodeBlock>
          </article>
        </main>
      </div>
    </div>
  );
}
