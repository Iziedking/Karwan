import { OrderPage } from '@/features/order/OrderPage';

export default async function OrderRoute({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  return <OrderPage listingId={listingId} />;
}
