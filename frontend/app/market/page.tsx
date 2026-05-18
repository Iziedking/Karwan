import { ListingsBrowse } from '@/features/listings/components/ListingsBrowse';

export const dynamic = 'force-dynamic';

/// /market is the user-facing canonical URL for the marketplace surface.
/// The original /listings route stays alive (existing links + deep-paste
/// support) and renders the same component.
export default function MarketPage() {
  return <ListingsBrowse />;
}
