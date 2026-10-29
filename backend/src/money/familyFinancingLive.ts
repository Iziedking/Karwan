import { randomBytes } from 'node:crypto';
import { decodeFunctionData, erc20Abi, formatUnits, type Hex } from 'viem';
import { ARC, publicClient } from '../chain/client.js';
import { usdc } from '../chain/contracts.js';
import { guaranteeVaultAbi } from '../chain/guaranteeVault.js';
import { guaranteeVaultEnabled, suiteAddresses } from '../chain/suiteConfig.js';
import { financeableAbi, tradeFinanceAbi } from '../chain/tradeFinance.js';
import { deterministicIdempotencyKey, executeContractCall } from '../chain/txs.js';
import { addSystemMessage } from '../chat/systemMessages.js';
import { getDeal, patchDeal } from '../db/deals.js';
import {
  createFactoringOffer,
  getFactoringOffer,
  listOffersForInvoice,
  patchFactoringOffer,
  patchFactoringOfferIfStatus,
} from '../db/factoring.js';
import { getUserByAddress } from '../db/users.js';
import { bus } from '../events.js';
import { registryAbi } from '../identity/suiteIdentity.js';
import { suiteIdentity } from '../identity/suiteIdentityLive.js';
import { logger } from '../logger.js';
import { dcwEvmSigner } from '../x402/dcwSigner.js';
import { createFamilyFinancing, type FamilyFinancingPorts, type Receivable } from './familyFinancing.js';
import { financingOperationKey, projectFinancingActivity, recordVerifiedFinancingMovement } from './financing.js';
import { executeCircleGuarantee, guaranteeOperationKey } from './guarantee.js';

/// The family financing core bound to Arc, Circle and the offers table. Null
/// where the family or its vault is not set up on this network.

const balanceOf = (address: Hex) =>
  publicClient.readContract({ address: usdc as Hex, abi: erc20Abi, functionName: 'balanceOf', args: [address] });

function bind(): { ports: FamilyFinancingPorts; receivable: (dealId: Hex) => Promise<Receivable>; freeGuarantee: (wallet: Hex) => Promise<bigint> } | null {
  const suite = suiteAddresses();
  const vault = guaranteeVaultEnabled();
  if (!suite || !vault || !suiteIdentity) return null;
  const identity = suiteIdentity;

  const receivable = async (dealId: Hex): Promise<Receivable> => {
    const r = await publicClient.readContract({ address: suite.agreement, abi: financeableAbi, functionName: 'receivableOf', args: [dealId] });
    return { asset: r.asset, seller: r.seller, unpaid: r.unpaid, horizon: BigInt(r.horizon), open: r.open, financeable: r.financeable };
  };
  // The vault draws on the identity the wallet is bound to, as the contract does.
  const freeGuarantee = async (wallet: Hex): Promise<bigint> => {
    const id = await publicClient.readContract({ address: suite.identity, abi: registryAbi, functionName: 'identityOf', args: [wallet] });
    if (id === 0n) return 0n;
    return publicClient.readContract({ address: vault, abi: guaranteeVaultAbi, functionName: 'freeOf', args: [id, usdc as Hex] });
  };

  const ports: FamilyFinancingPorts = {
    addresses: { tradeFinance: suite.tradeFinance, vault, usdc: usdc as Hex, chainId: ARC.chainId },
    deal: getDeal,
    receivable,
    freeGuarantee,
    spendable: (deal) => balanceOf(deal.seller as Hex),
    sellerHeld: async (deal) => !!getUserByAddress(deal.seller)?.circleIdentityWalletId,
    sellerReady: async (deal) => (await identity.ensureRecord(deal.seller, 'seller')) === 'ready',
    balance: balanceOf,
    nextNonce: async (payee) => {
      let nonce = BigInt(`0x${randomBytes(8).toString('hex')}`);
      while (await publicClient.readContract({ address: suite.agreement, abi: financeableAbi, functionName: 'nonceUsed', args: [payee, nonce] })) nonce += 1n;
      return nonce;
    },
    signAsSeller: (walletId, address, typed) =>
      dcwEvmSigner(walletId, address, 'Karwan: get paid now').signTypedData(typed as Parameters<ReturnType<typeof dcwEvmSigner>['signTypedData']>[0]),
    putUpGuarantee: async ({ deal, amount }) => {
      const walletId = getUserByAddress(deal.seller)?.circleIdentityWalletId;
      if (!walletId) throw new Error('the seller wallet is not held by Karwan');
      const { identityId } = await identity.identityStatus(deal.seller);
      await executeCircleGuarantee({
        operationKey: guaranteeOperationKey(deal.seller, 'put_up', `get-paid-now:${deal.jobId}:${amount}`),
        step: 'put_up',
        walletAddress: deal.seller,
        walletId,
        identityId,
        vaultAddress: vault,
        usdcAddress: usdc as string,
        amountMicros: amount,
      });
    },
    // Circle takes a function signature and its arguments, so the prepared
    // calls are read back into them; the two legs keep their own idempotency keys.
    executeOpen: async ({ walletId, calls, reference }) => {
      const [approve, open] = calls;
      const a = decodeFunctionData({ abi: erc20Abi, data: approve!.data });
      const o = decodeFunctionData({ abi: tradeFinanceAbi, data: open!.data });
      if (a.functionName !== 'approve' || o.functionName !== 'open') throw new Error('unexpected financing calls');
      const [spender, value] = a.args;
      const [escrow, dealId, advance, repay, stake, expiresAt, assignment, reservation] = o.args;
      await executeContractCall(
        {
          walletId,
          contractAddress: approve!.to,
          abiFunctionSignature: 'approve(address,uint256)',
          abiParameters: [spender, value.toString()],
          idempotencyKey: deterministicIdempotencyKey(`${reference}:approve`),
        },
        'financing.approve',
      );
      const sent = await executeContractCall(
        {
          walletId,
          contractAddress: open!.to,
          abiFunctionSignature: 'open(address,bytes32,uint128,uint128,uint128,uint64,(uint256,uint256,bytes),(uint256,bytes))',
          abiParameters: [
            escrow, dealId, advance.toString(), repay.toString(), stake.toString(), expiresAt.toString(),
            [assignment.nonce.toString(), assignment.deadline.toString(), assignment.sig],
            [reservation.deadline.toString(), reservation.sig],
          ],
          idempotencyKey: deterministicIdempotencyKey(`${reference}:open`),
        },
        'financing.open',
      );
      return { txHash: sent.txHash as Hex };
    },
    receipt: (hash) => publicClient.getTransactionReceipt({ hash }),
    markDealFinanced: async (jobId, offerId, txHash) => {
      const offer = await getFactoringOffer(offerId);
      const deal = await getDeal(jobId);
      if (!offer || !deal) return;
      await patchDeal(jobId, { factoringOfferId: offerId });
      const seller = (deal.sellerAgentAddress ?? deal.seller).toLowerCase();
      const movement = await recordVerifiedFinancingMovement({
        operationKey: financingOperationKey('family', offerId, 'advance', txHash),
        kind: 'financing_advance',
        positionId: jobId,
        amountUsdc: offer.offeredAdvanceUsdc,
        initiatedBy: deal.seller,
        sourceAddress: offer.financier,
        destinationAddress: seller,
        txHash,
        contractAddress: suite.tradeFinance,
        summary: `Advance of ${offer.offeredAdvanceUsdc} USDC on deal ${jobId}`,
      }).catch((err) => {
        logger.warn({ offerId, txHash, err: (err as Error).message }, 'financing: advance movement not recorded');
        return null;
      });
      const reference = movement?.reference ?? txHash;
      await projectFinancingActivity({ offerId, phase: 'advance-funded', address: offer.financier, kind: 'financing_funded', summary: `Paid a ${offer.offeredAdvanceUsdc} USDC advance on deal ${jobId}`, amountUsdc: offer.offeredAdvanceUsdc, invoiceId: jobId, txHash, reference, counterparty: deal.seller });
      await projectFinancingActivity({ offerId, phase: 'advance-received', address: deal.seller, kind: 'financing_received', summary: `Got paid ${offer.offeredAdvanceUsdc} USDC now on deal ${jobId}`, amountUsdc: offer.offeredAdvanceUsdc, invoiceId: jobId, txHash, reference, counterparty: offer.financier });
      await addSystemMessage({ jobId, channel: 'financing', channelKey: offerId, financingKind: 'factoring', financingId: offerId, eventType: 'factoring.accepted', occurrenceKey: txHash, body: 'The seller was paid early. The financier is paid back first from this deal.' });
      bus.emitEvent({ type: 'factoring.accepted', jobId, actor: 'platform', payload: { offerId, seller: deal.seller, financier: offer.financier, advanceUsdc: offer.offeredAdvanceUsdc, advanceTxHash: txHash } });
    },
    offers: {
      get: getFactoringOffer,
      listForDeal: listOffersForInvoice,
      create: createFactoringOffer,
      patch: patchFactoringOffer,
      patchIfStatus: patchFactoringOfferIfStatus,
    },
    now: () => Date.now(),
  };
  return { ports, receivable, freeGuarantee };
}

const bound = bind();

export const familyFinancing = bound ? createFamilyFinancing(bound.ports) : null;
export const familyFinancingPorts = bound?.ports ?? null;

/// What the factoring routes need beyond the core.
export const familyRouteWiring = bound && familyFinancing
  ? {
      core: familyFinancing,
      receivable: bound.receivable,
      sellerReady: bound.ports.sellerReady,
      freeGuarantee: bound.freeGuarantee,
    }
  : null;

/// What a family deal still owes its seller, when it can be paid early; null
/// when it cannot or the escrow could not be read.
export async function familyClaimableUsdc(jobId: string): Promise<string | null> {
  if (!bound) return null;
  const deal = await getDeal(jobId);
  if (!deal?.escrowDealId) return null;
  const r = await bound.receivable(deal.escrowDealId as Hex).catch(() => null);
  return r?.financeable ? formatUnits(r.unpaid, 6) : null;
}
