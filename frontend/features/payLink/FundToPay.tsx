'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';
import { fill } from '@/features/deals/workspace/presentation';
import { Qr, Watching } from '@/features/deposit/components/DepositCard';

/// Shown when an email or passkey account is short of the request. The payer
/// sends the missing USDC from an exchange or any wallet to their own account;
/// when it lands the balance moves, the Pay button lights, and one tap pays.
/// Money goes through their account, not straight to the requester, because
/// only a send Karwan makes has a transaction it can check and mark Paid.
export function FundToPay({ owner, shortfall, name, onLanded }: {
  owner: string;
  shortfall: string;
  name: string;
  onLanded: () => void;
}) {
  const copy = useTranslations().payLink.pay;
  const deposit = useTranslations().deposit;
  const [copied, setCopied] = useState(false);
  const { data } = useQuery({
    queryKey: ['deposit', 'address', owner],
    queryFn: () => api.depositAddress(owner),
    staleTime: Infinity,
  });
  const evm = data?.chains ?? [];
  const address = evm[0]?.address ?? null;

  useEffect(() => {
    const me = owner.toLowerCase();
    return subscribeLiveEvents((event) => {
      const p = (event.payload ?? {}) as { owner?: string; mintRecipient?: string };
      if (event.type === 'wallet.credited' && p.owner?.toLowerCase() === me) onLanded();
      if (event.type === 'bridge.minted' && p.mintRecipient?.toLowerCase() === me) onLanded();
    });
  }, [owner, onLanded]);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {}
  }

  return (
    <section className="mt-8 rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
      <h2 className="text-[17px] font-semibold text-[var(--lp-dark)]">{fill(copy.fundTitle, { amount: shortfall, name })}</h2>
      {data && !data.supported ? (
        <p className="mt-2 text-[14px] text-[var(--lp-text-sub)]">{deposit.unavailable}</p>
      ) : address ? (
        <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <Qr value={address} label={deposit.qrAlt} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-[var(--lp-text-sub)]">{deposit.addressLabel}</p>
            <p className="mt-1 break-all text-[14px] font-medium tabular-nums text-[var(--lp-dark)] select-all">{address}</p>
            <button
              type="button"
              onClick={() => void copyAddress()}
              className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[var(--tint)] px-4 text-[14px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
            >
              {copied ? deposit.copied : deposit.copy}
            </button>
            <p className="mt-4 text-[13px] text-[var(--lp-text-sub)]">{deposit.acceptsLabel}</p>
            <p className="mt-1 text-[14px] text-[var(--lp-dark)]">{evm.map((chain) => chain.name).join(', ')}</p>
          </div>
        </div>
      ) : (
        <div aria-busy className="mt-5 h-[168px] rounded-[16px] bg-[var(--lp-light)] motion-safe:animate-pulse" />
      )}
      <div className="mt-5 border-t border-[var(--lp-border-light)] pt-4">
        <Watching label={copy.fundWaiting} />
      </div>
    </section>
  );
}
