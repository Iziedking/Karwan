'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// A vault migration moves every staker's position off the contract /stake
/// reads, so their balance reads as zero with nothing to explain it. This
/// points them at /legacy, and only when they actually hold something there.
/// Silent for everyone else, and silent once they have withdrawn.
export function LegacyStakeNudge() {
  const auth = useAuth();
  const t = useTranslations();
  const copy = t.stakePage.legacyNudge;
  const [amount, setAmount] = useState<string | null>(null);

  useEffect(() => {
    const address = auth.address;
    if (!address) return;
    let live = true;
    api
      .legacyVaultPositions(address)
      .then((r) => {
        if (!live) return;
        const total = Number(r.totalActiveUsdc) + Number(r.totalCoolingUsdc);
        setAmount(total > 0 ? total.toLocaleString() : null);
      })
      .catch(() => {
        // A legacy read failing is not worth surfacing on the stake page. The
        // /legacy route reports its own errors.
      });
    return () => {
      live = false;
    };
  }, [auth.address]);

  if (!amount) return null;

  return (
    <p className="mt-4 text-sm text-zinc-600">
      {copy.body.replace('{amount}', amount)}{' '}
      <Link href="/legacy" className="underline underline-offset-2 hover:text-zinc-900">
        {copy.link}
      </Link>
    </p>
  );
}
