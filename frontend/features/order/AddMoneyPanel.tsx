'use client';
import { useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Icon } from '@/shared/components/Icon';
import { fill } from '@/features/deals/workspace/presentation';
import { Watching } from '@/features/deposit/components/DepositCard';
import { FundAgentFromWallet } from '@/features/deposit/components/FundAgentFromWallet';
import { useDepositAddress } from '@/features/deposit/useDepositWatch';

/// Add money for an order (Figma 06 and 07). The amount is what the order
/// still needs. An email or passkey account sends it to its own Karwan address
/// on the displayed network; a wallet account moves it from that wallet. Bank and card
/// stay hidden until they work.
export function AddMoneyPanel({ owner, circle, buyerAgent, amount, amountLabel, onFunded }: {
  owner: string;
  circle: boolean;
  buyerAgent: string | null;
  amount: number;
  amountLabel: string;
  onFunded: () => void;
}) {
  const copy = useTranslations();
  const t = copy.orderFlow;
  const [step, setStep] = useState<'how' | 'send'>('how');
  const { supported, chains } = useDepositAddress(circle ? owner : null);
  const deposit = supported ? chains[0] : null;
  const address = deposit?.address ?? null;
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {}
  }

  if (!circle) {
    return (
      <section data-add-money className="rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
        <h2 className="text-[17px] font-semibold text-[var(--lp-dark)]">{fill(t.fromYourWallet, { amount: amountLabel })}</h2>
        <div className="mt-4">
          {buyerAgent ? <FundAgentFromWallet agent="buyer" recipient={buyerAgent} amountUsdc={amount} onFunded={onFunded} /> : null}
        </div>
      </section>
    );
  }

  if (step === 'how') {
    return (
      <section data-add-money className="rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
        <h2 className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.addTitle}</h2>
        <p className="mt-4 text-[14px] font-medium text-[var(--lp-text-sub)]">{t.amount}</p>
        <p className="mt-1 text-[28px] font-semibold tabular-nums tracking-[-0.02em] text-[var(--lp-dark)]">{amountLabel} USDC</p>
        <p className="mt-1 text-[14px] text-[var(--lp-text-sub)]">{t.exactly}</p>
        <p className="mt-5 text-[14px] font-medium text-[var(--lp-text-sub)]">{t.how}</p>
        <button
          type="button"
          onClick={() => setStep('send')}
          className="mt-2 flex w-full items-center gap-3 rounded-[16px] border border-[var(--lp-border-light)] p-4 text-start transition-colors hover:bg-[var(--tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
        >
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--tint)] text-[var(--ink)]">
            <Icon name="wallet" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{t.fromWallet}</span>
            <span className="block text-[13px] text-[var(--lp-text-sub)]">{t.fromWalletNote}</span>
          </span>
          <Icon name="chevron-right" size={16} directional className="shrink-0 text-[var(--lp-text-sub)]" />
        </button>
      </section>
    );
  }

  return (
    <section data-add-money className="rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
      <h2 className="text-[17px] font-semibold text-[var(--lp-dark)]">{fill(t.sendTitle, { amount: amountLabel })}</h2>
      {supported === false || (supported === true && !deposit) ? (
        <p role="status" className="mt-4 text-[14px] text-[var(--lp-text-sub)]">{copy.deposit.unavailable}</p>
      ) : (
        <>
          <p className="mt-4 text-[14px] font-medium text-[var(--lp-text-sub)]">{t.yourAddress}</p>
          {address ? (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 break-all text-[15px] font-medium tabular-nums text-[var(--lp-dark)] select-all" dir="ltr">{address}</p>
              <button
                type="button"
                onClick={() => void copyAddress()}
                className="inline-flex min-h-11 items-center rounded-full bg-[var(--tint)] px-4 text-[14px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
              >
                {copied ? t.copied : t.copy}
              </button>
            </div>
          ) : (
            <div aria-busy className="mt-2 h-11 rounded-[12px] bg-[var(--lp-light)] motion-safe:animate-pulse" />
          )}
          <ol className="mt-5 space-y-2 text-[14px] text-[var(--lp-dark)]">
            <li className="flex gap-3"><span aria-hidden className="tabular-nums text-[var(--lp-text-sub)]">1</span>{t.stepWithdraw}</li>
            <li className="flex gap-3"><span aria-hidden className="tabular-nums text-[var(--lp-text-sub)]">2</span>{t.stepPaste}</li>
          </ol>
          <p className="mt-4 text-[14px] text-[var(--lp-text-sub)]">{deposit ? fill(t.anyNetwork, { network: deposit.name }) : null}</p>
        </>
      )}
      {deposit ? <div className="mt-5 border-t border-[var(--lp-border-light)] pt-4">
        <Watching label={fill(t.waiting, { amount: amountLabel })} />
        <p className="mt-1 ps-[16px] text-[13px] text-[var(--lp-text-sub)]">{t.updates}</p>
      </div> : null}
    </section>
  );
}
