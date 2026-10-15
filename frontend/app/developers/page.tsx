'use client';

import { DocsEyebrow, DocsH2, DocsP, DocsList, DocsListItem } from '@/features/docs/components/Prose';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill } from '@/features/deals/workspace/presentation';
import { ISSUER_KEY_PATH, READ_PATH, RECORD_READ_EXAMPLE, RECORD_READ_PRICE_USDC, SCORING } from '@/features/developers/content';

const CONTACT = 'bd@karwan.site';
const HOW = ['connect', 'consent', 'ask', 'pay', 'score'] as const;
const FIELDS = ['subject', 'level', 'score', 'counts', 'outcomes', 'expiry'] as const;
const RULES = ['consent', 'binding', 'machine', 'retention', 'receipts', 'erase'] as const;

/// What Karwan sends a platform when it is ready to talk: how a paid record
/// read works, the format, signing, payment, the data rules and the scoring
/// model with its real numbers. No platform is named.
export default function DevelopersPage() {
  const t = useTranslations().developers;
  const w = SCORING.verificationWeight;
  const scoring = [
    fill(t.scoring.recency, { days: SCORING.halfLifeDays }),
    fill(t.scoring.value, { usd: SCORING.referenceValueUsd }),
    fill(t.scoring.cap, { cap: SCORING.perCounterpartyCap }),
    fill(t.scoring.wilson, { z: SCORING.z }),
    fill(t.scoring.weights, {
      partner: w.partner,
      api: w.official_api,
      registry: w.official_record,
      reviewed: w.human_reviewed,
      proof: w.user_proof,
      claim: w.self_reported,
    }),
    fill(t.scoring.prior, { mean: SCORING.priorMean, weight: SCORING.priorWeight }),
    fill(t.scoring.share, { share: Math.round(SCORING.maxImportedShare * 100), deals: SCORING.importedFadeDeals }),
  ];
  const [before, after] = t.contactBody.split('{email}');

  return (
    <div className="bg-[var(--lp-light)] text-[var(--lp-dark)] -mt-10">
      <div className="mx-auto max-w-[1440px] px-[clamp(20px,5vw,72px)] py-[clamp(36px,5vw,64px)]">
        <main className="min-w-0 max-w-[860px]">
          <article>
            <DocsEyebrow>{t.eyebrow}</DocsEyebrow>
            <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold tracking-[-0.025em] leading-[1.02] text-[var(--lp-dark)]">
              {t.title}
            </h1>
            <DocsP>{t.intro}</DocsP>

            <DocsH2>{t.howHeading}</DocsH2>
            <ol className="mt-4 max-w-[720px] list-decimal space-y-2 ps-6 text-[16px] leading-relaxed text-[var(--lp-dark)]">
              {HOW.map((k) => (
                <li key={k}>{t.how[k]}</li>
              ))}
            </ol>

            <DocsH2>{t.formatHeading}</DocsH2>
            <DocsP>{t.formatBody}</DocsP>
            <p className="mt-3 mono text-[14px] text-[var(--lp-dark)]" dir="ltr">{READ_PATH}</p>
            <DocsList>
              {FIELDS.map((k) => (
                <DocsListItem key={k}>{t.fields[k]}</DocsListItem>
              ))}
            </DocsList>
            <pre
              tabIndex={0}
              aria-label={t.exampleLabel}
              dir="ltr"
              className="mt-5 max-w-[720px] overflow-x-auto rounded-[12px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 mono text-[14px] leading-relaxed text-[var(--lp-dark)]"
            >
              <code>{JSON.stringify(RECORD_READ_EXAMPLE, null, 2)}</code>
            </pre>

            <DocsH2>{t.signingHeading}</DocsH2>
            <DocsP>{fill(t.signingBody, { path: ISSUER_KEY_PATH })}</DocsP>

            <DocsH2>{t.payHeading}</DocsH2>
            <DocsP>{fill(t.payBody, { price: RECORD_READ_PRICE_USDC })}</DocsP>

            <DocsH2>{t.rulesHeading}</DocsH2>
            <DocsList>
              {RULES.map((k) => (
                <DocsListItem key={k}>{t.rules[k]}</DocsListItem>
              ))}
            </DocsList>

            <DocsH2>{t.scoringHeading}</DocsH2>
            <DocsP>{t.scoringBody}</DocsP>
            <DocsList>
              {scoring.map((line) => (
                <DocsListItem key={line}>{line}</DocsListItem>
              ))}
            </DocsList>

            <DocsH2>{t.statusHeading}</DocsH2>
            <dl className="mt-4 max-w-[720px] border-t border-[var(--lp-border-light)]">
              {[
                [t.status.karwan, t.status.karwanState],
                [t.status.platforms, t.status.platformsState],
              ].map(([label, state]) => (
                <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-[var(--lp-border-light)] py-3">
                  <dt className="text-[15px] font-semibold text-[var(--lp-dark)]">{label}</dt>
                  <dd className="text-[15px] text-[var(--lp-dark)]">{state}</dd>
                </div>
              ))}
            </dl>

            <DocsH2>{t.contactHeading}</DocsH2>
            <DocsP>
              {before}
              <a href={`mailto:${CONTACT}`} className="font-semibold underline underline-offset-4">
                {CONTACT}
              </a>
              {after}
            </DocsP>
          </article>
        </main>
      </div>
    </div>
  );
}
