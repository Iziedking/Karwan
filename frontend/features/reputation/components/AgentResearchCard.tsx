'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/core/api';

/// Profile card for "agent research" credit. Every agent researches the market
/// on every deal now; this prepaid USDC credit is what's drawn down when the
/// user actually matches a deal (the matched buyer + seller split the cost), so
/// they're never charged just for bidding. Deliberate wording: "agent research"
/// everywhere on the surface; the x402 mechanism is documentation-only.

interface ResearchState {
  active: boolean;
  creditUsdc: number;
  priceUsdc: number;
}

export function AgentResearchCard() {
  const [state, setState] = useState<ResearchState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .researchStatus()
      .then((s) => !cancelled && setState(s))
      .catch(() => !cancelled && setState({ active: false, creditUsdc: 0, priceUsdc: 1.5 }));
    return () => {
      cancelled = true;
    };
  }, []);

  const price = state?.priceUsdc ?? 1.5;
  // Sub-cent per deal, so a credit covers a long run of deals. Rounded for copy.
  const dealsLeft = state ? Math.floor(state.creditUsdc / 0.007) : 0;

  async function activate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const next = await api.researchActivate();
      setState((prev) => ({ priceUsdc: prev?.priceUsdc ?? price, ...next }));
      setNote('Research credit added. You are charged only on deals you actually match.');
    } catch (e) {
      if (e instanceof ApiError && /insufficient/i.test(e.message)) {
        setError('Not enough USDC in your agent wallet. Top up, then activate.');
      } else {
        setError(e instanceof ApiError ? e.message : 'Activation failed. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="bg-[var(--lp-card)] border border-[var(--lp-border-light)] p-5 sm:p-6"
      style={{
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 4,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
            [:AGENT RESEARCH:]
          </p>
          <p className="mt-1.5 font-sans text-[18px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
            Market research for your agent
          </p>
        </div>
        {state?.active ? (
          <span
            className="shrink-0 mono text-[9px] font-bold uppercase tracking-[0.14em] px-2 py-1"
            style={{ color: '#4f8a3f', background: 'rgba(79,138,63,0.16)', borderRadius: 4 }}
          >
            Credited
          </span>
        ) : (
          <span className="shrink-0 mono text-[9px] font-bold uppercase tracking-[0.14em] px-2 py-1 text-[var(--lp-text-muted)] bg-black/[0.05] rounded">
            No credit
          </span>
        )}
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
        Your agent researches the live market on every deal and negotiates to it: it
        reads what your keywords are worth, tells you if you are over or under market,
        and never spends beyond your cap. You are charged a fraction of a cent only on
        deals you actually match, split with the other side.
      </p>

      {state?.active && (
        <p className="mt-3 mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          Research balance: ${state.creditUsdc.toFixed(2)} · about {dealsLeft.toLocaleString()} matched deals
        </p>
      )}

      <div className="mt-5 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={activate}
          disabled={busy}
          className="mono text-[11px] uppercase tracking-[0.1em] font-bold px-4 py-2.5 bg-[var(--lp-dark)] text-[var(--lp-bg)] disabled:opacity-50 transition"
          style={{
            borderTopLeftRadius: 10,
            borderTopRightRadius: 10,
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 3,
          }}
        >
          {busy ? 'Confirming...' : state?.active ? `Add credit · ${price} USDC` : `Add research credit · ${price} USDC`}
        </button>
        <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          paid from your agent wallet (Arc)
        </span>
      </div>

      {note && <p className="mt-3 text-[12px] leading-snug text-[#4f8a3f]">{note}</p>}
      {error && <p className="mt-3 text-[12px] leading-snug text-[var(--lp-critical)]">{error}</p>}
    </div>
  );
}
