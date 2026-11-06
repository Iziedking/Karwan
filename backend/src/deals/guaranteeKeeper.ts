/// A seller's deal guarantee is never left behind (view 62, audit CR-02).
///
/// The Agreement escrow asks the stake vault to keep, pay out of, or free a
/// seller's guarantee. A vault that refuses never blocks the deal: the escrow
/// records `StakeHookFailed` and moves on. This pass compares each guarantee
/// with what its deal needs and does what the chain allows. A keep is retried
/// with `keepStake`, and a closed deal's guarantee that ran out is freed with
/// `releaseStale`. Anything else goes to a person. Nothing here pays anyone.

/// `AgreementState` in contracts/src/suite/agreement/AgreementTypes.sol.
export const AGREEMENT = {
  None: 0,
  Funded: 1,
  Accepted: 2,
  Disputed: 3,
  Settled: 4,
  Refunded: 5,
  Reclaimed: 6,
  Split: 7,
  Ruled: 8,
  Longstopped: 9,
} as const;

/// `SettlementLib.LONGSTOP` plus `AgreementCommon.STAKE_SLACK`, in seconds.
const LONGSTOP_S = 180n * 86_400n;
const STAKE_SLACK_S = 30n * 86_400n;

export const KEEP_TRIES_BEFORE_HOLD = 3;

export interface GuaranteeRead {
  state: number;
  sellerStake: bigint;
  /// The deal's horizon, unix seconds.
  horizon: bigint;
  /// `KarwanStakeVault.expiryOf(escrow, dealId)`: when the reservation ends, 0 when nothing is reserved.
  expiry: bigint;
}

export type GuaranteeStep =
  | { kind: 'none' }
  | { kind: 'keep' }
  | { kind: 'lapsed' }
  | { kind: 'releaseStale' }
  | { kind: 'waitFree'; freesAt: bigint };

export function guaranteeNeed(horizon: bigint): bigint {
  return horizon + LONGSTOP_S + STAKE_SLACK_S;
}

export function guaranteeStep(g: GuaranteeRead, nowS: bigint): GuaranteeStep {
  if (g.state === AGREEMENT.Accepted || g.state === AGREEMENT.Disputed) {
    if (g.sellerStake === 0n) return { kind: 'none' };
    if (g.expiry === 0n || g.expiry < nowS) return { kind: 'lapsed' };
    return g.expiry < guaranteeNeed(g.horizon) ? { kind: 'keep' } : { kind: 'none' };
  }
  if (g.state === AGREEMENT.None || g.state === AGREEMENT.Funded || g.expiry === 0n) return { kind: 'none' };
  return g.expiry < nowS ? { kind: 'releaseStale' } : { kind: 'waitFree', freesAt: g.expiry };
}

export type HoldReason =
  | 'GUARANTEE_KEEP_FAILED'
  | 'GUARANTEE_LAPSED'
  | 'GUARANTEE_NOT_FREED'
  | 'GUARANTEE_PAYOUT_FAILED';

/// Held until a person looks: the pass never clears these.
const STICKY: ReadonlySet<HoldReason> = new Set(['GUARANTEE_LAPSED', 'GUARANTEE_PAYOUT_FAILED']);

export interface GuaranteeHold {
  dealId: string;
  jobId: string | null;
  reason: HoldReason;
  at: number;
  keepFailures: number;
  alertedAt: number | null;
  /// When the reservation runs out and anyone may free it (ms).
  freesAt?: number;
  /// The transaction whose payment to the buyer failed.
  txHash?: string;
}

export interface GuaranteeDeps {
  /// Open and closed suite Agreement deals Karwan knows, by escrow deal id.
  deals(): Promise<Array<{ jobId: string; dealId: string }>>;
  read(dealId: string): Promise<GuaranteeRead>;
  keep(dealId: string): Promise<void>;
  releaseStale(dealId: string): Promise<void>;
  /// `StakeHookFailed` records with hook 1 (pay the buyer) not seen before.
  failedPayouts(): Promise<Array<{ dealId: string; txHash: string }>>;
  getHold(dealId: string): Promise<GuaranteeHold | null>;
  putHold(h: GuaranteeHold): Promise<void>;
  clearHold(dealId: string): Promise<void>;
  alert(text: string): Promise<void>;
  now(): number;
}

export interface GuaranteeReport {
  kept: string[];
  freed: string[];
  held: string[];
  errors: string[];
}

const ALERT: Record<HoldReason, string> = {
  GUARANTEE_KEEP_FAILED: 'the vault keeps refusing to reserve the seller’s deal guarantee past the deal',
  GUARANTEE_LAPSED: 'the seller’s deal guarantee is no longer reserved while the deal is open, so a ruling cannot pay the buyer from it',
  GUARANTEE_NOT_FREED: 'the seller’s deal guarantee was not freed when the deal ended',
  GUARANTEE_PAYOUT_FAILED: 'a ruling’s payment to the buyer from the seller’s deal guarantee failed, and the contract cannot retry it',
};

async function hold(
  deps: GuaranteeDeps,
  base: { dealId: string; jobId: string | null; reason: HoldReason; keepFailures?: number; freesAt?: number; txHash?: string },
): Promise<void> {
  const current = await deps.getHold(base.dealId);
  if (current && STICKY.has(current.reason) && current.reason !== base.reason) return;
  const now = deps.now();
  const next: GuaranteeHold = {
    dealId: base.dealId,
    jobId: base.jobId,
    reason: base.reason,
    at: current?.reason === base.reason ? current.at : now,
    keepFailures: base.keepFailures ?? current?.keepFailures ?? 0,
    alertedAt: current?.reason === base.reason ? current.alertedAt : null,
    ...(base.freesAt !== undefined ? { freesAt: base.freesAt } : {}),
    ...(base.txHash !== undefined ? { txHash: base.txHash } : current?.txHash ? { txHash: current.txHash } : {}),
  };
  if (next.alertedAt === null) {
    await deps.alert(`Deal guarantee to check. Deal ${base.jobId ?? base.dealId}: ${ALERT[base.reason]}. Admin, support, Deal guarantees to check.`);
    next.alertedAt = now;
  }
  await deps.putHold(next);
}

export async function runGuaranteePass(deps: GuaranteeDeps): Promise<GuaranteeReport> {
  const report: GuaranteeReport = { kept: [], freed: [], held: [], errors: [] };
  const deals = await deps.deals();
  const jobOf = new Map(deals.map((d) => [d.dealId.toLowerCase(), d.jobId]));

  for (const p of await deps.failedPayouts()) {
    await hold(deps, { dealId: p.dealId, jobId: jobOf.get(p.dealId.toLowerCase()) ?? null, reason: 'GUARANTEE_PAYOUT_FAILED', txHash: p.txHash });
    report.held.push(p.dealId);
  }

  for (const { jobId, dealId } of deals) {
    try {
      const g = await deps.read(dealId);
      const nowS = BigInt(Math.floor(deps.now() / 1000));
      const step = guaranteeStep(g, nowS);
      const current = await deps.getHold(dealId);
      if (step.kind === 'keep') {
        await deps.keep(dealId).catch(() => undefined);
        const after = await deps.read(dealId);
        if (guaranteeStep(after, nowS).kind === 'none') {
          report.kept.push(dealId);
          if (current && !STICKY.has(current.reason)) await deps.clearHold(dealId);
          continue;
        }
        const keepFailures = (current?.keepFailures ?? 0) + 1;
        if (keepFailures >= KEEP_TRIES_BEFORE_HOLD) {
          await hold(deps, { dealId, jobId, reason: 'GUARANTEE_KEEP_FAILED', keepFailures });
          report.held.push(dealId);
        } else {
          await deps.putHold({
            dealId,
            jobId,
            reason: 'GUARANTEE_KEEP_FAILED',
            at: current?.at ?? deps.now(),
            keepFailures,
            alertedAt: null,
          });
        }
        continue;
      }
      if (step.kind === 'lapsed') {
        await hold(deps, { dealId, jobId, reason: 'GUARANTEE_LAPSED' });
        report.held.push(dealId);
        continue;
      }
      if (step.kind === 'releaseStale') {
        await deps.releaseStale(dealId);
        report.freed.push(dealId);
        if (current && !STICKY.has(current.reason)) await deps.clearHold(dealId);
        continue;
      }
      if (step.kind === 'waitFree') {
        await hold(deps, { dealId, jobId, reason: 'GUARANTEE_NOT_FREED', freesAt: Number(step.freesAt) * 1000 });
        report.held.push(dealId);
        continue;
      }
      if (current && !STICKY.has(current.reason)) await deps.clearHold(dealId);
    } catch {
      report.errors.push(dealId);
    }
  }
  return report;
}
