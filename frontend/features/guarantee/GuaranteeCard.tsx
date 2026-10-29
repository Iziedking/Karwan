'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { api, ApiError, ConfirmCancelled, type GuaranteeStep } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useMoneyRefresh } from '@/shared/hooks/useMoneyRefresh';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { useOwnWalletSend } from '@/shared/chain/useOwnWalletSend';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { Row, RowGroup } from '@/features/profile/ui/ProfileUi';
import { ARC_CHAIN_ID } from '@/features/profile/config';
import { runWalletGuarantee } from './walletGuarantee';

export const GUARANTEE_QUERY = ['guarantee'] as const;

const primary = 'min-h-12 rounded-full bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50';
const secondary = 'min-h-12 rounded-full border border-[var(--lp-border-light)] px-5 text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] disabled:opacity-40';

/// The person's Deal guarantee on the family vault (view 37): what is in place,
/// what deals hold, what is coming back, and one sheet per step. Karwan signs
/// for a wallet it holds; an own wallet signs once in the browser.
export function GuaranteeCard() {
  const { locale, t } = useLocale();
  const c = t.dealGuarantee;
  const { method } = useAuth();
  const qc = useQueryClient();
  const refreshMoney = useMoneyRefresh();
  const ownWallet = useOwnWalletSend();
  const arc = usePublicClient({ chainId: ARC_CHAIN_ID });
  const sheetId = useId();
  const { data } = useQuery({ queryKey: GUARANTEE_QUERY, queryFn: () => api.guarantee() });
  const [step, setStep] = useState<GuaranteeStep | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const day = (unix: number) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(unix * 1000));
  const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));

  if (!data) return null;
  if (!data.available) {
    return (
      <RowGroup>
        <Row label={c.notAvailable} />
      </RowGroup>
    );
  }

  const comingBack = Number(data.comingBackUsdc);
  const withAmount = step === 'put_up' || step === 'take_out';
  const readyOn = day(Math.floor(Date.now() / 1000) + data.waitDays * 86_400);

  const open = (next: GuaranteeStep) => {
    setStep(next);
    setAmount(next === 'take_out' ? data.freeUsdc : '');
    setError(null);
    setDone(null);
  };

  async function confirm() {
    if (!step || !data?.available) return;
    const value = withAmount ? amount.trim() : undefined;
    if (withAmount && !(Number(value) > 0)) {
      setError(c.errors.amount);
      return;
    }
    if (step === 'take_out' && Number(value) > Number(data.freeUsdc)) {
      setError(fill(c.errors.overFree, { amount: data.freeUsdc }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (method === 'circle') {
        const requestId = crypto.randomUUID();
        if (step === 'put_up') await api.guaranteePutUp({ amountUsdc: value!, requestId });
        else if (step === 'take_out') await api.guaranteeTakeOut({ amountUsdc: value!, requestId });
        else if (step === 'cancel') await api.guaranteeCancelTakeOut({ requestId });
        else await api.guaranteeCollect({ requestId });
      } else {
        if (!arc) throw new Error('no Arc client');
        await runWalletGuarantee({ step, ...(value ? { amountUsdc: value } : {}), ownWallet, arcClient: arc, revertedText: t.chainErrors.reverted });
      }
      const doneText = { put_up: c.done.putUp, take_out: fill(c.done.takeOut, { date: readyOn }), cancel: c.done.cancel, collect: c.done.collect }[step];
      setStep(null);
      setDone(doneText);
      refreshMoney();
      await qc.invalidateQueries({ queryKey: GUARANTEE_QUERY });
    } catch (err) {
      if (err instanceof ConfirmCancelled) {
        setStep(null);
        return;
      }
      const body = err instanceof ApiError ? (err.body as { code?: string; balanceUsdc?: string; freeUsdc?: string } | undefined) : undefined;
      setError(
        body?.code === 'not_enough'
          ? fill(c.errors.overBalance, { amount: body.balanceUsdc ?? '0' })
          : body?.code === 'over_free'
            ? fill(c.errors.overFree, { amount: body.freeUsdc ?? '0' })
            : c.errors.failed,
      );
    } finally {
      setBusy(false);
    }
  }

  const sheet = step === 'put_up' ? c.sheets.putUp : step === 'take_out' ? c.sheets.takeOut : step === 'cancel' ? c.sheets.cancel : c.sheets.collect;
  const shownAmount = withAmount ? amount || '0' : data.comingBackUsdc;

  return (
    <div className="space-y-3">
      <RowGroup>
        <Row label={c.rows.inPlace} value={`${data.inPlaceUsdc} USDC`} />
        {Number(data.heldUsdc) > 0 ? <Row label={c.rows.held} value={`${data.heldUsdc} USDC`} /> : null}
        {comingBack > 0 && !data.ready && data.readyAt ? (
          <Row label={c.rows.comingBack} value={fill(c.comingBackValue, { amount: data.comingBackUsdc, date: day(data.readyAt) })} />
        ) : null}
        {comingBack > 0 && data.ready ? <Row label={c.rows.ready} value={fill(c.readyValue, { amount: data.comingBackUsdc })} /> : null}
        <Row label={c.rows.earns} value={c.earnsValue} full />
      </RowGroup>

      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className={primary} onClick={() => open('put_up')}>
          {c.buttons.putUp}
        </button>
        {Number(data.freeUsdc) > 0 ? (
          <button type="button" className={secondary} onClick={() => open('take_out')}>
            {c.buttons.takeOut}
          </button>
        ) : null}
        {comingBack > 0 && data.ready ? (
          <button type="button" className={secondary} onClick={() => open('collect')}>
            {c.buttons.collect}
          </button>
        ) : null}
        {comingBack > 0 ? (
          <button type="button" className={secondary} onClick={() => open('cancel')}>
            {c.buttons.cancel}
          </button>
        ) : null}
      </div>

      <p aria-live="polite" className="min-h-0 px-1 text-[14px] font-medium text-[var(--lp-text-sub)] empty:hidden">
        {done}
      </p>

      {Number(data.previousUsdc) > 0 ? (
        <p className="px-1 text-[14px] font-medium text-[var(--lp-text-sub)]">
          {fill(c.previous.line, { amount: data.previousUsdc })}{' '}
          <Link href="/legacy#previous-guarantee" className="font-semibold text-[var(--lp-dark)] underline underline-offset-4">
            {c.previous.link}
          </Link>
        </p>
      ) : null}

      <ConfirmSheetShell open={step !== null} labelledBy={`${sheetId}-title`} busy={busy} onClose={() => setStep(null)}>
        <h2 id={`${sheetId}-title`} className="text-[20px] font-semibold text-[var(--lp-dark)]">
          {fill(sheet.title, { amount: shownAmount })}
        </h2>
        {withAmount ? (
          <label className="mt-4 block">
            <span className="text-[14px] font-medium text-[var(--lp-text-sub)]">{c.amountLabel}</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              disabled={busy}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              className="mt-1 min-h-12 w-full rounded-[14px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-4 text-[16px] font-semibold tabular-nums text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
          </label>
        ) : null}
        <p className="mt-3 text-[15px] font-medium leading-relaxed text-[var(--lp-text-sub)]">
          {fill(sheet.body, { days: data.waitDays, date: readyOn })}
        </p>
        {step === 'take_out' && comingBack > 0 ? (
          <p className="mt-2 text-[14px] font-medium leading-relaxed text-[var(--lp-dark)]">
            {fill(c.sheets.takeOut.restart, { days: data.waitDays, total: (comingBack + (Number(amount) || 0)).toFixed(2) })}
          </p>
        ) : null}
        {step === 'put_up' ? <p className="mt-2 text-[14px] font-medium text-[var(--lp-text-sub)]">{c.earnsValue}</p> : null}
        {error ? (
          <p role="alert" className="mt-3 text-[14px] font-medium text-[var(--color-critical)]">
            {error}
          </p>
        ) : null}
        <div className="mt-5 grid gap-2">
          <button type="button" className={primary} disabled={busy} aria-busy={busy} onClick={() => void confirm()}>
            {busy ? c.sheets.busy : sheet.confirm}
          </button>
          <button type="button" className={secondary} disabled={busy} onClick={() => setStep(null)}>
            {c.sheets.notNow}
          </button>
        </div>
      </ConfirmSheetShell>
    </div>
  );
}
