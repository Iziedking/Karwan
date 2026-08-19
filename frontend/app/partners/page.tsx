import { PartnersBrowse } from '@/features/partners/components/PartnersBrowse';

export const dynamic = 'force-dynamic';

/// Public discovery route. Browsing a business profile does not require an
/// account; starting a gated business transaction still does.
export default function PartnersPage() {
  return <PartnersBrowse />;
}
