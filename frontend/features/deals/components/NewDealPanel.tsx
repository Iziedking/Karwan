'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BriefComposer } from '@/features/buyer/components/BriefComposer';
import { ActivationGate } from '@/shared/components/ActivationGate';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { DirectDealComposer } from './DirectDealComposer';

/// One form per path. The trade page already asked which path the buyer wants
/// (find a seller, or bring one), so this page shows that form alone, with a
/// quiet link to the other. A listing's "Make offer" link carries the seller and
/// opens the direct form.
export function NewDealPanel() {
  const t = useTranslations().dealPanel;
  const search = useSearchParams();
  const direct = !!(search.get('seller') || search.get('sellerEmail') || search.get('mode') === 'direct');

  return (
    <div className="space-y-6" id="deal-composer">
      <div>
        <h2 className="text-[20px] font-semibold text-[var(--lp-dark)]">{direct ? t.directLabel : t.managedLabel}</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">{direct ? t.directBlurb : t.managedBlurb}</p>
      </div>
      <ActivationGate>{direct ? <DirectDealComposer /> : <BriefComposer />}</ActivationGate>
      <Link
        href={direct ? '/buyer?mode=managed#new-deal' : '/buyer?mode=direct#new-deal'}
        scroll={false}
        className="inline-flex min-h-11 items-center text-[14px] text-[var(--lp-text-sub)] underline-offset-4 hover:text-[var(--lp-dark)] hover:underline font-medium"
      >
        {direct ? t.switchToManaged : t.switchToDirect}
      </Link>
    </div>
  );
}
