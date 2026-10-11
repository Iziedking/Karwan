import { parseAbi, parseEventLogs, toHex, type Address, type Hex } from 'viem';
import { publicClient } from '../chain/client.js';
import { deterministicIdempotencyKey, executeContractCall } from '../chain/txs.js';
import { config } from '../config.js';
import { listRecords } from '../db/evidence.js';
import { logger } from '../logger.js';
import { evidenceDeps } from './live.js';
import { sealEvidence } from './evidence.js';
import { createFactPublisher } from './publisher.js';

export const factsAbi = parseAbi([
  'function record(address subject, bytes32 kind, uint8 level, bytes32 evidenceHash, uint64 expiresAt) returns (uint256)',
  'function factsOf(address subject) view returns (uint256[])',
  'function getFact(uint256 id) view returns ((address subject, bytes32 kind, uint8 level, address issuer, uint64 issuedAt, uint64 expiresAt, bool revoked, bytes32 evidenceHash))',
  'event FactRecorded(uint256 indexed id, address indexed subject, bytes32 indexed kind, uint8 level, address issuer, bytes32 evidenceHash, uint64 expiresAt)',
  'event FactRevoked(uint256 indexed id, address issuer)',
]);

const SWEEP_MS = 60_000;

async function existingFactId(contract: Address, subject: Address, evidenceHash: Hex, kind: Hex): Promise<string | null> {
  const ids = await publicClient.readContract({ address: contract, abi: factsAbi, functionName: 'factsOf', args: [subject] });
  for (const id of ids) {
    const f = await publicClient.readContract({ address: contract, abi: factsAbi, functionName: 'getFact', args: [id] });
    if (f.evidenceHash === evidenceHash && f.kind === kind) return id.toString();
  }
  return null;
}

const EVIDENCE_KEY_MIN = 32;

/// Starts the sweep that writes verified facts to KarwanFacts. Off until
/// KARWAN_FACTS_ADDR, FACTS_ISSUER_WALLET_ID and FACTS_EVIDENCE_KEY are set:
/// without the key a stored fingerprint would go on chain as it is.
export function startFactPublisher(): () => void {
  const contract = config.KARWAN_FACTS_ADDR as Address | undefined;
  const walletId = config.FACTS_ISSUER_WALLET_ID;
  const key = config.FACTS_EVIDENCE_KEY;
  if (!contract || !walletId) {
    logger.info('facts publisher off: KARWAN_FACTS_ADDR or FACTS_ISSUER_WALLET_ID is unset');
    return () => {};
  }
  if (!key || key.length < EVIDENCE_KEY_MIN) {
    logger.error(`facts publisher off: FACTS_EVIDENCE_KEY must be set, ${EVIDENCE_KEY_MIN} characters or more`);
    return () => {};
  }

  const publish = createFactPublisher({
    configured: true,
    seal: (evidenceHash) => sealEvidence(evidenceHash, key),
    listSubjects: async () => (await listRecords('facts')).map((r) => r.key),
    getStored: evidenceDeps.getStored,
    putStored: evidenceDeps.putStored,
    recordOnChain: async ({ subject, kind, level, evidenceHash, expiresAtSec }) => {
      const kindHex = toHex(kind, { size: 32 });
      const already = await existingFactId(contract, subject as Address, evidenceHash as Hex, kindHex);
      if (already) return { txHash: '', factId: already };

      const { txHash } = await executeContractCall(
        {
          walletId,
          contractAddress: contract,
          abiFunctionSignature: 'record(address,bytes32,uint8,bytes32,uint64)',
          abiParameters: [subject, kindHex, level, evidenceHash, expiresAtSec],
          // The same fact is the same request to Circle on every retry.
          idempotencyKey: deterministicIdempotencyKey(`karwan-fact:${subject}:${kind}:${evidenceHash}`),
        },
        `facts.record(${kind} ${subject})`,
      );
      // Done only when the receipt carries the event for this exact fact.
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hex });
      const event = parseEventLogs({ abi: factsAbi, logs: receipt.logs, eventName: 'FactRecorded' }).find(
        (e) => e.args.subject.toLowerCase() === subject.toLowerCase() && e.args.evidenceHash === evidenceHash,
      );
      return event ? { txHash, factId: event.args.id.toString() } : null;
    },
    revokeOnChain: async ({ factId }) => {
      const id = BigInt(factId);
      const current = await publicClient.readContract({ address: contract, abi: factsAbi, functionName: 'getFact', args: [id] });
      if (current.revoked) return { txHash: '' };

      const { txHash } = await executeContractCall(
        {
          walletId,
          contractAddress: contract,
          abiFunctionSignature: 'revoke(uint256)',
          abiParameters: [factId],
          idempotencyKey: deterministicIdempotencyKey(`karwan-fact-revoke:${factId}`),
        },
        `facts.revoke(${factId})`,
      );
      // Done only when the receipt carries the revocation of this exact fact.
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hex });
      const event = parseEventLogs({ abi: factsAbi, logs: receipt.logs, eventName: 'FactRevoked' }).find((e) => e.args.id === id);
      return event ? { txHash } : null;
    },
  });

  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    publish()
      .then((n) => {
        if (n > 0) logger.info({ written: n }, 'facts: written to KarwanFacts');
      })
      .catch((err) => logger.warn({ err: (err as Error).message }, 'facts: sweep failed'))
      .finally(() => {
        running = false;
      });
  }, SWEEP_MS);
  return () => clearInterval(timer);
}
