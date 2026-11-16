'use client';
import { useId, useRef, useState } from 'react';
import { api, ConfirmCancelled, type AgentMandate } from '@/core/api';
import { MoneyInput } from '@/features/money/components/MoneyInput';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import type { AgentSwitchesCopy } from '@/shared/i18n/messages/agentSwitches';
import { lockWidens } from './switches';

type Typed = { currency: string; amount: string } | null;

/// The limits for Lock money (view 87): the most for one deal and in a week,
/// typed by the person in their own currency. Turning it on, or raising a
/// limit, is confirmed with the passkey by the sheet every 428 opens; a lower
/// limit just saves.
export function LockSheet({ mandate, copy, onClose, onSaved }: {
  mandate: AgentMandate;
  copy: AgentSwitchesCopy;
  onClose: () => void;
  onSaved: () => void;
}) {
  const titleId = useId();
  const dealId = useId();
  const weekId = useId();
  const [perDeal, setPerDeal] = useState<number | null>(mandate.lock?.perDeal.usdc ?? null);
  const [perWeek, setPerWeek] = useState<number | null>(mandate.lock?.perWeek.usdc ?? null);
  const typed = useRef<{ perDeal?: Typed; perWeek?: Typed }>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const ready = perDeal !== null && perWeek !== null && perDeal > 0 && perWeek > 0;
  const order = ready && perDeal > perWeek;
  const widens = ready && lockWidens(mandate, { perDealUsdc: perDeal, perWeekUsdc: perWeek });

  async function save() {
    if (!ready || order || busy) return;
    setBusy(true);
    setFailed(false);
    const t = typed.current;
    const currency = t.perDeal?.currency ?? t.perWeek?.currency;
    const amounts = {
      ...(t.perDeal && t.perDeal.currency === currency ? { perDealUsdc: Number(t.perDeal.amount) } : {}),
      ...(t.perWeek && t.perWeek.currency === currency ? { perWeekUsdc: Number(t.perWeek.amount) } : {}),
    };
    try {
      await api.changeMandate(
        {
          part: 'lock-rules',
          perDealUsdc: perDeal,
          perWeekUsdc: perWeek,
          ...(mandate.switches.lock ? {} : { on: true }),
          ...(currency && Object.keys(amounts).length ? { said: { currency, amounts } } : {}),
        },
        `page:${crypto.randomUUID()}`,
      );
      onSaved();
      onClose();
    } catch (err) {
      // Closing the passkey sheet leaves this one as it was.
      if (!(err instanceof ConfirmCancelled)) setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const field = 'form-input form-input-num mt-1.5 w-full';
  const label = 'block text-[14px] font-semibold text-[var(--ink)]';
  return (
    <ConfirmSheetShell open labelledBy={titleId} busy={busy} onClose={onClose}>
      <div data-lock-sheet>
        <h2 id={titleId} className="text-[20px] font-semibold text-[var(--ink)]">{copy.labels.lock}</h2>
        <div className="mt-5 space-y-4">
          <label htmlFor={dealId} className={label}>
            {copy.lock.perDeal}
            <MoneyInput
              id={dealId}
              value={perDeal}
              agreed={mandate.lock?.perDeal.said ?? null}
              onTyped={(said) => { typed.current.perDeal = said; }}
              onChange={setPerDeal}
              disabled={busy}
              className={field}
            />
          </label>
          <label htmlFor={weekId} className={label}>
            {copy.lock.perWeek}
            <MoneyInput
              id={weekId}
              value={perWeek}
              agreed={mandate.lock?.perWeek.said ?? null}
              onTyped={(said) => { typed.current.perWeek = said; }}
              onChange={setPerWeek}
              disabled={busy}
              className={field}
            />
          </label>
        </div>
        <dl className="mt-5 divide-y divide-[var(--line)] overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] text-[15px]">
          <div className="flex min-h-[52px] items-center justify-between gap-3 px-4">
            <dt className="font-medium text-[var(--ink)]">{copy.lock.who}</dt>
            <dd className="text-[14px] font-medium text-[var(--ink-secondary)]">{copy.lock.whoValue[mandate.lock?.who ?? 'record']}</dd>
          </div>
          <div className="flex min-h-[52px] items-center justify-between gap-3 px-4">
            <dt className="font-medium text-[var(--ink)]">{copy.lock.perDay}</dt>
            <dd className="text-[14px] font-medium tabular-nums text-[var(--ink-secondary)]">{mandate.lock?.perDay ?? 3}</dd>
          </div>
        </dl>
        {order ? <p role="alert" className="mt-3 text-[14px] font-medium text-[var(--ink)]">{copy.lock.order}</p> : null}
        {failed ? <p role="alert" className="mt-3 text-[14px] font-medium text-[var(--color-critical)]">{copy.failed}</p> : null}
        <div className="mt-5 grid gap-2">
          <button
            type="button"
            disabled={!ready || order || busy}
            onClick={() => void save()}
            className="min-h-12 rounded-full bg-[var(--karwan-green)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {widens || !ready ? copy.lock.confirm : copy.lock.save}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-12 rounded-full border border-[var(--line)] px-5 text-[15px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--raised)] disabled:opacity-40"
          >
            {copy.lock.notNow}
          </button>
        </div>
      </div>
    </ConfirmSheetShell>
  );
}
