import { encodeAbiParameters, formatUnits, keccak256, parseUnits, toBytes, type Address } from 'viem';

import {
  computeFunding,
  getEscrowFeeBps,
  jobBoard,
  readPostedJobId,
  readUsdcBalance,
} from '../chain/contracts.js';
// Circle Developer-Controlled Wallet execution is kept behind the existing
// txs seam. Built against the repository's installed viem/Circle packages on
// 2026-09-15; the route and the operator seed command share this path.
import { executeContractCall } from '../chain/txs.js';
import { resolveBuyerProfileForUser } from '../agents/agent-registry.js';
import { accountTypeOf, deriveJobLane } from '../profile/accountType.js';
import {
  createBrief,
  deleteBrief,
  findBriefBySeedKey,
  patchBrief,
  rekeyBrief,
} from '../db/briefs.js';
import { extractKeywords } from '../llm/keywords.js';
import { logger } from '../logger.js';

const USDC_DECIMALS = 6;

export type ManagedJobPostInput = {
  posterAddress: string;
  brief: string;
  budgetUsdc: number;
  deadlineDays?: number;
  deadlineSeconds?: number;
  negotiationMaxIncreasePct?: number;
  trustedMatch?: boolean;
  milestonePcts?: number[];
  tradeType?: 'service' | 'goods' | 'mixed';
  incoterms?: 'EXW' | 'FCA' | 'FOB' | 'CIF' | 'DAP' | 'DDP';
  paymentTerms?: 'immediate' | 'net30' | 'net60' | 'net90';
  counterpartyCompany?: {
    name?: string;
    sector?: string;
    region?: string;
  };
  documentRefs?: Array<{
    hash: string;
    kind: 'invoice' | 'po' | 'bol' | 'coo' | 'pod' | 'other';
    label?: string;
  }>;
};

type ManagedJobPostSuccess = {
  ok: true;
  jobId: string;
  deadlineUnix: number;
  result?: Awaited<ReturnType<typeof executeContractCall>>;
  reused: boolean;
};

type ManagedJobPostFailure = {
  ok: false;
  status: 409 | 502;
  body: Record<string, unknown>;
};

export type ManagedJobPostResult = ManagedJobPostSuccess | ManagedJobPostFailure;

/**
 * Posts one managed buyer request using the same durable metadata and real
 * JobBoard transaction path as the HTTP route. `seedKey` is operator metadata
 * only and never reaches the public marketplace projection.
 */
export async function postManagedJob(
  body: ManagedJobPostInput,
  options: { seedKey?: string } = {},
): Promise<ManagedJobPostResult> {
  if (options.seedKey) {
    const existing = findBriefBySeedKey(options.seedKey);
    if (existing) {
      return {
        ok: true,
        jobId: existing.jobId,
        deadlineUnix: Math.floor((existing.createdAt + 86_400_000) / 1_000),
        reused: true,
      };
    }
  }

  const buyerProfile = await resolveBuyerProfileForUser(body.posterAddress);
  if (!buyerProfile) {
    return {
      ok: false,
      status: 409,
      body: {
        error: 'buyer profile required',
        detail: 'Activate the buyer agent and set up a buyer profile before posting a request.',
      },
    };
  }

  try {
    const priceWei = parseUnits(String(body.budgetUsdc), USDC_DECIMALS);
    const [agentBalance, feeBps] = await Promise.all([
      readUsdcBalance(buyerProfile.address),
      getEscrowFeeBps(),
    ]);
    const { fundedAmount } = computeFunding(priceWei, feeBps);
    const required = fundedAmount + parseUnits('0.5', USDC_DECIMALS);

    if (agentBalance < required) {
      const shortfall = required - agentBalance;
      return {
        ok: false,
        status: 409,
        body: {
          error: 'insufficient buyer balance',
          code: 'FUND_BUYER_AGENT',
          detail: 'The buyer agent needs funds before this request can go live.',
          agentAddress: buyerProfile.address,
          balanceUsdc: formatUnits(agentBalance, USDC_DECIMALS),
          requiredUsdc: formatUnits(required, USDC_DECIMALS),
          topUpNeededUsdc: formatUnits(shortfall, USDC_DECIMALS),
          budgetUsdc: body.budgetUsdc,
        },
      };
    }
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'buyer balance precheck skipped');
  }

  const salt = keccak256(toBytes(`${body.brief}|${Date.now()}|${Math.random()}`));
  let jobId = keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'bytes32' }],
      [buyerProfile.address as Address, salt],
    ),
  );
  const budgetWei = parseUnits(body.budgetUsdc.toString(), USDC_DECIMALS);
  const deadlineSeconds = body.deadlineSeconds ?? (body.deadlineDays ?? 1) * 86_400;
  const deadlineUnix = Math.floor(Date.now() / 1_000) + deadlineSeconds;
  const termsHash = keccak256(toBytes(body.brief));
  const posterAccountType = await accountTypeOf(body.posterAddress);

  createBrief({
    jobId,
    briefText: body.brief,
    postedBy: body.posterAddress,
    seedKey: options.seedKey,
    negotiationMaxIncreasePct: body.negotiationMaxIncreasePct,
    milestonePcts: body.milestonePcts,
    trustedMatch: body.trustedMatch === true,
    tradeLane: deriveJobLane(posterAccountType, body.tradeType),
    partyKind: posterAccountType,
    tradeType: body.tradeType,
    incoterms: body.incoterms,
    paymentTerms: body.paymentTerms,
    counterpartyCompany: body.counterpartyCompany,
    documentRefs: body.documentRefs,
  });

  extractKeywords(body.brief, `brief:${jobId}`)
    .then((keywords) => patchBrief(jobId, { keywords }))
    .catch((err) => logger.warn({ jobId, err: err instanceof Error ? err.message : String(err) }, 'brief keyword extraction failed'));

  try {
    const result = await executeContractCall(
      {
        walletId: buyerProfile.walletId,
        contractAddress: jobBoard.address,
        abiFunctionSignature: 'postJob(bytes32,uint256,uint64,string)',
        abiParameters: [salt, budgetWei.toString(), deadlineUnix.toString(), termsHash],
      },
      `postJob(${jobId})`,
    );
    const realJobId = await readPostedJobId(result.txHash);
    if (!realJobId) {
      deleteBrief(jobId);
      return {
        ok: false,
        status: 502,
        body: { error: 'postJob reverted', detail: 'The request did not post on chain. Please try again.' },
      };
    }
    if (realJobId.toLowerCase() !== jobId.toLowerCase()) {
      rekeyBrief(jobId, realJobId);
      jobId = realJobId as `0x${string}`;
    }
    return { ok: true, jobId, deadlineUnix, result, reused: false };
  } catch (err) {
    logger.error({ jobId, err: err instanceof Error ? err.message : String(err) }, 'postJob failed');
    return {
      ok: false,
      status: 502,
      body: { error: 'postJob failed', detail: err instanceof Error ? err.message : String(err) },
    };
  }
}
