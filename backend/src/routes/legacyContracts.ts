import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { formatUnits, type Address, type Hex } from 'viem';
import type { SessionPayload } from '../auth/session.js';
import {
  LEGACY_STATE,
  dealStepCalls,
  dealSteps,
  vaultStepCall,
  vaultSteps,
  type Call,
  type DealStep,
  type LegacyDeal,
  type VaultStep,
} from '../chain/legacyContracts.js';
import type { LegacyVaultPosition } from '../chain/legacyLive.js';
import { invalidBodyMessage } from './invalidBody.js';

/// Legacy contracts (view 37): everything a person still holds on an older
/// Karwan contract, with the one step that works for it now. A step is offered
/// only when it simulates cleanly from the wallet that owns the position.

interface Wallet {
  address: string;
  walletId: string | null;
}

export interface LegacyDeps {
  session: (c: Context) => SessionPayload | null;
  wallets: (address: string) => Promise<{ identity: Wallet; buyer: Wallet | null; seller: Wallet | null }>;
  dealsFor: (address: string) => Promise<Array<{ jobId: string; buyer: string; seller: string; buyerAgentWalletId?: string | null; sellerAgentWalletId?: string | null }>>;
  findDeal: (jobId: string) => Promise<{ escrow: Address; deal: LegacyDeal } | null>;
  vaultPositionsFor: (owners: readonly string[]) => Promise<LegacyVaultPosition[]>;
  simulates: (from: Address, call: Call) => Promise<boolean>;
  /// The vault guarantees are moving off; marked so the page can link to it.
  previousVault: Address | null;
  now: () => number;
  execute: (walletId: string, contract: Address, signature: string, params: string[]) => Promise<{ txHash: string }>;
  confirmed: (txHash: string) => Promise<boolean>;
  afterStep: (entry: { kind: 'deal' | 'guarantee'; step: DealStep | VaultStep; address: string; contract: Address; ref: string; amountMicros: bigint; txHash: string }) => Promise<void>;
}

const usdc = (micros: bigint) => formatUnits(micros, 6);
const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

interface DealRow {
  contract: Address;
  jobId: string;
  role: 'buyer' | 'seller';
  otherSide: string;
  amountUsdc: string;
  state: 'funded' | 'disputed';
  steps: DealStep[];
  heldByKarwan: boolean;
}

interface GuaranteeRow {
  contract: Address;
  positionId: string;
  amountUsdc: string;
  state: 'in_place' | 'coming_back';
  readyAt: number | null;
  steps: VaultStep[];
  heldByKarwan: boolean;
  previous: boolean;
}

export interface Found {
  deals: Array<{ row: DealRow; deal: LegacyDeal; signer: Wallet }>;
  guarantees: Array<{ row: GuaranteeRow; position: LegacyVaultPosition; signer: Wallet }>;
}

const SIGNATURE: Record<VaultStep, string> = {
  requestWithdraw: 'requestWithdraw(uint256)',
  cancelWithdraw: 'cancelWithdraw(uint256)',
  claim: 'claim(uint256)',
};

/// What the person still has on older contracts. The page and the assistant
/// both read this, so they always agree.
export async function findLegacyPositions(deps: LegacyDeps, address: string): Promise<Found> {
  async function workingSteps<S extends string>(from: Address, steps: S[], callFor: (s: S) => Call): Promise<S[]> {
    const ok = await Promise.all(steps.map((s) => deps.simulates(from, callFor(s))));
    return steps.filter((_, i) => ok[i]);
  }

  const wallets = await deps.wallets(address);
  const owned = [wallets.identity, wallets.buyer, wallets.seller].filter((w): w is Wallet => !!w);
  const now = deps.now();

  const [records, positions] = await Promise.all([deps.dealsFor(address), deps.vaultPositionsFor(owned.map((w) => w.address))]);

  const deals: Found['deals'] = [];
  for (const r of records) {
    const hit = await deps.findDeal(r.jobId);
    if (!hit || hit.deal.lockedMicros === 0n) continue;
    if (hit.deal.state !== LEGACY_STATE.Funded && hit.deal.state !== LEGACY_STATE.Disputed) continue;
    const role = same(r.buyer, address) ? 'buyer' : 'seller';
    // The escrow's buyer is whichever wallet paid in: the buying agent, or the
    // person's own wallet before agents existed.
    const signer: Wallet = owned.find((w) => same(w.address, hit.deal.buyer)) ?? { address: hit.deal.buyer, walletId: r.buyerAgentWalletId ?? null };
    const offered = dealSteps(hit.deal, role);
    const steps = await workingSteps(hit.deal.buyer, offered, (s) => dealStepCalls(hit.escrow, s, r.jobId as Hex, hit.deal)[0]!);
    deals.push({
      deal: hit.deal,
      signer,
      row: {
        contract: hit.escrow,
        jobId: r.jobId,
        role,
        otherSide: role === 'buyer' ? r.seller : r.buyer,
        amountUsdc: usdc(hit.deal.lockedMicros),
        state: hit.deal.state === LEGACY_STATE.Disputed ? 'disputed' : 'funded',
        steps,
        heldByKarwan: offered.length > 0 && steps.length === 0,
      },
    });
  }

  const guarantees: Found['guarantees'] = [];
  for (const p of positions) {
    const signer = owned.find((w) => same(w.address, p.owner))!;
    const offered = vaultSteps(p, now);
    const steps = await workingSteps(p.owner, offered, (s) => vaultStepCall(p.vault, s, p.positionId));
    guarantees.push({
      position: p,
      signer,
      row: {
        contract: p.vault,
        positionId: p.positionId.toString(),
        amountUsdc: usdc(p.principalMicros),
        state: p.state === 2 ? 'coming_back' : 'in_place',
        readyAt: p.state === 2 ? p.claimableAt : null,
        steps,
        heldByKarwan: offered.length > 0 && steps.length === 0,
        previous: same(p.vault, deps.previousVault),
      },
    });
  }
  return { deals, guarantees };
}

export function createLegacyContractRoutes(deps: LegacyDeps): Hono {
  const app = new Hono();
  const find = (address: string) => findLegacyPositions(deps, address);

  app.get('/positions', async (c) => {
    c.header('Cache-Control', 'no-store');
    const session = deps.session(c);
    if (!session) return c.json({ error: 'not authenticated' }, 401);
    const found = await find(session.address);
    return c.json({ deals: found.deals.map((d) => d.row), guarantees: found.guarantees.map((g) => g.row) });
  });

  const stepSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('deal'), contract: z.string(), ref: z.string(), step: z.enum(['releaseFinal', 'refund']) }),
    z.object({ kind: z.literal('guarantee'), contract: z.string(), ref: z.string(), step: z.enum(['requestWithdraw', 'cancelWithdraw', 'claim']) }),
  ]);

  app.post('/step', async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: 'not authenticated' }, 401);
    let body: z.infer<typeof stepSchema>;
    try {
      body = stepSchema.parse(await c.req.json());
    } catch (err) {
      return c.json({ error: invalidBodyMessage(err) }, 400);
    }
    const found = await find(session.address);

    let signer: Wallet;
    let calls: Call[];
    let exec: Array<{ sig: string; params: string[] }>;
    let amountMicros: bigint;
    const contract = body.contract.toLowerCase() as Address;
    if (body.kind === 'guarantee') {
      const hit = found.guarantees.find((g) => same(g.row.contract, body.contract) && g.row.positionId === body.ref);
      if (!hit) return c.json({ error: 'Nothing of yours is on that contract.' }, 404);
      if (!hit.row.steps.includes(body.step)) return c.json({ code: 'step_not_available', error: 'That step is not available for this right now.' }, 409);
      signer = hit.signer;
      calls = [vaultStepCall(hit.position.vault, body.step, hit.position.positionId)];
      exec = [{ sig: SIGNATURE[body.step], params: [body.ref] }];
      amountMicros = hit.position.principalMicros;
    } else {
      const hit = found.deals.find((d) => same(d.row.contract, body.contract) && same(d.row.jobId, body.ref));
      if (!hit) return c.json({ error: 'Nothing of yours is on that contract.' }, 404);
      if (!hit.row.steps.includes(body.step)) return c.json({ code: 'step_not_available', error: 'That step is not available for this right now.' }, 409);
      signer = hit.signer;
      calls = dealStepCalls(hit.row.contract, body.step, body.ref as Hex, hit.deal);
      exec =
        body.step === 'releaseFinal'
          ? [{ sig: 'releaseFinal(bytes32)', params: [body.ref] }]
          : [
              ...(hit.deal.state === LEGACY_STATE.Funded ? [{ sig: 'dispute(bytes32,string)', params: [body.ref, 'Recovery from an older contract'] }] : []),
              { sig: 'refund(bytes32)', params: [body.ref] },
            ];
      amountMicros = hit.deal.lockedMicros;
    }

    if (!signer.walletId) return c.json({ calls, amountUsdc: usdc(amountMicros) });

    try {
      let txHash = '';
      for (const e of exec) {
        txHash = (await deps.execute(signer.walletId, contract, e.sig, e.params)).txHash;
        // A wallet provider's "done" is not proof: the receipt must show success.
        if (!(await deps.confirmed(txHash))) throw new Error(`${e.sig} did not go through on chain`);
      }
      await deps.afterStep({ kind: body.kind, step: body.step, address: session.address, contract, ref: body.ref, amountMicros, txHash });
      return c.json({ ok: true, txHash, amountUsdc: usdc(amountMicros) });
    } catch (err) {
      return c.json({ error: 'The step did not go through.', detail: (err as Error).message }, 502);
    }
  });

  return app;
}
