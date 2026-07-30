import { formatUnits, getAddress } from 'viem';
import { publicClient } from './client.js';

/// How much USDC a vault must actually have on hand, and whether it does.
///
/// A stake claim is paid from the vault's liquid USDC and nothing else.
/// `claim(positionId)` transfers and returns; it has no knowledge of USYC and
/// cannot call the Teller. The vault is NotPermissioned for USYC anyway, so
/// only the operator EOA can redeem, off chain, as a separate act.
///
/// That makes the vault's liquid balance a promise the platform has to keep
/// manually. The old approach kept a FLAT `USYC_VAULT_BUFFER_USDC` liquid and
/// wrapped everything above it, which is only safe while claims stay smaller
/// than the constant. The moment more cooling positions mature than the buffer
/// covers, claims revert. Users see a CLAIM button that fails, which is the
/// worst possible way to learn about a liquidity policy.
///
/// The cooldown is what makes this solvable: a withdrawal announces itself
/// days before the money is needed. This module turns that announcement into a
/// number, so the wrap can leave enough behind and an operator can top up
/// before anyone is refused.

const POSITION_STATE_COOLING = 2;

const vaultAbi = [
  {
    type: 'function',
    name: 'positions',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [
      { type: 'address' },
      { type: 'uint256' },
      { type: 'uint64' },
      { type: 'uint64' },
      { type: 'uint64' },
      { type: 'uint8' },
    ],
  },
  { type: 'function', name: 'nextPositionId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

export interface PendingClaim {
  positionId: string;
  owner: string;
  principalUsdc: string;
  claimableAt: number;
  /// True once the cooldown has elapsed. These can be claimed RIGHT NOW, so a
  /// shortfall against them is already user-visible.
  due: boolean;
}

export interface VaultLiquidity {
  vault: string;
  /// USDC the vault can pay out today.
  liquidUsdc: string;
  /// Everything in cooldown, due or not. What the vault owes before the last
  /// position matures.
  liabilityUsdc: string;
  /// The subset already past its cooldown.
  dueNowUsdc: string;
  /// liability - liquid, floored at zero. What an operator has to return.
  shortfallUsdc: string;
  /// Shortfall against positions that are ALREADY claimable. Non-zero means
  /// somebody's claim is failing at this moment.
  urgentShortfallUsdc: string;
  pending: PendingClaim[];
  /// The soonest cooldown still running, so an operator knows how long they
  /// have. Null when nothing is cooling or everything is already due.
  nextDueAt: number | null;
}

const USDC_ADDR = '0x3600000000000000000000000000000000000000' as const;

/// Read every cooling position on a vault and total what it owes.
///
/// Walks position ids rather than an owner index because the liability is
/// platform-wide, not per user: the vault pays whoever claims first, so one
/// staker's claim can be starved by another's. Position counts here are in the
/// tens, so a full walk is cheap and exact. If a vault ever holds thousands,
/// this wants an indexed read instead.
export async function readVaultLiquidity(
  vaultAddress: string,
  opts: { usdc?: string } = {},
): Promise<VaultLiquidity> {
  const vault = getAddress(vaultAddress);
  const usdc = getAddress(opts.usdc ?? USDC_ADDR);

  const [liquid, nextId] = await Promise.all([
    publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [vault] }) as Promise<bigint>,
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'nextPositionId' }) as Promise<bigint>,
  ]);

  const ids: bigint[] = [];
  for (let i = 1n; i < nextId; i += 1n) ids.push(i);

  const results = await Promise.allSettled(
    ids.map((id) =>
      publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'positions', args: [id] }),
    ),
  );

  const now = Math.floor(Date.now() / 1000);
  const pending: PendingClaim[] = [];
  let liability = 0n;
  let dueNow = 0n;

  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const [owner, principal, , , claimableAt, state] = r.value as readonly [
      string, bigint, bigint, bigint, bigint, number,
    ];
    if (Number(state) !== POSITION_STATE_COOLING) return;
    if (principal === 0n) return;

    const due = Number(claimableAt) <= now;
    liability += principal;
    if (due) dueNow += principal;
    pending.push({
      positionId: ids[i]!.toString(),
      owner,
      principalUsdc: formatUnits(principal, 6),
      claimableAt: Number(claimableAt),
      due,
    });
  });

  const shortfall = liability > liquid ? liability - liquid : 0n;
  const urgent = dueNow > liquid ? dueNow - liquid : 0n;
  const upcoming = pending.filter((p) => !p.due).map((p) => p.claimableAt);

  return {
    vault,
    liquidUsdc: formatUnits(liquid, 6),
    liabilityUsdc: formatUnits(liability, 6),
    dueNowUsdc: formatUnits(dueNow, 6),
    shortfallUsdc: formatUnits(shortfall, 6),
    urgentShortfallUsdc: formatUnits(urgent, 6),
    pending: pending.sort((a, b) => a.claimableAt - b.claimableAt),
    nextDueAt: upcoming.length ? Math.min(...upcoming) : null,
  };
}

/// Base units, for callers doing arithmetic rather than display.
export function toBaseUnits(decimalUsdc: string): bigint {
  const [whole, frac = ''] = decimalUsdc.split('.');
  return BigInt(whole ?? '0') * 1_000_000n + BigInt((frac + '000000').slice(0, 6));
}
