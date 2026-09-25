import type { Address } from 'viem';
import { config } from '../config.js';
import { bus } from '../events.js';
import { readUsdcAllowance, readUsdcBalance, usdc } from '../chain/contracts.js';
import { publicClient } from '../chain/client.js';
import { dealEscrowV3Abi } from '../chain/abis/dealEscrowV3.js';
import { readDealTermsLimits, readDealV3, requireDealEscrowV3 } from '../chain/dealEscrowV3Live.js';
import { executeContractCall } from '../chain/txs.js';
import { patchDeal, type DirectDeal } from '../db/deals.js';
import { ensureMoneyMovement } from '../db/moneyMovements.js';
import {
  completeMoneyMovement,
  markMoneyMovementNeedsAttention,
  prepareMoneyMovementContractLeg,
  verifyMoneyMovementLeg,
} from '../money/service.js';
import type { FundDirectV3Deps } from './fundDirectV3.js';
import type { FundAgentMatchV3Deps } from '../agents/fundAgentMatchV3.js';

const stakeVaultReadAbi = [
  {
    type: 'function',
    name: 'resolveOwner',
    stateMutability: 'view',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'freeStakeOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner_', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/// The live dependencies for fundDirectDealV3. Throws when the v3 suite is not
/// configured on this network, so a caller cannot reach it by accident.
export function fundDirectV3Deps(): FundDirectV3Deps {
  const escrow = requireDealEscrowV3();
  const escrowAddress = escrow.address as Address;
  const stakeVault = config.KARWAN_STAKE_VAULT_ADDR as Address | undefined;
  if (!stakeVault) throw new Error('KARWAN_STAKE_VAULT_ADDR is required for v3 deals');

  return {
    escrow,
    readDeal: (id) => readDealV3(escrowAddress, id),
    readLimits: (nowSecs) => readDealTermsLimits(escrowAddress, nowSecs),
    readFeeBps: async () =>
      Number(await publicClient.readContract({ address: escrowAddress, abi: dealEscrowV3Abi, functionName: 'feeBps' })),
    // An agent's reservation draws on the owner it is bound to (or on the
    // agent itself when unbound), exactly as StakeVault.reserve resolves it.
    readFreeStake: async (party) => {
      const owner = (await publicClient.readContract({
        address: stakeVault,
        abi: stakeVaultReadAbi,
        functionName: 'resolveOwner',
        args: [party],
      })) as Address;
      return (await publicClient.readContract({
        address: stakeVault,
        abi: stakeVaultReadAbi,
        functionName: 'freeStakeOf',
        args: [owner],
      })) as bigint;
    },
    readUsdcBalance: (owner) => readUsdcBalance(owner),
    readUsdcAllowance: (owner, spender) => readUsdcAllowance(owner, spender),
    async approveUsdc(input) {
      await executeContractCall(
        {
          walletId: input.walletId,
          contractAddress: usdc,
          abiFunctionSignature: 'approve(address,uint256)',
          abiParameters: [input.spender, input.amount.toString()],
          idempotencyKey: input.idempotencyKey,
          lifecycle: input.lifecycle,
        },
        `usdc.approve(dealEscrowV3, ${input.amount})`,
      );
    },
    movements: {
      async ensure(input) {
        const { movement } = await ensureMoneyMovement({
          operationKey: input.operationKey,
          kind: 'escrow_funding',
          amountMicros: input.amountMicros,
          initiatedBy: input.buyer,
          participants: [
            { address: input.buyer, role: 'buyer' },
            { address: input.seller, role: 'seller' },
          ],
          summary: 'Fund escrow and activate protection',
          nextActor: 'karwan',
          jobId: input.jobId,
        });
        return { reference: movement.reference, amountMicros: String(movement.amountMicros) };
      },
      async prepareLeg(reference, leg) {
        const planned = await prepareMoneyMovementContractLeg(reference, leg);
        return { legId: planned.leg.id, idempotencyKey: planned.idempotencyKey, lifecycle: planned.lifecycle };
      },
      async verifyLeg(reference, legId) {
        await verifyMoneyMovementLeg(reference, legId);
      },
      async needsAttention(reference, code, nextActor) {
        await markMoneyMovementNeedsAttention(reference, code, nextActor);
      },
      async complete(reference, patch) {
        await completeMoneyMovement(reference, patch);
      },
    },
    async patchDeal(jobId, patch) {
      await patchDeal(jobId, patch as Partial<DirectDeal>);
    },
    emit(e) {
      bus.emitEvent({ type: e.type as Parameters<typeof bus.emitEvent>[0]['type'], jobId: e.jobId, actor: e.actor, payload: e.payload });
    },
    now: () => Date.now(),
  };
}

/// The live dependencies for fundAgentMatchV3: the same chain, fee and approval
/// bindings as a direct deal, without the money-movement ledger the direct
/// route keeps.
export function fundAgentMatchV3Deps(): FundAgentMatchV3Deps {
  const d = fundDirectV3Deps();
  return {
    escrow: d.escrow,
    readDeal: d.readDeal,
    readLimits: d.readLimits,
    readFeeBps: d.readFeeBps,
    readUsdcAllowance: d.readUsdcAllowance,
    approveUsdc: (input) =>
      d.approveUsdc({ ...input, idempotencyKey: input.idempotencyKey ?? crypto.randomUUID() }),
    now: d.now,
  };
}
