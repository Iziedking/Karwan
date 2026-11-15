'use client';
import { usePathname } from 'next/navigation';
import { GuaranteeTab } from '@/features/guarantee/GuaranteeTab';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { ProductBackLink } from '@/shared/components/ProductBackLink';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// The savings pocket (view 82): money kept aside, which earns, and which a
/// buyer can ask the seller to back a deal with. Opened from Profile.
export default function PocketPage() {
  const g = useTranslations().dealGuarantee;
  const pathname = usePathname();
  return (
    <AuthGuard gateTag={g.signedOut.tag} gateBody={g.signedOut.body}>
      <div className="product-surface mx-auto max-w-[640px] px-4 pb-24 pt-6 sm:px-6">
        <div data-own-back className="empty:hidden">
          <ProductBackLink pathname={pathname} isAuthenticated />
        </div>
        <div className="py-8">
          <GuaranteeTab />
        </div>
      </div>
    </AuthGuard>
  );
}
