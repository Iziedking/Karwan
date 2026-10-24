import { bus } from '../events.js';
import { createAgreementEscrow, type AgreementEscrow } from './agreementEscrow.js';
import { agreementEscrowPorts, createAgreementReads } from './agreementEscrowReads.js';
import type { AgreementTerms } from './agreementTerms.js';
import { ARC, publicClient } from './client.js';
import type { DealV3View } from './dealEscrowV3.js';
import { suiteAddresses } from './suiteConfig.js';
import { executeContractCall } from './txs.js';

export { decodeAgreementLogs, viewFromReads } from './agreementEscrowReads.js';

type Hex = `0x${string}`;

/// The Agreement escrow on this network, or null when the suite is not set up.
/// Deals already on it need it to finish, so it does not depend on the boot
/// check, which only decides where new deals open.
export const agreementEscrowAddress: Hex | null = suiteAddresses()?.agreement ?? null;

const reads = createAgreementReads(publicClient);

export const readAgreementTerms = (address: Hex, dealId: Hex): Promise<AgreementTerms> => reads.terms(address, dealId);
export const readAgreementView = (address: Hex, dealId: Hex): Promise<DealV3View> => reads.view(address, dealId);
export const readAgreementEscalatedAt = (address: Hex, dealId: Hex): Promise<bigint> => reads.escalatedAt(address, dealId);
export const readAgreementPanel = (address: Hex, dealId: Hex) => reads.panel(address, dealId);
export const readAgreementReviewEnd = (address: Hex, dealId: Hex): Promise<bigint> => reads.reviewEnd(address, dealId);
export const readAgreementTermsHash = (address: Hex, terms: AgreementTerms): Promise<Hex> => reads.termsHashOf(address, terms);

function bind(address: Hex): AgreementEscrow {
  return createAgreementEscrow(
    agreementEscrowPorts(reads, address, ARC.chainId, {
      execute: (input, label) => executeContractCall(input, label),
      emit: (e) =>
        bus.emitEvent({
          type: e.type as Parameters<typeof bus.emitEvent>[0]['type'],
          jobId: e.jobId,
          actor: e.actor ?? 'platform',
          payload: e.payload ?? {},
        }),
    }),
  );
}

/// The live Agreement escrow, or null when the suite is not set up here.
export const agreementEscrow: AgreementEscrow | null = agreementEscrowAddress ? bind(agreementEscrowAddress) : null;
