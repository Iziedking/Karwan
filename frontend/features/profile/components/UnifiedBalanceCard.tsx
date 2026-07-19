'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';

/// The user's unified Gateway balance: a pooled USDC balance they top up once,
/// then use to fund either agent for any activity, or cash out to another chain.
/// All backend-signed (no wallet popup): Circle users add from their sign-in
/// wallet, web3 users add from an agent wallet they funded.

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

const CARD_STYLE = {
  background: 'var(--lp-card)',
  color: 'var(--lp-dark)',
  border: '1px solid var(--lp-border-light)',
  borderTopLeftRadius: 22,
  borderTopRightRadius: 22,
  borderBottomLeftRadius: 22,
  borderBottomRightRadius: 5,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.12)',
} as const;

const POSITIVE = '#0a7553';
const CRITICAL = '#b03d3a';

type Mode = 'add' | 'fund' | 'cashout';
type Phase = 'idle' | 'sending' | 'done' | 'error';

const CHAINS: { key: 'baseSepolia' | 'arbitrumSepolia' | 'optimismSepolia' | 'sepolia' | 'polygonAmoy'; label: string }[] = [
  { key: 'baseSepolia', label: 'Base' },
  { key: 'arbitrumSepolia', label: 'Arbitrum' },
  { key: 'optimismSepolia', label: 'Optimism' },
  { key: 'sepolia', label: 'Ethereum' },
  { key: 'polygonAmoy', label: 'Polygon' },
];

export function UnifiedBalanceCard() {
  const auth = useAuth();
  const isCircleUser = auth.method === 'circle';

  const [available, setAvailable] = useState<string | null>(null);
  const loadBalance = useCallback(() => {
    api
      .gatewayUnified()
      .then((r) => setAvailable(r.available))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    loadBalance();
  }, [auth.isAuthenticated, loadBalance]);

  const [mode, setMode] = useState<Mode>('add');
  const [amount, setAmount] = useState<number | ''>('');
  const [source, setSource] = useState<'identity' | 'buyer' | 'seller'>(isCircleUser ? 'identity' : 'buyer');
  const [agent, setAgent] = useState<'buyer' | 'seller'>('buyer');
  const [chain, setChain] = useState<typeof CHAINS[number]['key']>('baseSepolia');
  const [recipient, setRecipient] = useState('');

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  const amountValid = typeof amount === 'number' && amount > 0;
  const recipientValid = ADDR_RE.test(recipient.trim());
  const canSubmit =
    auth.isAuthenticated &&
    amountValid &&
    phase !== 'sending' &&
    (mode !== 'cashout' || recipientValid);

  function reset() {
    setPhase('idle');
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setPhase('sending');
    setError(null);
    try {
      if (mode === 'add') await api.gatewayDeposit(amount as number, source);
      else if (mode === 'fund') await api.gatewayFundAgent(agent, amount as number);
      else await api.gatewayCashOut(chain, recipient.trim(), amount as number);
      setPhase('done');
      setAmount('');
      loadBalance();
    } catch (err) {
      if (err instanceof ApiError && err.detail) setError(String(err.detail));
      else setError((err as Error).message);
      setPhase('error');
    }
  }

  const modes: { key: Mode; label: string }[] = [
    { key: 'add', label: 'Add' },
    { key: 'fund', label: 'Fund agent' },
    { key: 'cashout', label: 'Cash out' },
  ];

  return (
    <section style={CARD_STYLE} className="p-6 md:p-8 h-full min-w-0 flex flex-col overflow-hidden">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">Unified balance</span>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-sans text-[34px] font-extrabold tracking-[-0.025em] tabular-nums leading-none text-[var(--lp-dark)]">
          {available === null ? '—' : Number(available).toFixed(2)}
        </span>
        <span className="mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">USDC</span>
      </div>
      <p className="mt-2 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        One balance. Fund either agent, or cash out anywhere.
      </p>

      {/* mode switch */}
      <div className="mt-6 grid grid-cols-3 gap-2">
        {modes.map((m) => {
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => {
                setMode(m.key);
                reset();
              }}
              aria-pressed={active}
              className="px-3 py-2 mono text-[10px] uppercase tracking-[0.1em] font-bold transition-colors"
              style={{
                background: active ? 'rgba(175,201,91,0.12)' : 'var(--lp-light)',
                border: active ? '1px solid var(--lp-accent)' : '1px solid var(--lp-border-light)',
                color: 'var(--lp-dark)',
                borderRadius: 10,
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <form onSubmit={submit} className="mt-5 flex flex-1 flex-col gap-4">
        {/* add: source */}
        {mode === 'add' && (
          <Field label="From">
            <div className="grid grid-cols-3 gap-2">
              {(isCircleUser ? (['identity', 'buyer', 'seller'] as const) : (['buyer', 'seller'] as const)).map((s) => (
                <Pill key={s} active={source === s} onClick={() => setSource(s)} label={s === 'identity' ? 'Wallet' : `${s} agent`} />
              ))}
            </div>
          </Field>
        )}

        {/* fund: agent */}
        {mode === 'fund' && (
          <Field label="To agent">
            <div className="grid grid-cols-2 gap-2">
              {(['buyer', 'seller'] as const).map((a) => (
                <Pill key={a} active={agent === a} onClick={() => setAgent(a)} label={`${a} agent`} />
              ))}
            </div>
          </Field>
        )}

        {/* cashout: chain + recipient */}
        {mode === 'cashout' && (
          <>
            <Field label="To chain">
              <div className="grid grid-cols-3 gap-2">
                {CHAINS.map((ch) => (
                  <Pill key={ch.key} active={chain === ch.key} onClick={() => setChain(ch.key)} label={ch.label} />
                ))}
              </div>
            </Field>
            <label className="block space-y-2">
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">Destination address</span>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x…"
                className="w-full bg-[var(--lp-light)] px-4 py-3 text-[13px] mono tabular-nums focus:outline-none text-[var(--lp-dark)] placeholder:text-[var(--lp-text-muted)]"
                style={{ border: '1px solid var(--lp-border-light)', borderRadius: 12 }}
              />
              {recipient.length > 0 && !recipientValid && (
                <span className="mono text-[10px] uppercase tracking-[0.12em]" style={{ color: CRITICAL }}>
                  Enter a valid 0x address
                </span>
              )}
            </label>
          </>
        )}

        {/* amount */}
        <div className="p-5" style={{ background: 'var(--lp-light)', border: '1px solid var(--lp-border-light)', borderRadius: 12 }}>
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">Amount</span>
          <div className="mt-2 flex items-baseline gap-3">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              className="no-spinner flex-1 bg-transparent font-sans text-[34px] font-extrabold tracking-[-0.025em] tabular-nums focus:outline-none placeholder:text-[var(--lp-text-muted)] text-[var(--lp-dark)] min-w-0"
              placeholder="0.00"
            />
            <span className="mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">USDC</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-auto w-full inline-flex items-center justify-center gap-2 px-5 py-4 mono text-[13px] font-bold uppercase tracking-[0.08em] transition-[transform,box-shadow] duration-150 bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          style={{ borderRadius: 14, boxShadow: canSubmit ? '0 4px 0 rgba(0,0,0,0.22)' : 'none' }}
        >
          {phase === 'sending' && (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="animate-spin motion-reduce:animate-none" aria-hidden>
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
              <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          {phase === 'sending'
            ? 'Working…'
            : mode === 'add'
              ? 'Add to balance'
              : mode === 'fund'
                ? `Fund ${agent} agent`
                : 'Cash out'}
        </button>

        {phase === 'done' && (
          <p className="mono text-[11px] uppercase tracking-[0.12em] font-bold" style={{ color: POSITIVE }}>
            {mode === 'add' ? 'Added to your balance.' : mode === 'fund' ? 'Agent funded.' : 'Cash out started.'}
          </p>
        )}
        {phase === 'error' && error && (
          <p className="text-[12.5px] leading-snug" style={{ color: CRITICAL }}>
            {error}
          </p>
        )}
      </form>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">{label}</span>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function Pill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="px-3 py-2.5 mono text-[10px] uppercase tracking-[0.1em] font-bold capitalize transition-colors text-[var(--lp-dark)]"
      style={{
        background: active ? 'rgba(175,201,91,0.12)' : 'var(--lp-card)',
        border: active ? '1px solid var(--lp-accent)' : '1px solid var(--lp-border-light)',
        borderRadius: 10,
      }}
    >
      {label}
    </button>
  );
}
