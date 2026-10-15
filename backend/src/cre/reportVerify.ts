import {
  concatHex,
  createPublicClient,
  hexToBytes,
  http,
  keccak256,
  recoverAddress,
  toHex,
  type Hex,
} from 'viem';
import { mainnet } from 'viem/chains';

/// A report a CRE workflow posts to Karwan over HTTP is trusted only when
/// f+1 distinct nodes of its DON signed it. The DON's signers and f come from
/// Chainlink's Capability Registry on Ethereum mainnet, never from Karwan.
/// Ported from Chainlink's published verifier (docs: verifying reports
/// offchain), with one change: each signer counts once.
const HEADER = 109;
const CAPABILITY_REGISTRY = '0x76c9cf548b4179F8901cda1f8623568b58215E62';

export interface ReportHeader {
  donId: number;
  workflowId: Hex;
  workflowOwner: string;
  body: Hex;
}

const strip0x = (h: string) => (h.startsWith('0x') ? h : `0x${h}`) as Hex;

export function parseReportHeader(raw: string): ReportHeader | null {
  const bytes = hexToBytes(strip0x(raw));
  if (bytes.length < HEADER) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  return {
    donId: view.getUint32(37, false),
    workflowId: toHex(bytes.slice(45, 77)),
    workflowOwner: toHex(bytes.slice(87, 107)).toLowerCase(),
    body: toHex(bytes.slice(HEADER)),
  };
}

export interface VerifyDeps {
  readDon(donId: number): Promise<{ f: number; signers: Set<string> }>;
  workflowIds: Set<string>;
  workflowOwner: string;
  /// `simulation` accepts reports signed by the CLI's test keys, for local
  /// rehearsals only. Production refuses it.
  trust: 'verified' | 'simulation';
  production?: boolean;
}

export type VerifyResult =
  | { ok: true; simulated: boolean; workflowId: Hex; body: Hex }
  | { ok: false; reason: 'BAD_HEADER' | 'UNKNOWN_WORKFLOW' | 'UNKNOWN_OWNER' | 'INSUFFICIENT_SIGNATURES' | 'REGISTRY_UNAVAILABLE' | 'SIMULATION_IN_PRODUCTION' };

export async function verifyDonReport(
  input: { rawReport: string; context: string; signatures: string[] },
  deps: VerifyDeps,
): Promise<VerifyResult> {
  const header = parseReportHeader(input.rawReport);
  if (!header) return { ok: false, reason: 'BAD_HEADER' };
  if (![...deps.workflowIds].some((w) => w.toLowerCase() === header.workflowId.toLowerCase())) return { ok: false, reason: 'UNKNOWN_WORKFLOW' };
  if (header.workflowOwner !== deps.workflowOwner.toLowerCase()) return { ok: false, reason: 'UNKNOWN_OWNER' };
  if (deps.trust === 'simulation') {
    if (deps.production) return { ok: false, reason: 'SIMULATION_IN_PRODUCTION' };
    return { ok: true, simulated: true, workflowId: header.workflowId, body: header.body };
  }

  let don: { f: number; signers: Set<string> };
  try {
    don = await deps.readDon(header.donId);
  } catch {
    return { ok: false, reason: 'REGISTRY_UNAVAILABLE' };
  }
  const hash = keccak256(concatHex([keccak256(strip0x(input.rawReport)), strip0x(input.context)]));
  const counted = new Set<string>();
  for (const s of input.signatures) {
    const sig = hexToBytes(strip0x(s));
    if (sig.length !== 65) continue;
    if (sig[64]! >= 27) sig[64] = sig[64]! - 27;
    try {
      const signer = (await recoverAddress({ hash, signature: toHex(sig) })).toLowerCase();
      if (don.signers.has(signer)) counted.add(signer);
    } catch {
      continue;
    }
    if (counted.size >= don.f + 1) return { ok: true, simulated: false, workflowId: header.workflowId, body: header.body };
  }
  return { ok: false, reason: 'INSUFFICIENT_SIGNATURES' };
}

const readSlot = (bytes: Uint8Array, offset: number) => new DataView(bytes.buffer, bytes.byteOffset + offset + 28, 4).getUint32(0, false);

/// getDON then getNodesByP2PIds on the mainnet Capability Registry, cached per
/// DON: the signer set changes only when Chainlink reconfigures the DON.
export function createRegistryReader(rpcUrl: string) {
  const client = createPublicClient({ chain: mainnet, transport: http(rpcUrl) });
  const cache = new Map<number, { f: number; signers: Set<string> }>();
  return async (donId: number) => {
    const hit = cache.get(donId);
    if (hit) return hit;
    const padded = new Uint8Array(32);
    new DataView(padded.buffer).setUint32(28, donId, false);
    const don = await client.call({ to: CAPABILITY_REGISTRY, data: concatHex(['0x23537405', toHex(padded)]) });
    if (!don.data) throw new Error('CRE_REGISTRY_EMPTY');
    const donBytes = hexToBytes(don.data);
    if (donBytes.length < 224) throw new Error('CRE_REGISTRY_SHORT');
    const f = readSlot(donBytes, 96);
    const countAt = 32 + readSlot(donBytes, 192);
    const count = readSlot(donBytes, countAt);
    const ids: Hex[] = [];
    for (let i = 0; i < count; i++) ids.push(toHex(donBytes.slice(countAt + 32 + i * 32, countAt + 64 + i * 32)));
    const signers = new Set<string>();
    if (count > 0) {
      const head = new Uint8Array(64);
      const v = new DataView(head.buffer);
      v.setUint32(28, 32, false);
      v.setUint32(60, count, false);
      const nodes = await client.call({ to: CAPABILITY_REGISTRY, data: concatHex(['0x05a51966', toHex(head), ...ids]) });
      if (!nodes.data) throw new Error('CRE_REGISTRY_EMPTY');
      const nb = hexToBytes(nodes.data);
      const outer = readSlot(nb, 0);
      const returned = readSlot(nb, outer);
      for (let i = 0; i < returned; i++) {
        const base = outer + 32 + readSlot(nb, outer + 32 + i * 32);
        if (base + 288 > nb.length) break;
        signers.add(toHex(nb.slice(base + 96, base + 116)).toLowerCase());
      }
    }
    const result = { f, signers };
    cache.set(donId, result);
    return result;
  };
}
