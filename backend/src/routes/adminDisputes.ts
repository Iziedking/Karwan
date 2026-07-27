import { Hono } from 'hono';
import { z } from 'zod';
import { encodeFunctionData, keccak256, toBytes, recoverTypedDataAddress, type Address } from 'viem';
import { publicClient } from '../chain/client.js';
import { arbiterSafeAbi, SAFE_TX_TYPES } from '../chain/abis/arbiterSafe.js';
import { escrowV2Abi } from '../chain/abis/escrowV2.js';
import { executeContractCall } from '../chain/txs.js';
import { listAllDeals, getDeal, patchDeal } from '../db/deals.js';
import { listSignatures, putSignature, clearSignatures } from '../db/arbiterSignatures.js';
import { config } from '../config.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { requireAdmin } from '../middleware/adminAuth.js';

/// Arbiter dispute desk.
///
/// The escrow's arbiter is a 2-of-3 Safe, so a disputed escrow cannot be
/// resolved by one key and there is no Safe web app on Arc Testnet. This
/// replaces scripts/arbiter-resolve.sh with a surface an operator can actually
/// use: the backend computes the Safe digest, owners sign it in their own
/// browser wallet, and the relay broadcasts once the threshold is met.
///
/// The backend never holds an owner key. It computes, collects and assembles;
/// the authority is always a signature made in someone's wallet.

export const adminDisputeRoutes = new Hono();

// Same gate as the rest of /api/admin. Signing is additionally bound to a real
// Safe-owner signature, so an admin session alone can prepare and read but
// cannot move a disputed escrow.
adminDisputeRoutes.use('*', requireAdmin);

const ZERO = '0x0000000000000000000000000000000000000000' as const;
const jobIdSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'expected a 32-byte job id');

/// Safe transaction shape we always use: a plain CALL with no gas refund
/// accounting, so the broadcaster simply pays gas. Matches arbiter-resolve.sh
/// exactly; a mismatch on ANY field yields a different digest and the
/// signatures collected here would not verify.
const SAFE_TX_FIXED = {
  value: 0n,
  operation: 0,
  safeTxGas: 0n,
  baseGas: 0n,
  gasPrice: 0n,
  gasToken: ZERO,
  refundReceiver: ZERO,
} as const;

function safeAddress(): Address | null {
  const a = config.KARWAN_ARBITER_SAFE;
  return a && /^0x[a-fA-F0-9]{40}$/.test(a) ? (a as Address) : null;
}

function escrowAddress(): Address | null {
  const a = config.KARWAN_ESCROW_ADDR;
  return a && /^0x[a-fA-F0-9]{40}$/.test(a) ? (a as Address) : null;
}

/// GET /api/admin/disputes: every deal sitting in dispute, newest first.
adminDisputeRoutes.get('/', async (c) => {
  const deals = await listAllDeals();
  const disputed = deals
    .filter((d) => d.disputed && !d.settledAt && !d.cancelledAt)
    .sort((a, b) => (b.disputedAt ?? 0) - (a.disputedAt ?? 0))
    .map((d) => ({
      jobId: d.jobId,
      buyer: d.buyer,
      seller: d.seller,
      dealAmountUsdc: d.dealAmountUsdc,
      disputedAt: d.disputedAt ?? null,
      disputedBy: d.disputedBy ?? null,
    }));
  return c.json({
    disputes: disputed,
    safe: safeAddress(),
    escrow: escrowAddress(),
  });
});

const prepareSchema = z.object({
  sellerBps: z.number().int().min(0).max(10_000),
  rulingReason: z.string().min(1).max(2000),
});

/// POST /api/admin/disputes/:jobId/prepare: the exact thing an owner signs.
///
/// Returns the EIP-712 payload rather than the raw digest. A typed-data
/// signature comes back with v=27/28, which the Safe accepts as-is; signing the
/// digest as a plain message adds the EIP-191 prefix and needs v shifted by 4,
/// which is the single most common way to produce a signature the Safe silently
/// rejects.
adminDisputeRoutes.post('/:jobId/prepare', async (c) => {
  const safe = safeAddress();
  const escrow = escrowAddress();
  if (!safe || !escrow) {
    return c.json({ error: 'KARWAN_ARBITER_SAFE or KARWAN_ESCROW_ADDR not configured' }, 503);
  }
  const jobId = jobIdSchema.safeParse(c.req.param('jobId'));
  if (!jobId.success) return c.json({ error: 'invalid job id' }, 400);

  let body;
  try {
    body = prepareSchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const deal = await getDeal(jobId.data);
  if (!deal) return c.json({ error: 'unknown deal' }, 404);
  if (!deal.disputed) return c.json({ error: 'deal is not disputed', code: 'not-disputed' }, 409);

  const rulingHash = keccak256(toBytes(body.rulingReason));
  const data = encodeFunctionData({
    abi: escrowV2Abi,
    functionName: 'resolve',
    args: [jobId.data as `0x${string}`, body.sellerBps, rulingHash],
  });

  try {
    const [nonce, owners, threshold, chainId] = await Promise.all([
      publicClient.readContract({ address: safe, abi: arbiterSafeAbi, functionName: 'nonce' }),
      publicClient.readContract({ address: safe, abi: arbiterSafeAbi, functionName: 'getOwners' }),
      publicClient.readContract({
        address: safe,
        abi: arbiterSafeAbi,
        functionName: 'getThreshold',
      }),
      publicClient.getChainId(),
    ]);

    // Signatures are bound to a nonce. Anything collected against an older one
    // is dead weight, so drop it rather than let it be assembled into a call
    // that reverts on chain with the operator wondering why.
    const existing = await listSignatures(jobId.data);
    const live = existing.filter(
      (s) =>
        s.safeNonce === String(nonce) &&
        s.sellerBps === body.sellerBps &&
        s.rulingHash === rulingHash,
    );

    return c.json({
      safe,
      escrow,
      chainId,
      nonce: String(nonce),
      owners,
      threshold: Number(threshold),
      sellerBps: body.sellerBps,
      rulingHash,
      /// Hand the browser the whole typed-data payload so the frontend never
      /// reconstructs the Safe domain or field order. One place gets it right.
      typedData: {
        domain: { chainId, verifyingContract: safe },
        types: SAFE_TX_TYPES,
        primaryType: 'SafeTx',
        message: {
          to: escrow,
          value: '0',
          data,
          operation: 0,
          safeTxGas: '0',
          baseGas: '0',
          gasPrice: '0',
          gasToken: ZERO,
          refundReceiver: ZERO,
          nonce: String(nonce),
        },
      },
      collected: live.map((s) => ({ signer: s.signer, signedAt: s.signedAt })),
      ready: live.length >= Number(threshold),
    });
  } catch (err) {
    logger.error({ jobId: jobId.data, err: (err as Error).message }, 'arbiter prepare failed');
    return c.json({ error: 'could not read the Safe', detail: (err as Error).message }, 502);
  }
});

const signSchema = prepareSchema.extend({
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'expected a 65-byte signature'),
  safeNonce: z.string().regex(/^\d+$/),
});

/// POST /api/admin/disputes/:jobId/sign: record one owner's signature.
///
/// The signer is RECOVERED from the signature and checked against the Safe's
/// own owner list. Nothing is taken on trust from the caller: an admin session
/// gets you to this endpoint, but only a real owner signature counts toward the
/// threshold.
adminDisputeRoutes.post('/:jobId/sign', async (c) => {
  const safe = safeAddress();
  const escrow = escrowAddress();
  if (!safe || !escrow) return c.json({ error: 'arbiter Safe not configured' }, 503);
  const jobId = jobIdSchema.safeParse(c.req.param('jobId'));
  if (!jobId.success) return c.json({ error: 'invalid job id' }, 400);

  let body;
  try {
    body = signSchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const rulingHash = keccak256(toBytes(body.rulingReason));
  const data = encodeFunctionData({
    abi: escrowV2Abi,
    functionName: 'resolve',
    args: [jobId.data as `0x${string}`, body.sellerBps, rulingHash],
  });

  try {
    const [nonce, chainId] = await Promise.all([
      publicClient.readContract({ address: safe, abi: arbiterSafeAbi, functionName: 'nonce' }),
      publicClient.getChainId(),
    ]);
    if (String(nonce) !== body.safeNonce) {
      return c.json(
        { error: 'the Safe nonce moved while you were signing; re-prepare', code: 'stale-nonce' },
        409,
      );
    }

    const signer = await recoverTypedDataAddress({
      domain: { chainId, verifyingContract: safe },
      types: SAFE_TX_TYPES,
      primaryType: 'SafeTx',
      message: {
        to: escrow,
        value: SAFE_TX_FIXED.value,
        data,
        operation: SAFE_TX_FIXED.operation,
        safeTxGas: SAFE_TX_FIXED.safeTxGas,
        baseGas: SAFE_TX_FIXED.baseGas,
        gasPrice: SAFE_TX_FIXED.gasPrice,
        gasToken: SAFE_TX_FIXED.gasToken,
        refundReceiver: SAFE_TX_FIXED.refundReceiver,
        nonce,
      },
      signature: body.signature as `0x${string}`,
    });

    const isOwner = (await publicClient.readContract({
      address: safe,
      abi: arbiterSafeAbi,
      functionName: 'isOwner',
      args: [signer],
    })) as boolean;
    if (!isOwner) {
      return c.json({ error: `${signer} is not a Safe owner`, code: 'not-owner' }, 403);
    }

    await putSignature({
      jobId: jobId.data,
      safeNonce: String(nonce),
      signer,
      signature: body.signature,
      sellerBps: body.sellerBps,
      rulingHash,
      signedAt: Date.now(),
    });

    const collected = (await listSignatures(jobId.data)).filter(
      (s) =>
        s.safeNonce === String(nonce) &&
        s.sellerBps === body.sellerBps &&
        s.rulingHash === rulingHash,
    );
    const threshold = Number(
      await publicClient.readContract({
        address: safe,
        abi: arbiterSafeAbi,
        functionName: 'getThreshold',
      }),
    );

    logger.info({ jobId: jobId.data, signer, have: collected.length, threshold }, 'arbiter signed');
    return c.json({
      signer,
      collected: collected.map((s) => ({ signer: s.signer, signedAt: s.signedAt })),
      threshold,
      ready: collected.length >= threshold,
    });
  } catch (err) {
    logger.error({ jobId: jobId.data, err: (err as Error).message }, 'arbiter sign failed');
    return c.json({ error: 'signature rejected', detail: (err as Error).message }, 400);
  }
});

/// POST /api/admin/disputes/:jobId/execute: assemble and broadcast.
///
/// Execution is permissionless once the signatures exist, so the platform relay
/// pays the gas and no owner needs Arc balance to rule on a dispute.
adminDisputeRoutes.post('/:jobId/execute', async (c) => {
  const safe = safeAddress();
  const escrow = escrowAddress();
  if (!safe || !escrow) return c.json({ error: 'arbiter Safe not configured' }, 503);
  const relayWalletId = config.cctpRelayWalletId;
  if (!relayWalletId) return c.json({ error: 'relay wallet not configured' }, 503);

  const jobId = jobIdSchema.safeParse(c.req.param('jobId'));
  if (!jobId.success) return c.json({ error: 'invalid job id' }, 400);

  let body;
  try {
    body = prepareSchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const rulingHash = keccak256(toBytes(body.rulingReason));
  const data = encodeFunctionData({
    abi: escrowV2Abi,
    functionName: 'resolve',
    args: [jobId.data as `0x${string}`, body.sellerBps, rulingHash],
  });

  try {
    const [nonce, threshold] = await Promise.all([
      publicClient.readContract({ address: safe, abi: arbiterSafeAbi, functionName: 'nonce' }),
      publicClient.readContract({
        address: safe,
        abi: arbiterSafeAbi,
        functionName: 'getThreshold',
      }),
    ]);

    const sigs = (await listSignatures(jobId.data)).filter(
      (s) =>
        s.safeNonce === String(nonce) &&
        s.sellerBps === body.sellerBps &&
        s.rulingHash === rulingHash,
    );
    if (sigs.length < Number(threshold)) {
      return c.json(
        {
          error: `need ${Number(threshold)} signatures on this ruling, have ${sigs.length}`,
          code: 'below-threshold',
        },
        409,
      );
    }

    // The Safe requires signatures concatenated in ASCENDING signer address
    // order. Out of order, it recovers the wrong owner for each slot and
    // reverts GS026. This is the footgun the shell runbook warns about, done
    // here so an operator cannot get it wrong.
    const ordered = [...sigs].sort((a, b) =>
      a.signer.toLowerCase() < b.signer.toLowerCase() ? -1 : 1,
    );
    const packed = `0x${ordered.map((s) => s.signature.slice(2)).join('')}`;

    const r = await executeContractCall(
      {
        walletId: relayWalletId,
        contractAddress: safe,
        abiFunctionSignature:
          'execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)',
        abiParameters: [
          escrow,
          '0',
          data,
          '0',
          '0',
          '0',
          '0',
          ZERO,
          ZERO,
          packed,
        ],
      },
      `arbiterSafe.execTransaction(resolve ${jobId.data})`,
    );

    await patchDeal(jobId.data, {
      settledAt: Date.now(),
      cancelKind: 'resolved',
      cancelReason: body.rulingReason,
      resolvedSellerBps: body.sellerBps,
      disputeLoser: body.sellerBps >= 5000 ? 'buyer' : 'seller',
    });
    await clearSignatures(jobId.data);

    bus.emitEvent({
      type: 'escrow.resolved',
      jobId: jobId.data,
      actor: 'platform',
      payload: { sellerBps: body.sellerBps, txHash: r.txHash, by: 'arbiter-safe' },
    });
    logger.info(
      { jobId: jobId.data, sellerBps: body.sellerBps, txHash: r.txHash, signers: ordered.length },
      'arbiter Safe resolved a dispute',
    );
    return c.json({ ok: true, txHash: r.txHash, sellerBps: body.sellerBps });
  } catch (err) {
    logger.error({ jobId: jobId.data, err: (err as Error).message }, 'arbiter execute failed');
    return c.json({ error: 'execution failed', detail: (err as Error).message }, 502);
  }
});
