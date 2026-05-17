import { ListingDetail } from '@/features/listings/components/ListingDetail';

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ListingDetail listingId={id} />;
}
