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
  | 'read-unavailable';

export interface EvidenceReceiptView {
  state: EvidenceReceiptState;
  agreementVersion: number;
  registryAddress?: Address;
  termsVersion?: number;
  evidenceRevision?: number;
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
): EvidenceReceiptView {
  if (raw.termsVersion === 0n) {
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
  if (detail.expiresAt < nowSeconds) return { ...detail, state: 'expired' };
  if (raw.decisionCode === 1) return { ...detail, state: 'pass' };
  if (raw.decisionCode === 2) return { ...detail, state: 'mismatch' };
  return { ...detail, state: 'unavailable' };
}

export async function readEvidenceReceipt(
  dealId: string,
  agreementVersion: number,
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
    );
  } catch {
    return { state: 'read-unavailable', agreementVersion, registryAddress };
  }
}
