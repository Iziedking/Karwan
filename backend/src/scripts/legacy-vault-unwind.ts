/// Return stranded stake to retired vaults so legacy holders can claim.
///
///   npm run legacy:unwind            dry run, signs nothing
///   npm run legacy:unwind -- --send  actually redeems and deposits
///
/// ## The bug this repairs
///
/// `runUsycWrap` rebalances exactly one vault: `KARWAN_VAULT_ADDR`. While a
/// vault is current, that is right. The moment it is superseded, any USDC it had
/// already routed out via `withdrawForYield` is orphaned: the vault still books
/// it in `outForYield`, the operator still holds it as USYC, and nothing will
/// ever call `depositFromYield` on that address again because the orchestrator
/// no longer looks at it.
///
/// The visible symptom is a legacy holder whose positions are `cooling`, past
/// their `claimableAt`, showing CLAIM READY, and whose claims revert. Claims are
/// paid from the vault's liquid USDC and there is none. Some claims succeed
/// (draining the last of the balance) and the rest fail, which reads like a
/// flaky transaction rather than an empty contract.
///
/// This script does what the orchestrator will not: walks EVERY vault that is
/// not the current one, and for each with `outForYield > 0`, redeems enough USYC
/// and calls `depositFromYield` to bring the full amount home.
///
/// ## Why "drain fully" rather than "top up to a buffer"
///
/// A retired vault takes no new deposits. Every position on it is either already
/// claimed or on its way out, so the only correct liquid balance is the whole
/// outstanding amount. Sizing it to `USYC_VAULT_BUFFER_USDC` like the live vault
/// would leave holders unable to claim the remainder.

import { formatUnits, getAddress, createWalletClient, erc20Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet, arcTransport, publicClient } from '../chain/client.js';
import { VAULT_DEPLOYMENTS } from '../chain/deployLedger.js';
import { config } from '../config.js';

const TELLER = getAddress('0x9fdF14c5B14173D74C08Af27AebFf39240dC105A');
const USYC = getAddress('0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C');
const USDC = getAddress('0x3600000000000000000000000000000000000000');

const vaultAbi = [
  { type: 'function', name: 'operator', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'outForYield', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'depositFromYield', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
] as const;
const tellerAbi = [
  { type: 'function', name: 'redeem', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

const send = process.argv.includes('--send');
const fmt = (v: bigint) => formatUnits(v, 6);

const key = config.USYC_OPERATOR_PRIVATE_KEY;
if (!key) {
  console.error('USYC_OPERATOR_PRIVATE_KEY is unset. This script signs as the vault operator.');
  process.exit(1);
}
const account = privateKeyToAccount(key as `0x${string}`);
const wallet = createWalletClient({ account, chain: arcTestnet, transport: arcTransport });

const current = config.KARWAN_VAULT_ADDR ? getAddress(config.KARWAN_VAULT_ADDR) : null;

console.log(send ? 'MODE: SEND (will sign transactions)\n' : 'MODE: dry run (signs nothing)\n');
console.log(`operator ${account.address}`);
const opUsdc = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
const opUsyc = await publicClient.readContract({ address: USYC, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
console.log(`  holds ${fmt(opUsdc)} USDC and ${fmt(opUsyc)} USYC\n`);

/// Every vault except the live one. Read from the generated deploy ledger rather
/// than the three `KARWAN_VAULT_LEGACY_ADDR*` env slots, because those only hold
/// the most recent few generations and a vault older than that would be silently
/// skipped, which is the same class of mistake this script exists to fix.
const retired = VAULT_DEPLOYMENTS.filter((v) => !current || getAddress(v.address) !== current);

let anyOwed = false;
for (const v of retired) {
  const address = getAddress(v.address);
  let owed: bigint;
  try {
    owed = (await publicClient.readContract({ address, abi: vaultAbi, functionName: 'outForYield' })) as bigint;
  } catch {
    continue; // predates the yield routing, so it has no such accounting
  }
  if (owed === 0n) continue;

  anyOwed = true;
  const liquid = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [address] });
  console.log(`${address}  owes ${fmt(owed)} USDC back, holds ${fmt(liquid)} liquid`);

  const operator = (await publicClient.readContract({ address, abi: vaultAbi, functionName: 'operator' })) as string;
  if (getAddress(operator) !== getAddress(account.address)) {
    console.log(`  SKIP: its operator is ${operator}, not this signer\n`);
    continue;
  }

  // Redeem only the shortfall, not everything. USYC held by the operator is one
  // pool shared across vaults, so taking more than this vault is owed would
  // strand the difference somewhere else.
  const shortfall = owed > opUsdc ? owed - opUsdc : 0n;
  if (shortfall > 0n) {
    console.log(`  step 1: redeem USYC to raise ${fmt(shortfall)} USDC`);
    if (send) {
      // Redeem by shares. The Teller prices the conversion, so read the USDC
      // actually received afterwards rather than trusting a pre-computed figure:
      // the USYC oracle has been observed frozen, which makes any local estimate
      // a guess.
      const before = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
      const shares = shortfall > opUsyc ? opUsyc : shortfall;
      let hash = await wallet.writeContract({ address: USYC, abi: erc20Abi, functionName: 'approve', args: [TELLER, shares], account, chain: arcTestnet });
      await publicClient.waitForTransactionReceipt({ hash });
      hash = await wallet.writeContract({ address: TELLER, abi: tellerAbi, functionName: 'redeem', args: [shares, account.address, account.address], account, chain: arcTestnet });
      await publicClient.waitForTransactionReceipt({ hash });
      const after = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
      console.log(`    redeemed ${fmt(shares)} USYC -> ${fmt(after - before)} USDC  ${hash}`);
    }
  }

  const have = send
    ? ((await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] })) as bigint)
    : opUsdc + shortfall;
  // Never deposit more than the vault says it is owed: the excess belongs to
  // another vault's routing, and depositFromYield would refuse it anyway.
  const amount = have > owed ? owed : have;
  console.log(`  step 2: depositFromYield(${fmt(amount)}) into ${address}`);
  if (amount < owed) {
    console.log(`    NOTE partial. ${fmt(owed - amount)} USDC still owed after this run.`);
  }
  if (send) {
    let hash = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: 'approve', args: [address, amount], account, chain: arcTestnet });
    await publicClient.waitForTransactionReceipt({ hash });
    hash = await wallet.writeContract({ address, abi: vaultAbi, functionName: 'depositFromYield', args: [amount], account, chain: arcTestnet });
    await publicClient.waitForTransactionReceipt({ hash });
    const nowLiquid = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [address] });
    console.log(`    done ${hash}\n    vault now holds ${fmt(nowLiquid)} USDC\n`);
  } else {
    console.log();
  }
}

if (!anyOwed) {
  console.log('No retired vault is owed anything. Nothing to unwind.');
} else if (!send) {
  console.log('Dry run only. Re-run with --send to execute.');
}

process.exit(0);
