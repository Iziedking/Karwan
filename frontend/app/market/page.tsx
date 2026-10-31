import { MarketPage } from '@/features/market/components/MarketPage';
import { parseMarketQuery } from '@/features/market/marketQuery';

export const dynamic = 'force-dynamic';

/// /market is the one market for every account (views 17 and 44). The view,
/// side, category and search come from the address, so shared links open in place.
export default async function Market({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) if (typeof value === 'string') params.set(key, value);
  const query = parseMarketQuery(params);
  return <MarketPage {...query} />;
}
