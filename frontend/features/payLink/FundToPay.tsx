'use client';
import { useCallback, useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill } from '@/features/deals/workspace/presentation';
import { Qr, Watching } from '@/features/deposit/components/DepositCard';
import { useDepositAddress, useFundsLanded } from '@/features/deposit/useDepositWatch';
import { CARD_CLASS } from '@/shared/components/Card';

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
  const { supported, address, chains: evm } = useDepositAddress(owner);
  useFundsLanded(owner, useCallback(() => onLanded(), [onLanded]));

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {}
  }

  return (
    <section className={`${CARD_CLASS} mt-8 p-5`}>
      <h2 className="text-[17px] font-semibold text-[var(--ink)]">{fill(copy.fundTitle, { amount: shortfall, name })}</h2>
      {supported === false ? (
        <p className="mt-2 text-[14px] text-[var(--ink-secondary)] font-medium">{deposit.unavailable}</p>
      ) : address ? (
        <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <Qr value={address} label={deposit.qrAlt} />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] text-[var(--ink-secondary)] font-medium">{deposit.addressLabel}</p>
            <p className="mt-1 break-all text-[14px] font-medium tabular-nums text-[var(--ink)] select-all">{address}</p>
            <button
              type="button"
              onClick={() => void copyAddress()}
              className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[var(--ash)] px-4 text-[14px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
            >
              {copied ? deposit.copied : deposit.copy}
            </button>
            <p className="mt-4 text-[14px] text-[var(--ink-secondary)] font-medium">{deposit.acceptsLabel}</p>
            <p className="mt-1 text-[14px] text-[var(--ink)]">{evm.map((chain) => chain.name).join(', ')}</p>
          </div>
        </div>
      ) : (
        <div aria-busy className="mt-5 h-[168px] rounded-[16px] bg-[var(--raised)] motion-safe:animate-pulse" />
      )}
      <div className="mt-5 border-t border-[var(--line)] pt-4">
        <Watching label={copy.fundWaiting} />
      </div>
    </section>
  );
}
