import { encodeAbiParameters, isAddress, keccak256, parseAbiParameters, toBytes, type Address, type Hex } from 'viem';
import { FACT, encodeEnvelope, factBody } from '../shared/adapterReport.js';
import { fingerprint } from '../shared/canonical.js';
import { GITHUB_WORK_RULE, workLevel, workStats } from '../shared/workRule.js';
import { parseGistProof, proofMessage, proofProblem, type ProofProblem } from './gist.js';

export const WORK_FACT_KIND = keccak256(toBytes('karwan.fact.github_work.v1'));
const YEAR = 365 * 86_400;

export interface RecordConfig {
  chainId: number;
  adapter: Address;
}

export interface WorkRequest {
  op: 1 | 2;
  wallet: Address;
  login: string;
  gistId: string;
  factId?: string;
}

export interface RecordPorts {
  now(): number;
  gist(gistId: string): { owner: string; text: string } | null;
  user(login: string): { id: number; createdAt: number } | null;
  /// Pull requests by the login merged in the last year; null when GitHub did not answer.
  mergedPrs(login: string, sinceSec: number): { repo: string; mergedAt: number }[] | null;
  stars(repos: string[]): Record<string, number> | null;
  /// ECDSA for a plain wallet, ERC-1271 on Arc for a smart account.
  verifySignature(wallet: Address, message: string, signature: Hex): boolean;
  sealKey(): Hex;
  writeReport(report: Hex): { ok: boolean };
}

export type WorkOutcome =
  | { outcome: 'written' | 'no-fact'; level: number }
  | { outcome: 'revoked' | 'unavailable' | 'write-failed' | 'bad-request' | 'GIST_UNAVAILABLE' | 'BAD_PROOF' | 'BAD_SIGNATURE' }
  | { outcome: ProofProblem };

const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
const GIST_ID = /^[0-9a-f]{1,64}$/;

/// The person asked, with consent, for their public GitHub work to count.
/// The fact is written by the DON through the adapter, never by Karwan.
export function handleWorkRequest(ports: RecordPorts, config: RecordConfig, req: WorkRequest): WorkOutcome {
  if (!isAddress(req.wallet) || !LOGIN.test(req.login) || !GIST_ID.test(req.gistId)) return { outcome: 'bad-request' };
  if (req.op === 2 && !(req.factId && /^[0-9]{1,30}$/.test(req.factId))) return { outcome: 'bad-request' };
  if (req.op !== 1 && req.op !== 2) return { outcome: 'bad-request' };
  const now = ports.now();

  const gist = ports.gist(req.gistId);
  if (!gist) return { outcome: 'GIST_UNAVAILABLE' };
  const proof = parseGistProof(gist.text);
  if (!proof) return { outcome: 'BAD_PROOF' };
  const problem = proofProblem(proof, { wallet: req.wallet, login: req.login, gistOwner: gist.owner, now });
  if (problem) return { outcome: problem };
  if (!ports.verifySignature(req.wallet, proofMessage(req.wallet, proof.login, proof.issued), proof.signature)) {
    return { outcome: 'BAD_SIGNATURE' };
  }

  const write = (body: Hex) =>
    ports.writeReport(encodeEnvelope({ kind: FACT, chainId: config.chainId, adapter: config.adapter, issuedAt: now, body }).report).ok;

  if (req.op === 2) {
    const zero = `0x${'0'.repeat(64)}` as Hex;
    const ok = write(factBody({ op: 2, wallet: req.wallet, factKind: WORK_FACT_KIND, level: 0, evidenceSeal: zero, expiresAt: 0, factId: BigInt(req.factId!), accountKey: zero }));
    return { outcome: ok ? 'revoked' : 'write-failed' };
  }

  const user = ports.user(req.login);
  const merged = ports.mergedPrs(req.login, now - YEAR);
  if (!user || merged === null) return { outcome: 'unavailable' };
  const candidates = [...new Set(merged.map((m) => m.repo.toLowerCase()))].filter((r) => !r.startsWith(`${req.login.toLowerCase()}/`));
  const stars = ports.stars(candidates.slice(0, 8));
  if (stars === null) return { outcome: 'unavailable' };
  const stats = workStats({ login: req.login, createdAt: user.createdAt, now, merged, stars });
  const level = workLevel(stats);
  if (level === 0) return { outcome: 'no-fact', level };

  // Both keyed, so public GitHub data cannot be matched to a wallet. The seal
  // goes to the record and proves the numbers behind the level; the account
  // key names only the account, so the adapter holds it to one person.
  const sealKey = ports.sealKey();
  const accountKey = keccak256(encodeAbiParameters(parseAbiParameters('bytes32, uint256, string'), [
    sealKey,
    BigInt(user.id),
    GITHUB_WORK_RULE,
  ]));
  const seal = keccak256(encodeAbiParameters(parseAbiParameters('bytes32, uint256, string, bytes32'), [
    sealKey,
    BigInt(user.id),
    GITHUB_WORK_RULE,
    fingerprint(stats),
  ]));
  const ok = write(factBody({ op: 1, wallet: req.wallet, factKind: WORK_FACT_KIND, level, evidenceSeal: seal, expiresAt: now + YEAR, factId: 0n, accountKey }));
  return ok ? { outcome: 'written', level } : { outcome: 'write-failed' };
}
