import type { Address, Hex } from 'viem';
import { config } from '../config.js';
import { publicClient } from './client.js';
import { evidenceRegistryAbi } from './abis/evidenceRegistry.js';

export type EvidenceReceiptState =
  | 'not-configured'
  | 'not-recorded'
  | 'pass'
  | 'mismatch'
  | 'unavailable'
  | 'expired'
  | 'stale-terms'
  | 'stale-delivery'
  | 'read-unavailable';

export interface EvidenceReceiptView {
  state: EvidenceReceiptState;
  agreementVersion: number;
  registryAddress?: Address;
  termsVersion?: number;
  evidenceRevision?: number;
  expectedEvidenceRevision?: number;
  expiresAt?: number;
  recordedAt?: number;
  evidenceCommitment?: Hex;
  verdictCommitment?: Hex;
  reportId?: Hex;
}

export interface RawEvidenceReceipt {
  termsVersion: bigint;
  evidenceRevision: bigint;
  expiresAt: bigint;
  decisionCode: number;
  evidenceCommitment: Hex;
  verdictCommitment: Hex;
  reportId: Hex;
  recordedAt: bigint;
}

export function classifyEvidenceReceipt(
  raw: RawEvidenceReceipt,
  agreementVersion: number,
  nowSeconds: number,
  registryAddress?: Address,
  expected?: { evidenceRevision?: number; evidenceCommitment?: Hex; reportId?: Hex; requireBinding?: boolean },
): EvidenceReceiptView {
  if (raw.termsVersion === 0n) {
    return { state: 'not-recorded', agreementVersion, registryAddress };
  }
  // A chain verdict is not current until the request completion binds its exact
  // report. This prevents a replaced worker's chain write from bypassing fencing.
  if (expected?.requireBinding && (!expected.reportId || !expected.evidenceCommitment || !expected.evidenceRevision)) {
    return { state: 'not-recorded', agreementVersion, registryAddress };
  }
  const detail = {
    agreementVersion,
    registryAddress,
    termsVersion: Number(raw.termsVersion),
    evidenceRevision: Number(raw.evidenceRevision),
    expiresAt: Number(raw.expiresAt),
    recordedAt: Number(raw.recordedAt),
    evidenceCommitment: raw.evidenceCommitment,
    verdictCommitment: raw.verdictCommitment,
    reportId: raw.reportId,
  };
  if (detail.termsVersion !== agreementVersion) return { ...detail, state: 'stale-terms' };
  if (
    expected?.evidenceRevision !== undefined
    && detail.evidenceRevision !== expected.evidenceRevision
  ) {
    return { ...detail, expectedEvidenceRevision: expected.evidenceRevision, state: 'stale-delivery' };
  }
  if (
    expected?.evidenceCommitment !== undefined
    && detail.evidenceCommitment !== expected.evidenceCommitment
  ) {
    return { ...detail, expectedEvidenceRevision: expected.evidenceRevision, state: 'stale-delivery' };
  }
  if (expected?.reportId && detail.reportId.toLowerCase() !== expected.reportId.toLowerCase()) {
    return { ...detail, state: 'stale-delivery' };
  }
  if (detail.expiresAt < nowSeconds) return { ...detail, state: 'expired' };
  if (raw.decisionCode === 1) return { ...detail, state: 'pass' };
  if (raw.decisionCode === 2) return { ...detail, state: 'mismatch' };
  return { ...detail, state: 'unavailable' };
}

export async function readEvidenceReceipt(
  dealId: string,
  agreementVersion: number,
  expected?: { evidenceRevision?: number; evidenceCommitment?: Hex; reportId?: Hex; requireBinding?: boolean },
): Promise<EvidenceReceiptView> {
  const registryAddress = config.KARWAN_EVIDENCE_REGISTRY_ADDR as Address | undefined;
  if (!registryAddress) return { state: 'not-configured', agreementVersion };
  try {
    const raw = await publicClient.readContract({
      address: registryAddress,
      abi: evidenceRegistryAbi,
      functionName: 'receiptOf',
      args: [dealId as Hex],
    });
    return classifyEvidenceReceipt(
      raw as RawEvidenceReceipt,
      agreementVersion,
      Math.floor(Date.now() / 1_000),
      registryAddress,
      expected,
    );
  } catch {
    return { state: 'read-unavailable', agreementVersion, registryAddress };
  }
}
