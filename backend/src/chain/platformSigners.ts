import type { Hex, LocalAccount } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { DealV3View } from './dealEscrowV3.js';

/// Karwan's own keys on the escrow family: three checkers, of which any two
/// sign a check result, the arbiter that proposes rulings and submits signed
/// checks, and the issuer that writes facts to the record. The keys stay in
/// this closure; nothing returned or logged carries them, only addresses.

const KEY = /^0x[0-9a-fA-F]{64}$/;

export class PlatformKeysError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlatformKeysError';
  }
}

export type PlatformTarget = 'verifier' | 'escrow' | 'record';

export interface PlatformSignerPorts {
  /// The Agreement escrow the checks are for.
  family: Hex;
  readReportDigest(input: { family: Hex; dealId: Hex; revision: number; pass: boolean; evidenceHash: Hex }): Promise<Hex>;
  send(from: Hex, fn: string, args: unknown[], ctx: { account: LocalAccount; to: PlatformTarget }): Promise<Hex>;
  readView(dealId: Hex): Promise<DealV3View>;
  /// True when the receipt of `txHash` holds the verifier's Reported event for
  /// this deal and revision.
  receiptReported(txHash: Hex, dealId: Hex, revision: number): Promise<boolean>;
  log(line: string): void;
}

export interface PlatformKeys {
  checkerKeys: readonly string[];
  arbiterKey: string;
  issuerKey: string;
}

export interface CheckInput {
  dealId: Hex;
  revision: number;
  pass: boolean;
  evidenceHash: Hex;
}

export interface PlatformSigners {
  twoCheckerSignatures(digest: Hex): Promise<{ signers: Hex[]; sigs: Hex[] }>;
  submitCheck(input: CheckInput): Promise<{ txHash: Hex }>;
  arbiterSend(fn: string, args: unknown[]): Promise<{ txHash: Hex }>;
  issuerSend(fn: string, args: unknown[]): Promise<{ txHash: Hex }>;
  addresses(): { checkers: Hex[]; arbiter: Hex; issuer: Hex };
}

function accountOf(key: string, role: string): LocalAccount {
  if (!KEY.test(key)) throw new PlatformKeysError(`the ${role} key is not a private key`);
  return privateKeyToAccount(key as Hex);
}

export function createPlatformSigners(keys: PlatformKeys, ports: PlatformSignerPorts): PlatformSigners {
  if (keys.checkerKeys.length < 3) throw new PlatformKeysError('three checker keys are needed');
  const checkers = keys.checkerKeys
    .map((k, i) => accountOf(k, `checker ${i + 1}`))
    .sort((a, b) => (BigInt(a.address) < BigInt(b.address) ? -1 : 1));
  if (new Set(checkers.map((a) => a.address.toLowerCase())).size !== checkers.length) {
    throw new PlatformKeysError('the checker keys must be three different keys');
  }
  const arbiter = accountOf(keys.arbiterKey, 'arbiter');
  const issuer = accountOf(keys.issuerKey, 'issuer');

  const sendAs = async (account: LocalAccount, to: PlatformTarget, fn: string, args: unknown[]): Promise<Hex> => {
    try {
      return await ports.send(account.address, fn, args, { account, to });
    } catch (err) {
      ports.log(`${to}.${fn} from ${account.address} failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  };

  const twoCheckerSignatures = async (digest: Hex) => {
    const pair = checkers.slice(0, 2);
    const sigs = await Promise.all(pair.map((a) => a.sign!({ hash: digest })));
    return { signers: pair.map((a) => a.address), sigs };
  };

  return {
    twoCheckerSignatures,
    async submitCheck({ dealId, revision, pass, evidenceHash }) {
      const digest = await ports.readReportDigest({ family: ports.family, dealId, revision, pass, evidenceHash });
      const { signers, sigs } = await twoCheckerSignatures(digest);
      const txHash = await sendAs(arbiter, 'verifier', 'report', [ports.family, dealId, revision, pass, evidenceHash, signers, sigs]);
      // A pass shows on the deal itself; a fail leaves only the verifier's event.
      const landed = pass
        ? await ports.readView(dealId).then((v) => v.checkPassed && v.revision === revision)
        : await ports.receiptReported(txHash, dealId, revision);
      if (!landed) {
        ports.log(`check for ${dealId} revision ${revision} did not land (tx ${txHash})`);
        throw new Error(`the check for ${dealId} revision ${revision} did not land`);
      }
      return { txHash };
    },
    async arbiterSend(fn, args) {
      return { txHash: await sendAs(arbiter, 'escrow', fn, args) };
    },
    async issuerSend(fn, args) {
      return { txHash: await sendAs(issuer, 'record', fn, args) };
    },
    addresses: () => ({ checkers: checkers.map((a) => a.address), arbiter: arbiter.address, issuer: issuer.address }),
  };
}
