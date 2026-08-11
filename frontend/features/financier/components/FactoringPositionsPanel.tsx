'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type FactoringOffer } from '@/core/api';
export function FactoringPositionsPanel() {
  const [offers, setOffers] = useState<FactoringOffer[]>([]);
  useEffect(() => {
    const load = () => api.listMyFactoringOffers()
      .then(r => setOffers(r.asFinancier.filter(o => ['accepted','settled','defaulted'].includes(o.status))))
      .catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);
  if (!offers.length) return null;
  return <PositionList offers={offers} />;
}

function statusLabel(status: FactoringOffer['status']): string {
  return status === 'defaulted' ? 'Defaulted' : status === 'accepted' ? 'Accepted' : status === 'settled' ? 'Settled' : status;
}
function PositionList({ offers }: { offers: FactoringOffer[] }) {
  return <section>{offers.map(o => <Link key={o.id} href={'/financier/factoring/' + o.id}>{statusLabel(o.status)}</Link>)}</section>;
}
