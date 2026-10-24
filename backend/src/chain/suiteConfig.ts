import type { Hex } from 'viem';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { publicClient } from './client.js';

/// The escrow family on the active network (view 27). New deals open on it
/// only when it is switched on, every address is set and the chain agrees.
export interface SuiteAddresses {
  hub: Hex;
  identity: Hex;
  record: Hex;
  agreement: Hex;
  verifier: Hex;
  tradeFinance: Hex;
}

export interface SuiteReads {
  code: (addr: Hex) => Promise<Hex | undefined>;
  hubIdentity: () => Promise<Hex>;
  hubRecord: () => Promise<Hex>;
  isFamily: (addr: Hex) => Promise<boolean>;
  isVerifier: (addr: Hex) => Promise<boolean>;
}

export class SuiteConfigError extends Error {
  constructor(readonly check: string, detail: string) {
    super(`suite boot check ${check}: ${detail}`);
  }
}

type SuiteEnv = {
  SUITE_ENABLED?: boolean;
  KARWAN_SUITE_HUB_ADDR?: string;
  KARWAN_SUITE_IDENTITY_ADDR?: string;
  KARWAN_SUITE_RECORD_ADDR?: string;
  KARWAN_SUITE_AGREEMENT_ADDR?: string;
  KARWAN_SUITE_VERIFIER_ADDR?: string;
  KARWAN_SUITE_TRADE_FINANCE_ADDR?: string;
};

export function suiteAddresses(cfg: SuiteEnv = config): SuiteAddresses | null {
  if (!cfg.SUITE_ENABLED) return null;
  const addrs = {
    hub: cfg.KARWAN_SUITE_HUB_ADDR,
    identity: cfg.KARWAN_SUITE_IDENTITY_ADDR,
    record: cfg.KARWAN_SUITE_RECORD_ADDR,
    agreement: cfg.KARWAN_SUITE_AGREEMENT_ADDR,
    verifier: cfg.KARWAN_SUITE_VERIFIER_ADDR,
    tradeFinance: cfg.KARWAN_SUITE_TRADE_FINANCE_ADDR,
  };
  return Object.values(addrs).every((a) => !!a) ? (addrs as SuiteAddresses) : null;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function checkSuiteOnChain(addrs: SuiteAddresses, read: SuiteReads): Promise<void> {
  for (const [name, addr] of Object.entries(addrs) as [keyof SuiteAddresses, Hex][]) {
    const code = await read.code(addr);
    if (!code || code === '0x') throw new SuiteConfigError(`code:${name}`, `no contract at ${addr}`);
  }
  if (!same(await read.hubIdentity(), addrs.identity)) throw new SuiteConfigError('hub-identity', 'the hub names another identity registry');
  if (!same(await read.hubRecord(), addrs.record)) throw new SuiteConfigError('hub-record', 'the hub names another record');
  if (!(await read.isFamily(addrs.agreement))) throw new SuiteConfigError('agreement-family', 'the hub does not list the Agreement escrow as a family');
  if (!(await read.isVerifier(addrs.verifier))) throw new SuiteConfigError('verifier-listed', 'the hub does not list the check verifier');
}

const HUB_ABI = [
  { type: 'function', name: 'identity', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'record', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'isFamily', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'isVerifier', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
] as const;

function liveReads(hub: Hex): SuiteReads {
  return {
    code: (addr) => publicClient.getCode({ address: addr }),
    hubIdentity: () => publicClient.readContract({ address: hub, abi: HUB_ABI, functionName: 'identity' }),
    hubRecord: () => publicClient.readContract({ address: hub, abi: HUB_ABI, functionName: 'record' }),
    isFamily: (addr) => publicClient.readContract({ address: hub, abi: HUB_ABI, functionName: 'isFamily', args: [addr] }),
    isVerifier: (addr) => publicClient.readContract({ address: hub, abi: HUB_ABI, functionName: 'isVerifier', args: [addr] }),
  };
}

let suiteChecked = false;

/// Whether new deals can open on the family: the chain agrees with the
/// addresses, and Karwan's checker, arbiter and issuer keys loaded, since checks
/// and disputes on its deals need them.
export async function suiteReady(addrs: SuiteAddresses, reads: SuiteReads, signersProblem: string | null): Promise<{ ready: boolean; reason: string | null }> {
  try {
    await checkSuiteOnChain(addrs, reads);
  } catch (err) {
    return { ready: false, reason: err instanceof SuiteConfigError ? err.check : (err as Error).message };
  }
  return signersProblem ? { ready: false, reason: signersProblem } : { ready: true, reason: null };
}

/// Runs once at startup. A failed check leaves new deals on the current escrow;
/// deals already on the family keep finishing there.
export async function bootSuiteCheck(reads?: SuiteReads, signersProblem: string | null = null): Promise<boolean> {
  const addrs = suiteAddresses();
  if (!addrs) return false;
  const { ready, reason } = await suiteReady(addrs, reads ?? liveReads(addrs.hub), signersProblem);
  suiteChecked = ready;
  if (ready) logger.info({ agreement: addrs.agreement }, 'suite boot check passed; new deals open on the escrow family');
  else logger.error({ reason }, 'suite boot check failed; new deals stay on the current escrow');
  return suiteChecked;
}

export function suiteFundingEnabled(): boolean {
  return suiteChecked && suiteAddresses() !== null;
}
