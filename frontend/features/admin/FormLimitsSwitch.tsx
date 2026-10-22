'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AdminFormLimits } from '@/core/api';

const labelClass = 'mono text-[10px] uppercase tracking-[0.12em] text-white/40';

function when(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC';
}

/// One switch for the per-IP limits on the survey and the waitlist. Off lets
/// people on a shared carrier IP through; on restores the limits as they were.
/// The wrong-code limit and the per-email cap on codes stay on either way.
export function FormLimitsSwitch() {
  const [state, setState] = useState<AdminFormLimits | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await api.adminFormLimits());
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
      setState(await api.adminSetFormLimits(!state.on));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the switch.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-[#161616] p-5">
      <p className={labelClass}>Limits per connection</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-[60ch]">
          <p className="text-[15px] font-semibold text-white">
            {state === null ? 'Reading…' : state.on ? 'On' : 'Off'}
          </p>
          <p className="mt-1 text-[13px] text-white/55">
            Survey: 5 answers an hour. Waitlist: 5 code requests, 15 code checks and 20 answers per 10 minutes.
            Each code still allows 5 wrong tries, and one email gets at most 4 codes in 15 minutes.
          </p>
          {state?.updatedAt ? (
            <p className="mt-1 text-[12px] text-white/40">Last changed {when(state.updatedAt)}</p>
          ) : null}
        </div>
        <button type="button" onClick={() => void flip()} disabled={busy || state === null}
          className={state?.on
            ? 'min-h-11 rounded-lg border border-white/20 px-4 text-[13px] font-bold text-white disabled:opacity-50'
            : 'min-h-11 rounded-lg bg-[#AFC95B] px-4 text-[13px] font-bold text-[#10171D] disabled:opacity-50'}>
          {state?.on ? 'Turn the limits off' : 'Turn the limits back on'}
        </button>
      </div>
      {error ? <p className="mt-3 text-[12px] text-[#e0794f]">{error}</p> : null}
    </section>
  );
}
