import { notFound } from 'next/navigation';
import { PoLinePage } from '@/features/financier/components/PoLinePage';
import { GATED_ROUTE_FLAGS, gatedRouteOpen } from '@/shared/utils/gatedRoutes';

export default function Page() {
  if (!gatedRouteOpen('/financier/po', GATED_ROUTE_FLAGS)) notFound();
  return <PoLinePage />;
}
