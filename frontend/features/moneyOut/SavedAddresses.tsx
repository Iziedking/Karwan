'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type MoneyOutStatus } from '@/core/api';
import type { AnySourceChainKey } from '@/features/bridge/config';
import { bridgeChainMeta } from '@/features/bridge/hooks/useBridge';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { QUIET, SECONDARY } from '@/shared/ui/controls';
import { shortAddress } from '@/shared/utils/format';
import { formatWhen } from './refusal';
import { useWorldAccountCheck } from './useWorldAccountCheck';

const fillIn = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);

/// Where an account Karwan signs for can send money: the addresses the person
/// added with World ID, when each one opens, the limit left today, and the
/// pause. Shown only where the guard is on and only for such an account.
export function SavedAddresses() {
  const copy = useTranslations().moneyOut;
  const { locale } = useLocale();
  const [status, setStatus] = useState<MoneyOutStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.moneyOutStatus().then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(load, [load]);
  const resume = useWorldAccountCheck(load);

  if (!status?.enabled || status.kind !== 'chat') return null;
  const now = Date.now();

  async function act(key: string, run: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await run();
      load();
    } catch {
      setError(copy.actionFailed);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="money-out-title" className="space-y-4">
      <div>
        <h2 id="money-out-title" className="text-[20px] font-semibold text-[var(--lp-dark)]">{copy.title}</h2>
        <p className="mt-1 text-[14px] font-medium text-[var(--lp-text-sub)]">{copy.lead}</p>
      </div>

      {status.paused ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] text-[var(--lp-dark)]">{copy.pausedLine}</p>
          <button
            type="button"
            onClick={() => void resume.begin('unpause')}
            disabled={resume.phase !== 'idle'}
            aria-busy={resume.phase !== 'idle'}
            className={SECONDARY}
          >
            {resume.phase !== 'idle' ? copy.opening : copy.resume}
          </button>
        </div>
      ) : null}

      {status.addresses.length === 0 ? (
        <p className="text-[15px] text-[var(--lp-text-sub)]">{copy.empty}</p>
      ) : (
        <ul className="divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
          {status.addresses.map((saved) => {
            const nameId = `saved-${saved.id}`;
            return (
              <li key={saved.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-3">
                <span className="min-w-0 flex-1">
                  <span id={nameId} className="mono block text-[15px] font-semibold text-[var(--lp-dark)]">
                    {fillIn(copy.onChain, {
                      address: shortAddress(saved.address),
                      chain: bridgeChainMeta(saved.chain as AnySourceChainKey).name,
                    })}
                  </span>
                  <span className="block text-[14px] font-medium text-[var(--lp-text-sub)]">
                    {saved.opensAt > now ? fillIn(copy.opensAt, { time: formatWhen(saved.opensAt, locale) }) : copy.ready}
                  </span>
                </span>
                <button
                  type="button"
                  aria-describedby={nameId}
                  onClick={() => void act(saved.id, () => api.moneyOutRemoveAddress(saved.id))}
                  disabled={busy !== null}
                  className={QUIET}
                >
                  {copy.remove}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[14px] font-medium tabular-nums text-[var(--lp-text-sub)]">
        {fillIn(copy.limitLeft, { left: status.leftUsdc, limit: status.limitUsdc })}
      </p>

      {!status.paused ? (
        <button type="button" onClick={() => void act('pause', api.moneyOutPause)} disabled={busy !== null} className={SECONDARY}>
          {copy.pause}
        </button>
      ) : null}
      {error || resume.error ? (
        <p role="alert" className="text-[14px] text-[var(--lp-dark)]">
          {error ?? resume.error}
        </p>
      ) : null}
      {resume.widget}
    </section>
  );
}
