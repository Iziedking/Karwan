/// Earnings on the escrow family land on the selling agent, the deal's payee.
/// After each payout the selling agent sends exactly what that payout paid on to
/// the seller's identity wallet, where their record lives. Until the move is
/// proven by its receipt it is kept on the deal as pending: the money is still
/// the person's, counted in their balance on the selling agent, and retried.

const RETRY_AFTER_MS = 5 * 60_000;

export interface EarningsMove {
  amountMicros: string;
  state: 'pending' | 'moved';
  /// Each attempt is its own Circle request; a retry of an attempt that never
  /// returned a hash repeats its request so Circle matches it instead of paying twice.
  attempt: number;
  txHash?: string;
  lastError?: string;
  at: number;
}

export interface SuiteEarningsDeal {
  jobId: string;
  seller: string;
  escrowVersion?: 'v2' | 'v3' | 'suite';
  sellerAgentWalletId?: string;
  sellerAgentAddress?: string;
  suiteEarnings?: Record<string, EarningsMove>;
}

export type TransferProof = 'landed' | 'reverted' | 'unknown';

export interface SuiteEarningsDeps {
  getDeal(jobId: string): Promise<SuiteEarningsDeal | null>;
  saveMove(jobId: string, key: string, move: EarningsMove): Promise<void>;
  listDeals(): Promise<SuiteEarningsDeal[]>;
  transfer(input: { walletId: string; to: string; amountMicros: bigint; idempotencyKey: string }): Promise<{ txHash: string }>;
  /// 'landed' only for a successful receipt holding the USDC transfer to the identity wallet.
  transferProof(txHash: string, move: { from: string; to: string; amountMicros: bigint }): Promise<TransferProof>;
  now(): number;
  log(context: Record<string, unknown>, message: string): void;
}

export interface SweepInput {
  jobId: string;
  /// The payout this move belongs to (the tranche index), so a payout is moved once.
  payoutKey: string;
  sellerAgent: { walletId: string; address: string };
  identityWallet: string;
  releasedMicros: bigint;
}

export type SweepResult = { txHash: string } | { pending: true };

interface PayoutEvent {
  type: string;
  jobId?: string;
  payload?: Record<string, unknown>;
}

export function createSuiteEarnings(deps: SuiteEarningsDeps) {
  const busy = new Set<string>();

  async function send(input: SweepInput, attempt: number): Promise<SweepResult> {
    const base: Omit<EarningsMove, 'state'> = { amountMicros: input.releasedMicros.toString(), attempt, at: deps.now() };
    // Written before the request, so a crash mid-send is retried with the same request.
    await deps.saveMove(input.jobId, input.payoutKey, { ...base, state: 'pending' });
    try {
      const { txHash } = await deps.transfer({
        walletId: input.sellerAgent.walletId,
        to: input.identityWallet,
        amountMicros: input.releasedMicros,
        idempotencyKey: `earnings:${input.jobId}:${input.payoutKey}:${attempt}`,
      });
      const proof = await deps.transferProof(txHash, { from: input.sellerAgent.address, to: input.identityWallet, amountMicros: input.releasedMicros });
      if (proof === 'landed') {
        await deps.saveMove(input.jobId, input.payoutKey, { ...base, state: 'moved', txHash });
        return { txHash };
      }
      await deps.saveMove(input.jobId, input.payoutKey, { ...base, state: 'pending', txHash, lastError: `the move ${proof === 'reverted' ? 'reverted' : 'is not on chain yet'}` });
    } catch (err) {
      await deps.saveMove(input.jobId, input.payoutKey, { ...base, state: 'pending', lastError: (err as Error).message });
    }
    deps.log({ jobId: input.jobId, payout: input.payoutKey, attempt }, 'earnings move to the identity wallet is pending');
    return { pending: true };
  }

  async function locked<T>(key: string, run: () => Promise<T>): Promise<T | null> {
    if (busy.has(key)) return null;
    busy.add(key);
    try {
      return await run();
    } finally {
      busy.delete(key);
    }
  }

  function sweepInput(deal: SuiteEarningsDeal, payoutKey: string, releasedMicros: bigint): SweepInput | null {
    if (deal.escrowVersion !== 'suite' || !deal.sellerAgentWalletId || !deal.sellerAgentAddress) return null;
    return {
      jobId: deal.jobId,
      payoutKey,
      sellerAgent: { walletId: deal.sellerAgentWalletId, address: deal.sellerAgentAddress },
      identityWallet: deal.seller,
      releasedMicros,
    };
  }

  async function sweepEarnings(input: SweepInput): Promise<SweepResult | null> {
    return locked(`${input.jobId}:${input.payoutKey}`, async () => {
      const prior = (await deps.getDeal(input.jobId))?.suiteEarnings?.[input.payoutKey];
      if (prior?.state === 'moved') return { txHash: prior.txHash ?? '' };
      if (prior) return { pending: true } as const;
      return send(input, 1);
    });
  }

  return {
    sweepEarnings,

    /// The bus handler for a payout, ruling or split. Anything that is not a suite deal's is ignored.
    async onPayout(event: PayoutEvent): Promise<SweepResult | null> {
      if (!event.jobId) return null;
      // A tranche payout is keyed by its index; a ruling or split by its transaction.
      const key =
        event.type === 'escrow.milestone.released' ? String(event.payload?.milestoneIndex ?? '')
          : event.type === 'escrow.seller.paid' ? String(event.payload?.payoutKey ?? '')
            : '';
      const micros = BigInt(String(event.payload?.sellerMicros ?? '0'));
      if (!key || micros <= 0n) return null;
      const deal = await deps.getDeal(event.jobId);
      const input = deal && sweepInput(deal, key, micros);
      return input ? sweepEarnings(input) : null;
    },

    /// Walks every pending move once. A move with a hash is first proven; it is
    /// sent again only when its receipt shows it reverted. Returns the moves
    /// that are now done.
    async retryPending(): Promise<number> {
      let moved = 0;
      for (const deal of await deps.listDeals()) {
        for (const [key, move] of Object.entries(deal.suiteEarnings ?? {})) {
          if (move.state !== 'pending' || deps.now() - move.at < RETRY_AFTER_MS) continue;
          const input = sweepInput(deal, key, BigInt(move.amountMicros));
          if (!input) continue;
          const done = await locked(`${deal.jobId}:${key}`, async () => {
            if (move.txHash) {
              const proof = await deps.transferProof(move.txHash, { from: input.sellerAgent.address, to: input.identityWallet, amountMicros: input.releasedMicros });
              if (proof === 'landed') {
                await deps.saveMove(deal.jobId, key, { ...move, state: 'moved', at: deps.now() });
                return true;
              }
              if (proof === 'unknown') return false;
              return 'txHash' in (await send(input, move.attempt + 1));
            }
            return 'txHash' in (await send(input, move.attempt));
          });
          if (done) moved += 1;
        }
      }
      return moved;
    },

    /// Earnings still on the selling agent, waiting to move.
    pendingFor(deal: SuiteEarningsDeal): { micros: bigint; count: number } {
      const pending = Object.values(deal.suiteEarnings ?? {}).filter((m) => m.state === 'pending');
      return { micros: pending.reduce((s, m) => s + BigInt(m.amountMicros), 0n), count: pending.length };
    },
  };
}

export type SuiteEarnings = ReturnType<typeof createSuiteEarnings>;
