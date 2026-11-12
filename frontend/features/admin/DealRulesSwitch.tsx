'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AdminFormLimits } from '@/core/api';
import { useDialog } from '@/shared/components/Dialog';

const labelClass = 'text-[10px] text-[var(--d-text-2)]';

/// The deal rules (view 32). While off, a deal a rule would refuse goes ahead
/// and the server logs the rule. Turning them on is one person; turning them
/// off waits for a second teammate (view 79).
export function DealRulesSwitch() {
  const { prompt, notify } = useDialog();
  const [state, setState] = useState<AdminFormLimits | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await api.adminDealRules());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not read the switch.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function flip() {
    if (!state) return;
    let reason: string | null = null;
    if (state.on) {
      reason = await prompt({
        title: 'Ask to turn the deal rules off',
        message: 'A second teammate approves it on Waiting for you. Until then the rules stay on.',
        placeholder: 'Why they should be off',
        confirmLabel: 'Ask for approval',
      });
      if (!reason?.trim()) return;
    }
    setBusy(true);
    try {
      if (reason) {
        await api.adminDealRulesOff(reason.trim());
        notify('Asked. A second teammate approves it on Waiting for you.');
      } else {
        setState(await api.adminSetDealRules(true));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the switch.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] p-6">
      <p className={labelClass}>Deal rules</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-[60ch]">
          <p className="text-[15px] font-semibold text-[var(--d-text)]">{state === null ? 'Reading…' : state.on ? 'On' : 'Off, logging only'}</p>
          <p className="mt-1 text-[13px] text-[var(--d-text-2)]">
            A seller with no finished deal and no verification takes up to 100 USDC. Goods over 50 USDC need shipped or in person.
          </p>
        </div>
        <button type="button" onClick={() => void flip()} disabled={busy || state === null}
          className={state?.on
            ? 'min-h-11 rounded-lg border border-[var(--d-line)] px-4 text-[13px] font-bold text-[var(--d-text)] disabled:opacity-50'
            : 'min-h-11 rounded-lg bg-[var(--d-lime)] px-4 text-[13px] font-bold text-[#0D0E10] disabled:opacity-50'}>
          {state?.on ? 'Ask to turn the rules off' : 'Turn the rules on'}
        </button>
      </div>
      {error ? <p className="mt-3 text-[12px] text-[var(--d-red)]">{error}</p> : null}
    </section>
  );
}
