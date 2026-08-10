import { privateKeyToAccount } from 'viem/accounts';
import { verifyTypedData } from 'viem';
import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  DEAL_SETTLED_TYPE,
  DEAL_SETTLED_EIP712_TYPES,
  amountBand,
  attestationId,
  dealRef,
  dealSettledMessage,
  eip712Domain,
  schemaUrl,
  statusListUrl,
  type DealSettledAttestation,
  type DealSettledClaim,
} from './credential.js';

/// Holding the key and performing the act of issuing. Everything about the SHAPE
/// of an attestation lives in credential.ts, which is published; this module is
/// the part that stays private.
///
/// The split is not tidiness. credential.ts is generated into the schema and the
/// manifest, so anything that reaches into config or touches a secret would leak
/// into a document we serve to strangers.

/// An unset declared address is not a mismatch: the key alone is enough to issue,
/// and the manifest then publishes whatever it derives to. Setting the address is
/// how an operator pins which key is allowed to sign, so once it is set, a
/// different key is a configuration accident and must not be papered over.
export function keyMatchesDeclaredAddress(
  declared: string | undefined,
  derived: string,
): boolean {
  if (!declared) return true;
  return declared.toLowerCase() === derived.toLowerCase();
}

let cached: { account: ReturnType<typeof privateKeyToAccount> } | null | undefined;

/// Resolved once. `undefined` means not yet looked at, `null` means looked at and
/// unavailable, which is a state worth distinguishing so the "issuance is off"
/// warning fires once rather than on every deal in every sweep.
function account(): ReturnType<typeof privateKeyToAccount> | null {
  if (cached !== undefined) return cached?.account ?? null;

  const key = config.ATTESTATION_ISSUER_PRIVATE_KEY;
  if (!key) {
    logger.info(
      'attestation issuance is off: ATTESTATION_ISSUER_PRIVATE_KEY is unset',
    );
    cached = null;
    return null;
  }

  const acct = privateKeyToAccount(key as `0x${string}`);
  const declared = config.ATTESTATION_ISSUER_ADDRESS;
  if (!keyMatchesDeclaredAddress(declared, acct.address)) {
    // Fail closed. The manifest publishes `declared` as the verification key, so
    // signing with a different one produces documents that every consumer reads
    // as invalid. Refusing to issue is recoverable; a run of unverifiable
    // attestations against our own issuer profile is not.
    logger.error(
      { declared, derived: acct.address },
      'attestation issuance disabled: ATTESTATION_ISSUER_ADDRESS does not match the address ATTESTATION_ISSUER_PRIVATE_KEY derives to',
    );
    cached = null;
    return null;
  }

  logger.info({ address: acct.address }, 'attestation issuer key loaded');
  cached = { account: acct };
  return acct;
}

/// Test seam. The key is resolved once and memoised, which is right in a process
/// that runs for weeks and wrong in a test file that changes the env between
/// cases.
export function resetIssuerCache(): void {
  cached = undefined;
}

/// The address we can actually sign with, or null. The manifest reports this, so
/// a misconfigured deploy publishes `null` and says nothing, instead of naming a
/// key it cannot use.
export function issuerAddress(): string | null {
  return account()?.address ?? null;
}

export function issuanceEnabled(): boolean {
  return account() !== null;
}

export interface IssueInput {
  jobId: string;
  /// The subject's identity wallet, not their agent wallet. An attestation is
  /// evidence about a party, and the party is who a counterparty would look up.
  subject: string;
  role: 'buyer' | 'seller';
  /// Unix ms, from the deal's settledAt.
  settledAt: number;
  amountUsdc: number;
  viaDispute: boolean;
  chainId: number;
}

export interface IssuedDocument {
  id: string;
  dealRef: `0x${string}`;
  document: DealSettledAttestation;
}

/// Build and sign one attestation. Returns null when no key is configured, which
/// callers treat as "issuance is off" rather than as a failure: an operator who
/// has not set a key has not asked us to publish anything.
export async function issueDealSettled(input: IssueInput): Promise<IssuedDocument | null> {
  const acct = account();
  if (!acct) return null;

  const ref = dealRef(input.jobId);
  const id = attestationId(ref, input.role);

  const claim: DealSettledClaim = {
    dealRef: ref,
    role: input.role,
    settledAt: new Date(input.settledAt).toISOString(),
    amountBand: amountBand(input.amountUsdc),
    currency: 'USDC',
    chainId: input.chainId,
    viaDispute: input.viaDispute,
  };

  const domain = eip712Domain(input.chainId);
  const signature = await acct.signTypedData({
    domain,
    types: DEAL_SETTLED_EIP712_TYPES,
    primaryType: 'DealSettled',
    message: dealSettledMessage(input.subject, claim),
  });

  const document: DealSettledAttestation = {
    type: DEAL_SETTLED_TYPE,
    schema: schemaUrl(),
    id,
    issuer: {
      name: 'Karwan',
      domain: new URL(config.FRONTEND_BASE_URL ?? 'https://karwan.site').host,
      address: acct.address,
    },
    subject: { address: input.subject },
    claim,
    // The moment we said it, distinct from settledAt, which is the moment it
    // happened. A consumer needs both to reason about a backfill: an attestation
    // issued long after settlement is a sweep catching up, not a late deal.
    issuedAt: new Date().toISOString(),
    status: { listUrl: statusListUrl() },
    proof: {
      type: 'eip712',
      domain,
      primaryType: 'DealSettled',
      signature,
    },
  };

  return { id, dealRef: ref, document };
}

/// Verify a document against its own proof. Used by the tests, and exported
/// because an issuer that cannot demonstrate its own verification path is asking
/// consumers to write it for us.
export async function verifyDealSettled(doc: DealSettledAttestation): Promise<boolean> {
  if (!doc.proof) return false;
  try {
    return await verifyTypedData({
      address: doc.issuer.address as `0x${string}`,
      domain: doc.proof.domain,
      types: DEAL_SETTLED_EIP712_TYPES,
      primaryType: 'DealSettled',
      message: dealSettledMessage(doc.subject.address, doc.claim),
      signature: doc.proof.signature,
    });
  } catch {
    return false;
  }
}
