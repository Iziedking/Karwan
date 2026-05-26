import { circleWalletsClient } from '../circle/wallets.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface ContractCallInput {
  walletId: string;
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters: unknown[];
  feeLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  /// How many 2s poll iterations to wait for the tx to settle. Default 45
  /// (~90s). Raise for chains/paths where Circle DCW confirmation runs slow
  /// (e.g. the CCTP bridge approve+burn on Base Sepolia, which can exceed 90s
  /// and otherwise throws "did not settle" even though the tx confirms).
  pollAttempts?: number;
  /// Explicit idempotency key, UUID v4. When provided, Circle dedupes
  /// server-side across retries with the same key — so a network blip that
  /// loses our response after Circle accepted the submission no longer
  /// risks a double submission on retry. Persist this key BEFORE the submit
  /// call (e.g. on the bridge record at createBridge time) and reuse it on
  /// every retry of the same logical operation. Omit on one-shot calls
  /// where the SDK's auto-generated per-call key is sufficient; the SDK
  /// generates one automatically when this field is undefined.
  idempotencyKey?: string;
  /// Pre-flight gas/fee estimate via Circle's estimateContractExecutionFee.
  /// Default: estimate when feeLevel is HIGH (a signal that this tx runs on a
  /// fee-volatile chain like Base/Eth Sepolia where the projected cost matters
  /// before submission). Pass `true` to force estimation, `false` to skip it
  /// entirely, e.g. for the Arc fast path where USDC-as-gas is predictable and
  /// the extra round-trip would double user-facing latency.
  estimate?: boolean;
}

export interface FeeEstimate {
  /// Raw SDK response per tier. Field names match Circle's TransactionFee
  /// (gasLimit, gasPrice, maxFee, priorityFee). SCA wallets also include
  /// callGasLimit / verificationGasLimit / preVerificationGas at the top level
  /// of the response, which the SDK exposes through the same shape.
  low?: Record<string, string | undefined>;
  medium?: Record<string, string | undefined>;
  high?: Record<string, string | undefined>;
}

export interface ContractCallResult {
  txId: string;
  txHash: string;
  explorerUrl: string;
  /// Present when an estimate was run pre-submission (see ContractCallInput
  /// .estimate). null when estimation was skipped or failed (non-fatal).
  estimatedFee?: FeeEstimate | null;
}

export interface TxState {
  state?: string;
  txHash?: string;
}

/// Pre-flight fee estimate. Best-effort: any failure is swallowed and the
/// caller proceeds with the submit. Returns null when estimation is skipped
/// (the default on Arc's fast feeLevel='MEDIUM' path) or when Circle's API
/// errors. When it succeeds, the low/medium/high tier values are logged
/// alongside the call label so an ops glance shows the projected cost
/// budget for fee-volatile chain calls (CCTP source-side approve / burn).
async function maybeEstimateFee(
  input: ContractCallInput,
  label: string,
): Promise<FeeEstimate | null> {
  // Heuristic: HIGH feeLevel means a fee-volatile chain (the only place we
  // currently use HIGH is the bridge approve/burn on Base/Eth/OP/Arb/Polygon
  // Sepolia). On Arc the fee is predictable and an estimate would only add
  // latency; opt-in via explicit `estimate: true` if a caller wants it.
  const shouldEstimate = input.estimate ?? input.feeLevel === 'HIGH';
  if (!shouldEstimate) return null;
  try {
    const client = circleWalletsClient();
    const res = await client.estimateContractExecutionFee({
      contractAddress: input.contractAddress,
      abiFunctionSignature: input.abiFunctionSignature,
      abiParameters: input.abiParameters as never,
      source: { walletId: input.walletId },
    });
    const data = res.data;
    if (!data) return null;
    const fees: FeeEstimate = {
      low: data.low as Record<string, string | undefined> | undefined,
      medium: data.medium as Record<string, string | undefined> | undefined,
      high: data.high as Record<string, string | undefined> | undefined,
    };
    logger.info(
      {
        label,
        mediumGasLimit: fees.medium?.gasLimit,
        mediumMaxFee: fees.medium?.maxFee,
        mediumGasPrice: fees.medium?.gasPrice,
        highGasLimit: fees.high?.gasLimit,
        highMaxFee: fees.high?.maxFee,
      },
      'tx fee estimated',
    );
    return fees;
  } catch (err) {
    // Non-fatal. The submit still proceeds; we just don't get the projected
    // cost in the logs. Most common cause: a transient network blip on the
    // estimate endpoint that doesn't affect the actual submit.
    logger.warn(
      { label, err: (err as Error).message },
      'tx fee estimation failed (non-fatal)',
    );
    return null;
  }
}

/// Submit a contract execution and return the Circle transaction id WITHOUT
/// waiting for it to settle. Callers that can tolerate slow settlement (the
/// CCTP source-chain approve+burn on testnet) persist this id and poll it in a
/// background loop, so a slow-but-successful Circle tx is never thrown away.
export async function submitContractCall(
  input: ContractCallInput,
  label: string,
): Promise<{ txId: string; estimatedFee: FeeEstimate | null }> {
  const estimatedFee = await maybeEstimateFee(input, label);

  const client = circleWalletsClient();
  const fee = input.feeLevel ?? 'MEDIUM';
  const created = await client.createContractExecutionTransaction({
    walletId: input.walletId,
    contractAddress: input.contractAddress,
    abiFunctionSignature: input.abiFunctionSignature,
    abiParameters: input.abiParameters as never,
    fee: { type: 'level', config: { feeLevel: fee } },
    // Only forward when explicitly provided; the SDK generates a fresh UUID
    // per request when idempotencyKey is undefined.
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  });
  const txId = created.data?.id;
  if (!txId) throw new Error(`${label}: createContractExecutionTransaction returned no id`);
  return { txId, estimatedFee };
}

/// Single read of a Circle transaction's state + on-chain hash. The hash is
/// populated once Circle reaches COMPLETE (and sometimes earlier).
export async function getTxState(txId: string): Promise<TxState> {
  const client = circleWalletsClient();
  const { data } = await client.getTransaction({ id: txId });
  return { state: data?.transaction?.state, txHash: data?.transaction?.txHash };
}

/// Submit a contract execution and block until it settles. Use this only on
/// fast paths (Arc, where USDC is gas and finality is sub-second) or inside a
/// background loop. For the CCTP source side prefer submitContractCall + a
/// background poll, because testnet settlement can exceed any sane sync window.
export async function executeContractCall(
  input: ContractCallInput,
  label: string,
): Promise<ContractCallResult> {
  const { txId, estimatedFee } = await submitContractCall(input, label);

  // Circle typically settles testnet txs in < 20s. We poll every 2s up to the
  // configured attempt cap (default 45 = ~90s).
  const attempts = input.pollAttempts ?? 45;
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { state, txHash } = await getTxState(txId);
    if (state === 'COMPLETE') {
      if (!txHash) throw new Error(`${label}: completed without txHash`);
      const explorerUrl = `${config.ARC_TESTNET_EXPLORER_URL}/tx/${txHash}`;
      logger.info({ label, txHash, explorerUrl }, 'tx confirmed');
      return { txId, txHash, explorerUrl, estimatedFee };
    }
    if (state === 'FAILED' || state === 'CANCELLED' || state === 'DENIED') {
      throw new Error(`${label}: tx ${state}`);
    }
  }
  throw new Error(`${label}: tx did not settle within ${attempts * 2}s`);
}
