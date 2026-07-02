'use client';
import { useEffect, useState } from 'react';
import { ChainLogo } from '@/shared/components/ChainLogo';
import { shortHash, formatUsdc } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';
import { ARC_TESTNET } from '../config';
import { bridgeChainMeta, type BridgePhase, type BridgeRecord } from '../hooks/useBridge';

/// Completed / failed rows linger this long in the temporary strip, then clear
/// themselves. In-progress rows always show until they finish. The permanent
/// record lives in the Transfer history modal and the /activity feed.
const EXPIRE_MS = 5 * 60 * 1000;

type Tone = 'live' | 'positive' | 'critical';

function toneOf(phase: BridgePhase): Tone {
  if (phase === 'done') return 'positive';
  if (phase === 'error') return 'critical';
  return 'live';
}

function railColor(tone: Tone): string {
  return tone === 'positive' ? '#0a7553' : tone === 'critical' ? '#b03d3a' : 'var(--lp-accent)';
}

/// Direction-aware status label, reusing the existing phase copy so the strip
/// reads the same words as the rest of the surface.
function statusLabel(bridge: BridgeRecord, msgs: Messages, otherShort: string): string {
  const p = bridge.phase;
  if (bridge.direction === 'out') {
    const ph = msgs.bridgeOut.phases;
    switch (p) {
      case 'approving':
      case 'burning':
        return ph.burning;
      case 'relaying':
      case 'attesting':
        return ph.waitingAttestation;
      case 'minting':
        return ph.mintingTemplate.replace('{dest}', otherShort);
      case 'done':
        return ph.done;
      case 'error':
        return ph.error;
      default:
        return ph.submitting;
    }
  }
  const ph = msgs.bridgeCard.row.phase;
  switch (p) {
    case 'switching':
      return ph.switchingChain;
    case 'approving':
      return ph.approving;
    case 'burning':
      return ph.burning;
    case 'relaying':
      return ph.relaying;
    case 'attesting':
      return ph.attesting;
    case 'minting':
      return ph.minting;
    case 'done':
      return ph.done;
    case 'error':
      return ph.error;
    default:
      return ph.approving;
  }
}

/// The tx to link to, resolved to the right explorer. For an inbound bridge the
/// burn is on the source chain and the mint is on Arc; for an outbound one it's
/// the reverse. We surface the final leg when we have it, else the burn.
function explorerLink(bridge: BridgeRecord): { href: string; hash: string } | null {
  const other = bridgeChainMeta(bridge.sourceChainKey);
  const isOut = bridge.direction === 'out';
  if (bridge.mintTxHash) {
    return {
      href: isOut ? other.explorerTx(bridge.mintTxHash) : ARC_TESTNET.explorerTx(bridge.mintTxHash),
      hash: bridge.mintTxHash,
    };
  }
  if (bridge.burnTxHash) {
    return {
      href: isOut ? ARC_TESTNET.explorerTx(bridge.burnTxHash) : other.explorerTx(bridge.burnTxHash),
      hash: bridge.burnTxHash,
    };
  }
  return null;
}

function RouteGlyph({ bridge }: { bridge: BridgeRecord }) {
  const isOut = bridge.direction === 'out';
  const left = isOut ? 'arc' : bridge.sourceChainKey;
  const right = isOut ? bridge.sourceChainKey : 'arc';
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <ChainLogo chain={left as never} size={20} />
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden className="text-[var(--lp-text-muted)]">
        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <ChainLogo chain={right as never} size={20} />
    </span>
  );
}

/// Temporary transfer strip shown under the bridge card. It shows only recent
/// activity: everything in flight, plus terminal rows for a few minutes after
/// they finish. Dismissing a row (or Clear) hides it from THIS strip via the
/// per-device hidden set; it never touches the permanent history or /activity.
export function BridgeActivityStrip({
  records,
  hidden,
  isActive,
}: {
  /// Direction-filtered bridge records, newest first.
  records: BridgeRecord[];
  hidden: { set: Set<string>; hide: (id: string) => void; hideMany: (ids: string[]) => void };
  isActive: (phase: BridgePhase) => boolean;
}) {
  const msgs = useTranslations();
  const [now, setNow] = useState(() => Date.now());
  // Re-evaluate expiry on a slow tick so finished rows fall off on their own.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const visible = records.filter(
    (b) => !hidden.set.has(b.id) && (isActive(b.phase) || now - b.updatedAt < EXPIRE_MS),
  );
  if (visible.length === 0) return null;

  // Everything is clearable: the strip is a temporary view and hiding a row is
  // display-only. An in-flight transfer keeps progressing on chain/backend and
  // stays in the permanent Transfer history and /activity either way.
  const clearableIds = visible.map((b) => b.id);

  return (
    <div className="mt-7 pt-5 border-t border-[var(--lp-border-light)]">
      <div className="flex items-center justify-between gap-3">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          {msgs.bridgeCard.eyebrow.activity}
        </span>
        {clearableIds.length > 0 && (
          <button
            type="button"
            onClick={() => hidden.hideMany(clearableIds)}
            className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
          >
            {msgs.bridgeOut.clearActivity}
          </button>
        )}
      </div>
      <ul className="mt-3.5 space-y-2">
        {visible.map((b) => {
          const tone = toneOf(b.phase);
          const rail = railColor(tone);
          const other = bridgeChainMeta(b.sourceChainKey);
          const link = explorerLink(b);
          const active = isActive(b.phase);
          return (
            <li
              key={b.id}
              className="relative overflow-hidden p-3 ps-4"
              style={{
                background: 'var(--lp-card)',
                border: '1px solid var(--lp-border-light)',
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              <span aria-hidden className="absolute start-0 top-0 bottom-0 w-[3px]" style={{ background: rail }} />
              <div className="flex items-center gap-3">
                <RouteGlyph bridge={b} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-sans text-[16px] font-extrabold tabular-nums leading-none tracking-[-0.02em] text-[var(--lp-dark)]">
                      {formatUsdc(b.amountUsdc, { withSuffix: false })}
                    </span>
                    <span className="text-[10px] mono uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-none">
                      USDC
                    </span>
                  </div>
                  <p
                    className="mt-1.5 mono text-[10px] uppercase tracking-[0.14em] leading-none inline-flex items-center gap-2"
                    style={{ color: rail }}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className="inline-block w-[5px] h-[5px] rounded-full motion-safe:animate-pulse"
                        style={{ background: rail }}
                      />
                    )}
                    <span>{statusLabel(b, msgs, other.shortName)}</span>
                    {link && (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] underline-offset-2 hover:underline normal-case"
                      >
                        {shortHash(link.hash)} ↗
                      </a>
                    )}
                  </p>
                  {b.error && <p className="mt-1 text-[11px] leading-snug text-[#b03d3a]">{b.error}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => hidden.hide(b.id)}
                  aria-label="Dismiss"
                  className="shrink-0 text-[16px] leading-none text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors px-1"
                >
                  ×
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
