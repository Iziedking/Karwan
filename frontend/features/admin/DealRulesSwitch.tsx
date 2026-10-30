'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AdminFormLimits } from '@/core/api';

const labelClass = 'mono text-[10px] uppercase tracking-[0.12em] text-white/40';

/// The deal rules (view 32): off until after the 3 Nov demo. While off, a deal
/// a rule would refuse goes ahead and the server logs the rule.
export function DealRulesSwitch() {
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
    setBusy(true);
    try {
      setState(await api.adminSetDealRules(!state.on));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the switch.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-[#161616] p-6">
      <p className={labelClass}>Deal rules</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-[60ch]">
          <p className="text-[15px] font-semibold text-white">{state === null ? 'Reading…' : state.on ? 'On' : 'Off, logging only'}</p>
          <p className="mt-1 text-[13px] text-white/55">
            A seller with no finished deal and no verification takes up to 100 USDC. Goods over 50 USDC need shipped or in person.
          </p>
        </div>
        <button type="button" onClick={() => void flip()} disabled={busy || state === null}
          className={state?.on
            ? 'min-h-11 rounded-lg border border-white/20 px-4 text-[13px] font-bold text-white disabled:opacity-50'
            : 'min-h-11 rounded-lg bg-[#AFC95B] px-4 text-[13px] font-bold text-[#10171D] disabled:opacity-50'}>
          {state?.on ? 'Turn the rules off' : 'Turn the rules on'}
        </button>
      </div>
      {error ? <p className="mt-3 text-[12px] text-[#e0794f]">{error}</p> : null}
    </section>
  );
}
