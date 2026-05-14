'use client';
import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Card } from '@/shared/components/Card';
import { SOURCE_CHAINS, type SourceChainConfig } from '../config';
import { useBridges, type BridgePhase, type BridgeRecord } from '../hooks/useBridge';
import { shortAddress, shortHash, formatUsdc } from '@/shared/utils/format';

const ARC_EXPLORER_TX = (h: string) => `https://testnet.arcscan.app/tx/${h}`;

const STEP_ORDER: BridgePhase[] = ['approving', 'burning', 'attesting', 'minting', 'done'];

const CHAIN_MARK: Record<string, { letter: string; bg: string; fg: string; name: string }> = {
  baseSepolia: { letter: 'B', bg: '#0052FF', fg: '#FFFFFF', name: 'Base' },
  sepolia:     { letter: 'E', bg: '#627EEA', fg: '#FFFFFF', name: 'Ethereum' },
  arc:         { letter: 'A', bg: '#0E5E3E', fg: '#FFFFFF', name: 'Arc' },
};

function stepIndexFor(phase: BridgePhase): number {
  if (phase === 'error') return -1;
  if (phase === 'switching') return 0;
  if (phase === 'relaying') return 2;
  return STEP_ORDER.indexOf(phase);
}

function elapsed(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function phaseLabel(phase: BridgePhase): string {
  switch (phase) {
    case 'switching':
      return 'Switching chain';
    case 'approving':
      return 'Approving USDC';
    case 'burning':
      return 'Burning';
    case 'relaying':
      return 'Submitting to relay';
    case 'attesting':
      return 'Waiting for attestation';
    case 'minting':
      return 'Minting on Arc';
    case 'done':
      return 'Bridged';
    case 'error':
      return 'Failed';
  }
}

function phaseTone(phase: BridgePhase): 'live' | 'positive' | 'critical' {
  if (phase === 'done') return 'positive';
  if (phase === 'error') return 'critical';
  return 'live';
}

function ChainMark({ which, size = 22 }: { which: string; size?: number }) {
  const m = CHAIN_MARK[which] ?? CHAIN_MARK.arc!;
  return (
    <span
      className="inline-flex items-center justify-center rounded-[6px] font-bold mono shrink-0 select-none"
      style={{
        width: size,
        height: size,
        background: m.bg,
        color: m.fg,
        fontSize: size * 0.5,
        letterSpacing: 0,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14)',
      }}
      aria-label={m.name}
    >
      {m.letter}
    </span>
  );
}

function RouteGlyph({ from, size = 22 }: { from: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ChainMark which={from} size={size} />
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden className="text-[var(--color-ink-faint)]">
        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <ChainMark which="arc" size={size} />
    </span>
  );
}

export function BridgeCard({ mintRecipient }: { mintRecipient?: `0x${string}` }) {
  const { isConnected } = useAccount();
  const { bridges, start, retry, dismiss, isActive } = useBridges();
  const [sourceKey, setSourceKey] = useState<SourceChainConfig['key']>('baseSepolia');
  const [amount, setAmount] = useState<number | ''>(5);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const source = SOURCE_CHAINS[sourceKey];
  const canSubmit =
    isConnected && typeof amount === 'number' && amount > 0 && !!mintRecipient;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !mintRecipient) return;
    start({ sourceChainKey: sourceKey, amountUsdc: amount as number, mintRecipient });
  }

  if (!mintRecipient) {
    return (
      <Card>
        <p className="text-[13px] text-[var(--color-ink-faint)]">
          Buyer agent address is not configured.
        </p>
      </Card>
    );
  }

  const activeCount = bridges.filter((b) => isActive(b.phase)).length;

  return (
    <Card noPadding>
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="display text-[28px] text-[var(--color-ink)]">
            Top up agent
          </h2>
          <p className="text-[12px] mono text-[var(--color-ink-faint)] mt-1 tracking-tight">
            cross-chain via CCTP V2
          </p>
        </div>
        {activeCount > 0 && (
          <span
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.12em] shrink-0"
            style={{
              background: 'color-mix(in oklab, var(--color-accent) 10%, transparent)',
              color: 'var(--color-accent)',
              border: '1px solid color-mix(in oklab, var(--color-accent) 35%, transparent)',
            }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--color-accent)] opacity-60 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            </span>
            {activeCount} in flight
          </span>
        )}
      </div>

      <div className="px-5 pb-5">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-2.5">
            {(Object.values(SOURCE_CHAINS) as SourceChainConfig[]).map((c) => {
              const active = sourceKey === c.key;
              return (
                <button
                  type="button"
                  key={c.key}
                  onClick={() => setSourceKey(c.key)}
                  className={`relative text-left px-3 py-3 rounded-lg border transition-all ${
                    active
                      ? 'border-[var(--color-ink)] bg-[var(--color-surface-2)]'
                      : 'border-[var(--color-line)] hover:border-[var(--color-line-strong)] bg-[var(--color-surface)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <ChainMark which={c.key} size={28} />
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold tracking-tight leading-tight">{c.name.replace(' Sepolia', '')}</p>
                      <p className="text-[10px] mono text-[var(--color-ink-faint)] mt-0.5">
                        Sepolia · d{c.domain}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] focus-within:border-[var(--color-ink)] transition-colors">
            <div className="px-4 pt-3 pb-1 flex items-baseline justify-between">
              <span className="eyebrow">Amount</span>
              <span className="text-[10px] mono text-[var(--color-ink-faint)]">
                USDC · 6 decimals
              </span>
            </div>
            <div className="px-4 pb-3 flex items-baseline gap-3">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                className="no-spinner flex-1 bg-transparent text-[32px] font-medium tracking-tight tabular-nums focus:outline-none placeholder:text-[var(--color-ink-faint)] min-w-0"
                style={{ fontFamily: 'var(--font-serif)' }}
                placeholder="0"
              />
              <span className="text-[14px] mono text-[var(--color-ink-dim)] font-semibold">USDC</span>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface-2)] px-4 py-3 flex items-center gap-3">
            <AgentAvatar address={mintRecipient} />
            <div className="flex-1 min-w-0">
              <p className="eyebrow">Mints to</p>
              <p className="text-[13px] mono truncate mt-0.5">{shortAddress(mintRecipient)}</p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] mono text-[var(--color-ink-faint)] shrink-0">
              <ChainMark which="arc" size={18} />
              <span>Arc Testnet</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="group relative w-full px-4 py-3 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 overflow-hidden"
            style={{
              background: canSubmit
                ? 'linear-gradient(180deg, #1a1c1f 0%, #0c0e10 100%)'
                : '#0c0e10',
              color: '#ffffff',
              boxShadow: canSubmit ? '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 22px -10px rgba(12,14,16,0.45)' : 'none',
            }}
          >
            {isConnected ? (
              <>
                <span>Bridge from {source.shortName}</span>
                <span
                  aria-hidden
                  className="inline-flex transition-transform group-hover:translate-x-0.5"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </>
            ) : (
              'Connect wallet to bridge'
            )}
          </button>
        </form>

        {bridges.length > 0 && (
          <div className="mt-7 pt-5 border-t border-[var(--color-line)]">
            <div className="flex items-baseline justify-between mb-3.5">
              <h3 className="display text-[16px]">Activity</h3>
              <p className="text-[10px] mono text-[var(--color-ink-faint)]">
                {bridges.length} {bridges.length === 1 ? 'bridge' : 'bridges'}
              </p>
            </div>
            <ul className="space-y-2">
              {bridges.map((b) => (
                <BridgeRow
                  key={b.id}
                  bridge={b}
                  expanded={expandedId === b.id}
                  onToggle={() => setExpandedId(expandedId === b.id ? null : b.id)}
                  onRetry={() => retry(b.id)}
                  onDismiss={() => dismiss(b.id)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function AgentAvatar({ address }: { address: string }) {
  const hue = parseInt(address.slice(2, 8), 16) % 360;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{
        width: 26,
        height: 26,
        background: `conic-gradient(from 210deg at 50% 50%, hsl(${hue} 65% 55%), hsl(${(hue + 80) % 360} 55% 45%), hsl(${(hue + 200) % 360} 60% 50%), hsl(${hue} 65% 55%))`,
        boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.55), 0 1px 2px rgba(0,0,0,0.12)',
      }}
      aria-hidden
    />
  );
}

function BridgeRow({
  bridge,
  expanded,
  onToggle,
  onRetry,
  onDismiss,
}: {
  bridge: BridgeRecord;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const source = SOURCE_CHAINS[bridge.sourceChainKey];
  const tone = phaseTone(bridge.phase);
  const idx = stepIndexFor(bridge.phase);

  return (
    <li
      className={`rounded-lg border transition-all overflow-hidden ${
        expanded
          ? 'border-[var(--color-ink)] bg-[var(--color-surface-2)]'
          : 'border-[var(--color-line)] hover:border-[var(--color-line-strong)] bg-[var(--color-surface)]'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-3 flex items-center gap-3"
      >
        <RouteGlyph from={bridge.sourceChainKey} size={22} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span
              className="text-[18px] font-medium tabular-nums leading-none tracking-tight"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {formatUsdc(bridge.amountUsdc, { withSuffix: false })}
            </span>
            <span className="text-[10px] mono uppercase tracking-[0.1em] text-[var(--color-ink-faint)] leading-none">
              USDC
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <PhaseDot tone={tone} pulse={tone === 'live'} />
            <span
              className={`text-[11px] font-medium leading-none ${
                tone === 'positive'
                  ? 'text-[var(--color-positive)]'
                  : tone === 'critical'
                  ? 'text-[var(--color-critical)]'
                  : 'text-[var(--color-ink-dim)]'
              }`}
            >
              {phaseLabel(bridge.phase)}
            </span>
            <span className="text-[10px] mono text-[var(--color-ink-faint)] leading-none">
              · {elapsed(bridge.startedAt)}
            </span>
          </div>
        </div>
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className={`text-[var(--color-ink-faint)] transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="px-3 pb-3">
        <SegmentedProgress idx={idx} tone={tone} />
      </div>

      {expanded && (
        <div className="border-t border-[var(--color-line)] px-3 py-3 space-y-3">
          <BridgeSteps bridge={bridge} />

          {bridge.error && (
            <div
              className="rounded-md px-2.5 py-2"
              style={{
                border: '1px solid color-mix(in oklab, var(--color-critical) 30%, transparent)',
                background: 'color-mix(in oklab, var(--color-critical) 8%, transparent)',
              }}
            >
              <p className="text-[12px] text-[var(--color-critical)] leading-snug">{bridge.error}</p>
            </div>
          )}

          {(bridge.burnTxHash || bridge.mintTxHash) && (
            <div className="space-y-1.5">
              {bridge.burnTxHash && (
                <a
                  href={source.explorerTx(bridge.burnTxHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-baseline justify-between gap-3 text-[11px] hover:text-[var(--color-ink)] text-[var(--color-ink-dim)] py-0.5"
                >
                  <span className="eyebrow">Burn · {source.shortName}</span>
                  <span className="mono inline-flex items-center gap-1">
                    {shortHash(bridge.burnTxHash)}
                    <ExternalIcon />
                  </span>
                </a>
              )}
              {bridge.mintTxHash && (
                <a
                  href={ARC_EXPLORER_TX(bridge.mintTxHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-baseline justify-between gap-3 text-[11px] hover:text-[var(--color-ink)] text-[var(--color-ink-dim)] py-0.5"
                >
                  <span className="eyebrow">Mint · Arc</span>
                  <span className="mono inline-flex items-center gap-1">
                    {shortHash(bridge.mintTxHash)}
                    <ExternalIcon />
                  </span>
                </a>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 pt-0.5">
            {bridge.phase === 'error' && (
              <button
                type="button"
                onClick={onRetry}
                style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
                className="px-3 py-1.5 rounded-md text-[12px] font-semibold hover:opacity-90 transition-opacity"
              >
                Retry
              </button>
            )}
            {(bridge.phase === 'done' || bridge.phase === 'error') && (
              <button
                type="button"
                onClick={onDismiss}
                className="px-3 py-1.5 rounded-md text-[12px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface)] transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function SegmentedProgress({ idx, tone }: { idx: number; tone: 'live' | 'positive' | 'critical' }) {
  const segments = ['Approve', 'Burn', 'Attest', 'Mint'];
  const fillColor =
    tone === 'positive'
      ? 'var(--color-positive)'
      : tone === 'critical'
      ? 'var(--color-critical)'
      : 'var(--color-accent)';

  return (
    <div className="flex items-center gap-1">
      {segments.map((label, i) => {
        const done = idx > i || tone === 'positive';
        const active = idx === i && tone === 'live';
        const failed = tone === 'critical' && idx === i;
        return (
          <div
            key={label}
            className="relative flex-1 h-[3px] rounded-full overflow-hidden"
            style={{ background: 'var(--color-line)' }}
          >
            <span
              className="absolute inset-0 transition-all duration-500"
              style={{
                background: done || failed ? fillColor : 'transparent',
                width: '100%',
              }}
            />
            {active && (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-1/2"
                style={{
                  background: `linear-gradient(90deg, transparent 0%, ${fillColor} 50%, transparent 100%)`,
                  animation: 'bridgeShimmer 1.6s ease-in-out infinite',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function BridgeSteps({ bridge }: { bridge: BridgeRecord }) {
  const source = SOURCE_CHAINS[bridge.sourceChainKey];
  const idx = stepIndexFor(bridge.phase);
  const errored = bridge.phase === 'error';
  const steps: Array<{ key: BridgePhase; label: string; hint?: string }> = [
    { key: 'approving', label: `Approve on ${source.shortName}` },
    { key: 'burning', label: `Burn on ${source.shortName}` },
    { key: 'attesting', label: 'Circle attestation', hint: '~10–19 min' },
    { key: 'minting', label: 'Mint on Arc' },
  ];

  return (
    <ol className="space-y-2">
      {steps.map((s) => {
        const stepIdx = STEP_ORDER.indexOf(s.key);
        const done = !errored && (idx > stepIdx || bridge.phase === 'done');
        const active = !errored && idx === stepIdx;
        const failedHere = errored && idx === stepIdx;
        return (
          <li key={s.key} className="flex items-center gap-2.5">
            <span
              className={`relative shrink-0 w-3.5 h-3.5 rounded-full grid place-items-center ${
                done
                  ? 'bg-[var(--color-positive)] text-white'
                  : active
                  ? 'bg-[var(--color-accent)] text-white'
                  : failedHere
                  ? 'bg-[var(--color-critical)] text-white'
                  : 'bg-[var(--color-surface)] border border-[var(--color-line)]'
              }`}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'var(--color-accent)',
                    opacity: 0.4,
                    animation: 'flowPulse 1.8s ease-out infinite',
                  }}
                />
              )}
              {done && (
                <svg width="8" height="8" viewBox="0 0 16 16" fill="none" className="relative">
                  <path
                    d="M3 8.5 L6.5 12 L13 5"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            <span
              className={`text-[12px] flex-1 ${
                done || active
                  ? 'text-[var(--color-ink)] font-medium'
                  : 'text-[var(--color-ink-faint)]'
              }`}
            >
              {s.label}
            </span>
            {active && s.hint && (
              <span className="text-[10px] mono uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
                {s.hint}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function PhaseDot({ tone, pulse }: { tone: 'live' | 'positive' | 'critical'; pulse: boolean }) {
  const color =
    tone === 'positive'
      ? 'var(--color-positive)'
      : tone === 'critical'
      ? 'var(--color-critical)'
      : 'var(--color-accent)';
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0">
      {pulse && (
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
          style={{ background: color }}
        />
      )}
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

function ExternalIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M5.5 4.5h6v6M11 5l-6.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
