'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AdminMeaningCounts, type AdminWordMapSuggestion } from '@/core/api';
import { AdminPageHeader } from '@/features/admin/AdminPageHeader';

const labelClass = 'text-[10px] text-[var(--d-text-2)]';

function when(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/// Word map suggestions (view 95): pairs the model judge matched that share no
/// word. A good one is added to backend/src/matching/wordMap.ts in a commit;
/// the rest are dismissed.
export default function WordMapPage() {
  const [list, setList] = useState<AdminWordMapSuggestion[] | null>(null);
  const [meaning, setMeaning] = useState<AdminMeaningCounts | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const got = await api.adminWordMapSuggestions();
      setList(got.suggestions);
      setMeaning(got.meaning ?? null);
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not load suggestions');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function dismiss(id: string) {
    setBusy(id);
    try {
      await api.adminDismissWordMapSuggestion(id);
      setList((cur) => (cur ?? []).filter((s) => s.id !== id));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not dismiss');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="MATCHING"
        title="Word map suggestions"
        description="Pairs the model matched that share no word. Add the good ones to backend/src/matching/wordMap.ts."
        meta={list ? `${list.length} open` : undefined}
      />

      {meaning && (
        <p data-meaning={meaning.on ? 'on' : 'off'} className="mt-4 text-[12px] text-[var(--d-text-2)] tabular-nums">
          {meaning.on ? `Meaning vectors: ${meaning.withVector} of ${meaning.sellers} sellers` : 'Meaning matching is off'}
        </p>
      )}

      {err && <p role="alert" className="mt-5 border-l-2 border-[#5A2A2E] px-3 py-2 text-[12px] text-[var(--d-red)]">{err}</p>}

      <div className="mt-6 space-y-3">
        {list === null && !err && <p className="text-[13px] text-[var(--d-text-2)]">Loading suggestions</p>}
        {list !== null && list.length === 0 && (
          <div className="border border-[var(--d-line)] rounded-lg p-5 bg-[var(--d-surface)]">
            <p className="text-[14px] font-semibold">No open suggestions</p>
          </div>
        )}
        {list?.map((s) => (
          <article key={s.id} data-suggestion={s.id} className="border border-[var(--d-line)] rounded-lg p-4 bg-[var(--d-surface)] flex items-center justify-between gap-4 flex-wrap">
            <div className="grid gap-3 sm:grid-cols-3 min-w-0 flex-1">
              <div className="min-w-0">
                <p className={labelClass}>Request said</p>
                <p className="mt-1 text-[13px] text-[var(--d-text)] break-words">{s.briefWords.join(' ')}</p>
              </div>
              <div className="min-w-0">
                <p className={labelClass}>Seller said</p>
                <p className="mt-1 text-[13px] text-[var(--d-text)] break-words">{s.sellerWords.join(' ')}</p>
              </div>
              <div>
                <p className={labelClass}>Times matched</p>
                <p className="mt-1 text-[13px] text-[var(--d-text)] tabular-nums">{s.count}</p>
                <p className="mt-0.5 text-[11px] text-[var(--d-text-3)]">Last {when(s.lastSeen)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void dismiss(s.id)}
              disabled={busy === s.id}
              className="min-h-9 rounded-lg border border-[var(--d-line)] px-3 text-[12px] text-[var(--d-text)] hover:border-[var(--d-line-2)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--d-line-2)]"
            >
              Dismiss
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
