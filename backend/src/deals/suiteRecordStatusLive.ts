import { parseAbi, type Hex } from 'viem';
import { agreementEscrowAbi } from '../chain/abis/agreementEscrow.js';
import { readAgreementTerms } from '../chain/agreementEscrowLive.js';
import { publicClient } from '../chain/client.js';
import { suiteAddresses } from '../chain/suiteConfig.js';
import { registryAbi } from '../identity/suiteIdentity.js';
import { readRecordSides, type RecordSide, type RecordStatusPorts } from './suiteRecordStatus.js';

const recordAbi = parseAbi(['function outcomeRecorded(bytes32 key) view returns (bool)']);

/// Where a suite deal's outcome stands on each side's record, read from the chain.
/// The buyer's record id is the escrow's payer id; the seller's is the identity
/// their payee wallet is bound to. Null where the escrow family is not set up.
export async function suiteRecordSides(dealId: Hex): Promise<{ buyer: RecordSide; seller: RecordSide } | null> {
  const addrs = suiteAddresses();
  if (!addrs) return null;
  const ports: RecordStatusPorts = {
      family: addrs.agreement,
      subjects: async (id) => {
        const [account, terms] = await Promise.all([
          publicClient.readContract({ address: addrs.agreement, abi: agreementEscrowAbi, functionName: 'accountOf', args: [id] }) as Promise<{ payerId: bigint }>,
          readAgreementTerms(addrs.agreement, id),
        ]);
        const [sellerId] = await publicClient.readContract({ address: addrs.identity, abi: registryAbi, functionName: 'bindingOf', args: [terms.seller] });
        return { buyer: BigInt(account.payerId), seller: BigInt(sellerId) };
      },
      outcomeRecorded: (key) => publicClient.readContract({ address: addrs.record, abi: recordAbi, functionName: 'outcomeRecorded', args: [key] }),
      pendingRecord: async (key) =>
        Number(await publicClient.readContract({ address: addrs.agreement, abi: agreementEscrowAbi, functionName: 'pendingRecord', args: [key] })) !== 0,
  };
  return readRecordSides(ports, dealId);
}
