'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { api, ApiError, ConfirmCancelled, type GuaranteeStep } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useMoneyRefresh } from '@/shared/hooks/useMoneyRefresh';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { useOwnWalletSend } from '@/shared/chain/useOwnWalletSend';
import { ARC_CHAIN_ID } from '@/features/profile/config';
import { runWalletGuarantee } from './walletGuarantee';

export const GUARANTEE_QUERY = ['guarantee'] as const;

export type GuaranteeOutcome = { ok: true; step: GuaranteeStep; amount?: string } | { ok: false; cancelled: true } | { ok: false; cancelled: false; error: string };

const fillIn = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));

/// The Deal guarantee read and its four moves (put up, take out, cancel,
/// collect), shared by the Money tab, its pages and the old card. Karwan signs
/// for an account it holds; an own wallet signs once in the browser.
export function useGuarantee() {
  const { t } = useLocale();
  const c = t.dealGuarantee;
  const { method } = useAuth();
  const qc = useQueryClient();
  const refreshMoney = useMoneyRefresh();
  const ownWallet = useOwnWalletSend();
  const arc = usePublicClient({ chainId: ARC_CHAIN_ID });
  const query = useQuery({ queryKey: GUARANTEE_QUERY, queryFn: () => api.guarantee() });
  const [busy, setBusy] = useState(false);

  async function run(step: GuaranteeStep, amount?: string): Promise<GuaranteeOutcome> {
    const data = query.data;
    if (!data?.available) return { ok: false, cancelled: false, error: c.notAvailable };
    const withAmount = step === 'put_up' || step === 'take_out';
    const value = withAmount ? amount?.trim() : undefined;
    if (withAmount && !(Number(value) > 0)) return { ok: false, cancelled: false, error: c.errors.amount };
    if (step === 'take_out' && Number(value) > Number(data.freeUsdc)) return { ok: false, cancelled: false, error: fillIn(c.errors.overFree, { amount: data.freeUsdc }) };
    setBusy(true);
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
      refreshMoney();
      await qc.invalidateQueries({ queryKey: GUARANTEE_QUERY });
      return { ok: true, step, ...(value ? { amount: value } : {}) };
    } catch (err) {
      if (err instanceof ConfirmCancelled) return { ok: false, cancelled: true };
      const body = err instanceof ApiError ? (err.body as { code?: string; balanceUsdc?: string; freeUsdc?: string } | undefined) : undefined;
      return {
        ok: false,
        cancelled: false,
        error:
          body?.code === 'not_enough'
            ? fillIn(c.errors.overBalance, { amount: body.balanceUsdc ?? '0' })
            : body?.code === 'over_free'
              ? fillIn(c.errors.overFree, { amount: body.freeUsdc ?? '0' })
              : c.errors.failed,
      };
    } finally {
      setBusy(false);
    }
  }

  return { query, data: query.data, busy, run };
}
