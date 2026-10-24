import { createWalletClient, decodeEventLog, parseAbi, type Abi, type Hex } from 'viem';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { agreementEscrowAbi } from './abis/agreementEscrow.js';
import { readAgreementView } from './agreementEscrowLive.js';
import { arcChain, arcTransport, publicClient } from './client.js';
import { loadPlatformSigners, type PlatformSigners, type PlatformTarget } from './platformSigners.js';
import { suiteAddresses } from './suiteConfig.js';

export const checkVerifierAbi = parseAbi([
  'function report(address family, bytes32 dealId, uint32 revision, bool pass, bytes32 evidenceHash, address[] signers, bytes[] sigs)',
  'function reportDigest(address family, bytes32 dealId, uint32 revision, bool pass, bytes32 evidenceHash) view returns (bytes32)',
  'event Reported(address indexed family, bytes32 indexed dealId, uint32 revision, bool pass, bytes32 evidenceHash)',
]);

export const recordIssuerAbi = parseAbi([
  'function recordFact(address wallet, bytes32 kind, uint8 level, bytes32 evidenceSeal, uint64 expiresAt) returns (uint256)',
  'function revoke(uint256 id)',
]);

function build(): { signers: PlatformSigners | null; problem: string | null } {
  const addrs = suiteAddresses();
  if (!addrs) return { signers: null, problem: 'the escrow family is not set up here' };
  const checkerKeys = (config.SUITE_CHECKER_KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean);
  const targets: Record<PlatformTarget, { address: Hex; abi: Abi }> = {
    verifier: { address: addrs.verifier, abi: checkVerifierAbi },
    escrow: { address: addrs.agreement, abi: agreementEscrowAbi as Abi },
    record: { address: addrs.record, abi: recordIssuerAbi },
  };
  return loadPlatformSigners(
    { checkerKeys, arbiterKey: config.SUITE_ARBITER_KEY, issuerKey: config.SUITE_ISSUER_KEY },
    {
      family: addrs.agreement,
      readReportDigest: ({ family, dealId, revision, pass, evidenceHash }) =>
        publicClient.readContract({
          address: addrs.verifier,
          abi: checkVerifierAbi,
          functionName: 'reportDigest',
          args: [family, dealId, revision, pass, evidenceHash],
        }),
      async send(_from, fn, args, { account, to }) {
        const target = targets[to];
        // The account goes in whole so viem signs here and sends a raw transaction.
        const wallet = createWalletClient({ account, chain: arcChain, transport: arcTransport });
        const hash = await wallet.writeContract({ address: target.address, abi: target.abi, functionName: fn, args, account, chain: arcChain });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') throw new Error(`${to}.${fn} reverted (tx ${hash})`);
        return hash;
      },
      readView: (dealId) => readAgreementView(addrs.agreement, dealId),
      async receiptReported(txHash, dealId, revision) {
        const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
        return receipt.logs.some((log) => {
          if (log.address.toLowerCase() !== addrs.verifier.toLowerCase()) return false;
          try {
            const ev = decodeEventLog({ abi: checkVerifierAbi, data: log.data, topics: log.topics });
            return ev.eventName === 'Reported' && ev.args.dealId.toLowerCase() === dealId.toLowerCase() && ev.args.revision === revision;
          } catch {
            return false;
          }
        });
      },
      log: (line) => logger.warn({ component: 'platform-signers' }, line),
    },
  );
}

const loaded = build();
if (loaded.problem && suiteAddresses()) logger.error({ component: 'platform-signers' }, `escrow family keys: ${loaded.problem}`);

/// Null until the escrow family's addresses and all five keys are configured and valid.
export const platformSigners: PlatformSigners | null = loaded.signers;
/// Why there are no signers, for the boot check. Names a key, never its value.
export const platformSignersProblem: string | null = loaded.problem;
