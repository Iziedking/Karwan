/// Arc logs every USDC movement as a `Transfer` from its system emitter, in 18
/// decimals; a transfer through the ERC-20 contract is logged there too, in 6.
/// The balance watcher reads the ERC-20 log, so from the system log it takes
/// only what the ERC-20 log does not carry: a plain native send. ERC-4337 gas
/// payments and refunds move through the EntryPoint and are never money arriving.

export const SYSTEM_EMITTER = '0xfffffffffffffffffffffffffffffffffffffffe';
const ENTRYPOINTS = new Set(['0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789', '0x0000000071727de22e5e9d8baf0edac6f37da032']);
const NATIVE_PER_MICRO = 10n ** 12n;

export interface RawTransfer {
  from: string;
  to: string;
  /// Micro USDC for ERC-20 logs, wei-style 18 decimals for system logs.
  value: bigint;
  txHash: string;
  logIndex: number;
}

/// The system-log transfers with no ERC-20 twin (same transaction, sender,
/// recipient and amount), in micro USDC.
export function nativeOnlyTransfers(erc20: RawTransfer[], system: RawTransfer[]): RawTransfer[] {
  const key = (tx: string, from: string, to: string, micros: bigint) => `${tx.toLowerCase()}:${from.toLowerCase()}:${to.toLowerCase()}:${micros}`;
  const twins = new Map<string, number>();
  for (const e of erc20) {
    const k = key(e.txHash, e.from, e.to, e.value);
    twins.set(k, (twins.get(k) ?? 0) + 1);
  }
  const out: RawTransfer[] = [];
  for (const s of system) {
    if (ENTRYPOINTS.has(s.from.toLowerCase())) continue;
    const micros = s.value / NATIVE_PER_MICRO;
    if (micros === 0n) continue;
    const k = key(s.txHash, s.from, s.to, micros);
    const left = twins.get(k) ?? 0;
    if (left > 0) {
      twins.set(k, left - 1);
      continue;
    }
    out.push({ ...s, value: micros });
  }
  return out;
}
