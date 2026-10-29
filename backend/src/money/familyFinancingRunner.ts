import { createWalletClient, formatUnits, type Hex, type TransactionReceipt } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcChain, arcTransport, publicClient } from '../chain/client.js';
import { settleOutcome, tradeFinanceAbi, vaultReservationAbi } from '../chain/tradeFinance.js';
import { addSystemMessage } from '../chat/systemMessages.js';
import { config } from '../config.js';
import { getDeal } from '../db/deals.js';
import { listOpenFamilyLines, patchFactoringOffer, type FactoringOffer } from '../db/factoring.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { settleDecision, type Receivable } from './familyFinancing.js';
import { familyFinancingPorts } from './familyFinancingLive.js';

/// Karwan settles each family line once its deal has ended, and keeps the
/// hold on the seller's deal guarantee while the deal can still run (view 18).
/// Anyone may call both on chain; Karwan's operator wallet pays the gas.

export type Outcome = NonNullable<ReturnType<typeof settleOutcome>>;

export interface RunnerDeps {
  lines(): Promise<FactoringOffer[]>;
  receivable(o: FactoringOffer): Promise<Receivable>;
  holdEnd(lineId: Hex): Promise<bigint>;
  send(fn: 'settle' | 'keepStake', lineId: Hex): Promise<TransactionReceipt>;
  patch(id: string, p: Partial<FactoringOffer>): Promise<void>;
  /// The seller and the financier each get one line: bell, email, Telegram.
  tell(o: FactoringOffer, outcome: Outcome): Promise<void>;
  log(message: string): void;
  now(): number;
}

const STATUS: Record<Outcome['state'], FactoringOffer['status']> = { repaid: 'repaid', defaulted: 'defaulted', waived: 'waived' };

export async function runFamilyFinancingPass(deps: RunnerDeps): Promise<void> {
  for (const o of await deps.lines()) {
    const lineId = o.lineId as Hex;
    try {
      const r = await deps.receivable(o);
      const step = settleDecision({ offer: o, r, holdEnd: await deps.holdEnd(lineId) });
      if (step === 'wait') continue;
      const receipt = await deps.send(step === 'settle' ? 'settle' : 'keepStake', lineId);
      if (step !== 'settle') continue;
      const outcome = settleOutcome(receipt.logs, lineId);
      if (!outcome) throw new Error('the settle receipt names no outcome for this line');
      await deps.patch(o.id, {
        status: STATUS[outcome.state],
        settledAt: deps.now(),
        settleTxHash: receipt.transactionHash,
        ...(outcome.fromGuaranteeMicros !== undefined ? { fromGuaranteeMicros: outcome.fromGuaranteeMicros.toString() } : {}),
      });
      await deps.tell(o, outcome);
    } catch (err) {
      deps.log(`financing runner: line ${lineId} on ${o.invoiceId} waits for the next pass (${(err as Error).message})`);
    }
  }
}

const EVERY_MS = 600_000;

/// The key that pays gas to settle: the yield operator's, never the treasury's.
export function settleKey(cfg: { OPERATOR_PRIVATE_KEY?: string; USYC_OPERATOR_PRIVATE_KEY?: string }): Hex | null {
  return (cfg.OPERATOR_PRIVATE_KEY as Hex | undefined) ?? null;
}

export function startFamilyFinancingRunner(): () => void {
  const ports = familyFinancingPorts;
  const key = settleKey(config);
  if (!ports) return () => {};
  if (!key) {
    logger.warn('financing runner: no operator key, family lines are not settled automatically');
    return () => {};
  }
  const { tradeFinance, vault } = ports.addresses;
  const wallet = createWalletClient({ account: privateKeyToAccount(key), chain: arcChain, transport: arcTransport });
  const deps: RunnerDeps = {
    lines: listOpenFamilyLines,
    receivable: async (o) => {
      const deal = await getDeal(o.invoiceId);
      if (!deal?.escrowDealId) throw new Error('deal not found');
      return ports.receivable(deal.escrowDealId as Hex);
    },
    holdEnd: (lineId) => publicClient.readContract({ address: vault, abi: vaultReservationAbi, functionName: 'expiryOf', args: [tradeFinance, lineId] }),
    send: async (fn, lineId) => {
      const hash = await wallet.writeContract({ address: tradeFinance, abi: tradeFinanceAbi, functionName: fn, args: [lineId] });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error(`${fn} reverted`);
      return receipt;
    },
    patch: async (id, p) => { await patchFactoringOffer(id, p); },
    tell: async (o, outcome) => {
      const fromGuarantee = outcome.fromGuaranteeMicros !== undefined ? formatUnits(outcome.fromGuaranteeMicros, 6) : undefined;
      const body = outcome.state === 'repaid'
        ? 'The financier was paid back in full. The deal guarantee is free again.'
        : outcome.state === 'defaulted'
          ? `The financier was not paid back in full. ${fromGuarantee ?? '0'} USDC came from the seller's deal guarantee.`
          : 'The financier gave up this advance. The deal guarantee is free again.';
      await addSystemMessage({ jobId: o.invoiceId, channel: 'financing', channelKey: o.id, financingKind: 'factoring', financingId: o.id, eventType: 'factoring.settled', occurrenceKey: `${o.id}:${outcome.state}`, body });
      bus.emitEvent({
        type: 'factoring.settled',
        jobId: o.invoiceId,
        actor: 'platform',
        payload: { offerId: o.id, financier: o.financier, seller: o.seller, outcome: outcome.state, repayUsdc: o.expectedReturnUsdc, ...(fromGuarantee ? { fromGuaranteeUsdc: fromGuarantee } : {}) },
      });
    },
    log: (message) => logger.warn(message),
    now: () => Date.now(),
  };
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void runFamilyFinancingPass(deps).finally(() => { running = false; });
  }, EVERY_MS);
  return () => clearInterval(timer);
}
