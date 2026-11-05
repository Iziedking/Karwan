'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type DepositRequestPublic } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { fill } from '@/features/deals/workspace/presentation';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { Qr, Watching } from '@/features/deposit/components/DepositCard';
import { moneySounds } from '@/shared/sound/moneySounds';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { chainPayState } from './chainPayState';

const PRIMARY = buttonClasses({ size: 'lg', className: 'w-full' });

/// Pay a request from an exchange or any wallet: the request's own address,
/// the exact amount, and the money followed live until it reaches the
/// requester on Arc.
export function AnyChainPay({ token, request, name, onDelivered }: {
  token: string;
  request: DepositRequestPublic;
  name: string;
  onDelivered: (request: DepositRequestPublic) => void;
}) {
  const copy = useTranslations().payLink.pay;
  const deposit = useTranslations().deposit;
  const money = useMoneyText();
  const client = useQueryClient();
  const [failed, setFailed] = useState(false);
  const [family, setFamily] = useState<'evm' | 'solana'>('evm');
  const [copied, setCopied] = useState(false);

  // Follow the request while this panel is open; the page shares the cache.
  const live = useQuery({
    queryKey: ['deposit-request', token],
    queryFn: () => api.getDepositRequest(token),
    refetchInterval: 5_000,
    initialData: { request },
  });
  const current = live.data?.request ?? request;
  const receiving = current.receiving;

  useEffect(() => {
    if (receiving) return;
    let stop = false;
    api
      .receiveRequest(token)
      .then((out) => !stop && client.setQueryData(['deposit-request', token], out))
      .catch(() => !stop && setFailed(true));
    return () => {
      stop = true;
    };
  }, [receiving, token, client]);

  const state = chainPayState(current);
  const paymentCount = current.payments?.length ?? 0;
  useEffect(() => {
    if (paymentCount > 0) moneySounds.claim({ ids: [`${token}:${paymentCount}`] });
  }, [paymentCount, token]);
  // The arrival is heard at once; the receipt opens when the payer presses Done.
  const delivered = useRef(false);
  useEffect(() => {
    if (state.phase !== 'delivered' || delivered.current) return;
    delivered.current = true;
    moneySounds.outcome('success', { ids: [`${token}:delivered`] });
  }, [state.phase, token]);

  if (failed) return <p role="status" className="mt-6 text-[14px] font-medium text-[var(--ink-secondary)]">{copy.chainError}</p>;

  if (state.phase === 'moving' || state.phase === 'delayed' || state.phase === 'delivered') {
    return (
      <div className="mt-6 space-y-5">
        <ol className={`${CARD_CLASS} space-y-4 px-5 py-4`}>
          <Step done label={fill(copy.stepReceived, { chain: state.chain })} />
          <Step
            done={state.phase === 'delivered'}
            active={state.phase === 'moving'}
            label={copy.stepMoving}
            sub={state.phase === 'delayed' ? fill(copy.stepDelayed, { chain: state.chain }) : copy.stepMovingSub}
          />
          <Step done={state.phase === 'delivered'} label={fill(copy.stepPaid, { name })} />
        </ol>
        {state.phase === 'delivered' ? (
          <button type="button" onClick={() => onDelivered(current)} className={PRIMARY}>{copy.done}</button>
        ) : (
          <p className="text-[14px] font-medium text-[var(--ink-secondary)]">{fill(copy.canClose, { name })}</p>
        )}
      </div>
    );
  }

  const address = family === 'evm' ? receiving?.evm.address : receiving?.solana?.address;
  const chains = family === 'evm' ? receiving?.evm.chains.join(', ') : 'Solana';

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {}
  }

  return (
    <section className="mt-6">
      {state.phase === 'part' ? (
        <p role="status" className="mb-4 text-[15px] font-medium text-[var(--ink)]">
          {money.fill(copy.partReceived, { total: state.total, left: state.sendUsdc }, { got: state.got }, { compact: true })}
        </p>
      ) : null}
      {receiving?.solana ? (
        <div role="radiogroup" aria-label={copy.payWith} className="flex gap-2">
          {(['evm', 'solana'] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={family === key}
              onClick={() => setFamily(key)}
              className={cn(
                'min-h-11 flex-1 rounded-full border text-[14px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]',
                family === key
                  ? 'border-[var(--ink)] text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--ink)]'
                  : 'border-[var(--line)] text-[var(--ink-secondary)]',
              )}
            >
              {key === 'evm' ? copy.evmTab : copy.solanaTab}
            </button>
          ))}
        </div>
      ) : null}
      {address ? (
        <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <Qr value={address} label={deposit.qrAlt} />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-[var(--ink-secondary)]">{copy.sendExactly}</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums text-[var(--ink)]">{"sendUsdc" in state ? state.sendUsdc : ""} USDC</p>
            {"sendUsdc" in state && money.hint(state.sendUsdc) ? <p data-local-hint className="text-[14px] font-medium tabular-nums text-[var(--ink-secondary)]">{money.hint(state.sendUsdc)}</p> : null}
            <p className="mt-3 break-all text-[14px] font-medium tabular-nums text-[var(--ink)] select-all">{address}</p>
            <p className="mt-3 text-[14px] font-medium text-[var(--ink-secondary)]">{fill(copy.chainsLine, { chains: chains ?? '' })}</p>
          </div>
        </div>
      ) : (
        <div aria-busy className="mt-5 h-[168px] rounded-[16px] bg-[var(--raised)] motion-safe:animate-pulse" />
      )}
      <button type="button" onClick={() => void copyAddress()} disabled={!address} className={cn(PRIMARY, 'mt-8')}>
        {copied ? copy.copiedAddress : copy.copyAddress}
      </button>
      <div className="mt-5 border-t border-[var(--line)] pt-4">
        <Watching label={copy.watching} />
      </div>
    </section>
  );
}

function Step({ label, sub, done, active }: { label: string; sub?: string; done?: boolean; active?: boolean }) {
  return (
    <li className="flex list-none items-start gap-3">
      <span
        aria-hidden
        className={cn(
          'mt-1 grid size-5 shrink-0 place-items-center rounded-full border',
          done ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)]' : 'border-[var(--line-strong)]',
          active && 'border-[var(--ink)] motion-safe:animate-pulse',
        )}
      >
        {done ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        ) : null}
      </span>
      <span>
        <span className={cn('block text-[15px] font-semibold', done || active ? 'text-[var(--ink)]' : 'text-[var(--ink-secondary)]')}>{label}</span>
        {sub ? <span className="mt-0.5 block text-[14px] font-medium text-[var(--ink-secondary)]">{sub}</span> : null}
      </span>
    </li>
  );
}
