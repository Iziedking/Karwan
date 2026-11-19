import { verifyTypedData } from 'viem';
import { dealRecordDigest, type DealRecord } from '../deals/dealRecord.js';
import { DEAL_RECORD_EIP712_TYPES, dealRecordMessage, eip712Domain } from './credential.js';
import { issuerAddress, signAsIssuer } from './issuer.js';

/// Karwan's signature on a deal record (view 94), made with the attestation
/// issuer key so it checks against the one address the issuer manifest names.

export interface DealRecordProof {
  type: 'eip712';
  primaryType: 'KarwanDealRecord';
  domain: { name: string; version: string; chainId: number };
  issuer: string;
  signature: `0x${string}`;
}

/// The record's digest and its proof, or null when issuance is off.
export async function signDealRecord(record: DealRecord, writtenAt: number, chainId: number): Promise<{ digest: `0x${string}`; proof: DealRecordProof } | null> {
  const issuer = issuerAddress();
  if (!issuer) return null;
  const digest = dealRecordDigest(record);
  const domain = eip712Domain(chainId);
  const signature = await signAsIssuer({
    domain,
    types: DEAL_RECORD_EIP712_TYPES,
    primaryType: 'KarwanDealRecord',
    message: dealRecordMessage(record.jobId, digest, writtenAt),
  });
  if (!signature) return null;
  return { digest, proof: { type: 'eip712', primaryType: 'KarwanDealRecord', domain: { ...domain }, issuer, signature } };
}

/// Whether this proof was made by its named issuer over exactly this record
/// and time. The digest is rebuilt from the record, never taken from storage.
export async function verifyDealRecord(record: DealRecord, writtenAt: number, proof: DealRecordProof): Promise<boolean> {
  try {
    return await verifyTypedData({
      address: proof.issuer as `0x${string}`,
      domain: proof.domain,
      types: DEAL_RECORD_EIP712_TYPES,
      primaryType: 'KarwanDealRecord',
      message: dealRecordMessage(record.jobId, dealRecordDigest(record), writtenAt),
      signature: proof.signature,
    });
  } catch {
    return false;
  }
}
