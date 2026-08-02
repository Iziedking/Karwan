/// Add an owner to the arbiter Safe.
///
///   npm run safe:add-owner -- 0xNEW            dry run, signs nothing
///   npm run safe:add-owner -- 0xNEW --send     execute
///
/// ## Why this needs its own script
///
/// The Safe is 2-of-3 and only ONE owner is an EOA. The other two are Circle
/// smart accounts, which cannot produce an ECDSA signature, so the browser
/// signing path could never reach the threshold. That left the Safe unable to
/// execute anything at all, including changing its own owners: the fix for the
/// problem required the thing the problem prevented.
///
/// `approveHash` is the way out. A contract owner records approval by sending a
/// transaction, which Circle wallets can do. This script combines the EOA's
/// real signature with the Circle owner's on-chain approval and executes.
///
/// Adding an EOA is what makes this a one-off: once two owners can sign, the
/// ordinary browser flow reaches the threshold on its own.
///
/// ## Note on the pending ruling
///
/// This consumes a Safe nonce. Any ruling already prepared and signed against
/// the current nonce becomes invalid and must be re-prepared and re-signed.

import { encodeFunctionData, getAddress, createWalletClient, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet, arcTransport, publicClient } from '../chain/client.js';
import {
  SAFE_ABI,
  buildSafeTx,
  encodeSafeSignatures,
  hasApproved,
  isOwner,
  readSafe,
  safeTxHash,
  type SafeApproval,
} from '../chain/safeSigning.js';
import { executeContractCall } from '../chain/txs.js';
import { config } from '../config.js';

const send = process.argv.includes('--send');
const newOwnerArg = process.argv.slice(2).find((a) => a.startsWith('0x'));

if (!newOwnerArg) {
  console.error('usage: npm run safe:add-owner -- 0xNEWOWNER [--send]');
  process.exit(1);
}
const newOwner = getAddress(newOwnerArg);

const safeAddr = config.KARWAN_ARBITER_SAFE;
if (!safeAddr) {
  console.error('KARWAN_ARBITER_SAFE is unset.');
  process.exit(1);
}
const SAFE = getAddress(safeAddr) as Address;

const key = config.USYC_OPERATOR_PRIVATE_KEY;
if (!key) {
  console.error('USYC_OPERATOR_PRIVATE_KEY is unset. It holds the EOA owner that signs.');
  process.exit(1);
}
const signer = privateKeyToAccount(key as `0x${string}`);

const reviewerWalletId = config.BUSINESS_REVIEWER_WALLET_ID;
// Not in the zod schema (only the wallet id is), so read it from the raw env.
const reviewerAddr = process.env.BUSINESS_REVIEWER_ADDR;

console.log(send ? 'MODE: SEND\n' : 'MODE: dry run (nothing is signed or sent)\n');

const { owners, threshold, nonce } = await readSafe(SAFE);
console.log(`Safe ${SAFE}`);
console.log(`  threshold ${threshold} of ${owners.length}, nonce ${nonce}`);
for (const o of owners) {
  const code = await publicClient.getBytecode({ address: o });
  console.log(`    ${o}  ${code && code !== '0x' ? 'contract (cannot sign)' : 'EOA'}`);
}

if (isOwner(owners, newOwner)) {
  console.log(`\n${newOwner} is already an owner. Nothing to do.`);
  process.exit(0);
}
if (!isOwner(owners, signer.address)) {
  console.error(`\nsigner ${signer.address} is not an owner of this Safe.`);
  process.exit(1);
}
if (!reviewerWalletId || !reviewerAddr || !isOwner(owners, reviewerAddr)) {
  console.error('\nBUSINESS_REVIEWER_WALLET_ID / _ADDR must be set and the address must be an owner.');
  console.error('It is the Circle owner that approves on chain to reach the threshold.');
  process.exit(1);
}
const reviewer = getAddress(reviewerAddr) as Address;

// Threshold stays where it is. Widening the owner set without touching the
// threshold is the conservative half of the change: it adds a signer, it does
// not make the Safe easier to move.
const data = encodeFunctionData({
  abi: SAFE_ABI,
  functionName: 'addOwnerWithThreshold',
  args: [newOwner, threshold],
});
const tx = buildSafeTx(SAFE, data, nonce);
const digest = await safeTxHash(SAFE, tx);

console.log(`\nadd owner ${newOwner}, threshold stays ${threshold}`);
console.log(`  safe tx hash ${digest}`);
console.log(`  signer   ${signer.address}  (ECDSA)`);
console.log(`  approver ${reviewer}  (approveHash on chain)`);

if (!send) {
  console.log('\nDry run. Re-run with --send to execute.');
  process.exit(0);
}

// 1. The Circle owner approves on chain, unless it already has. Doing this
//    first means the signature blob is assembled against an approval that is
//    already recorded, rather than one that might still fail.
if (await hasApproved(SAFE, reviewer, digest)) {
  console.log('\nreviewer has already approved this hash');
} else {
  console.log('\napproving as the reviewer (Circle wallet)...');
  const approveData = encodeFunctionData({
    abi: SAFE_ABI,
    functionName: 'approveHash',
    args: [digest],
  });
  const res = await executeContractCall(
    {
      walletId: reviewerWalletId,
      contractAddress: SAFE,
      abiFunctionSignature: 'approveHash(bytes32)',
      abiParameters: [digest],
    },
    `safe.approveHash(${digest.slice(0, 12)}…)`,
  );
  console.log(`  tx ${res.txHash}`);
  void approveData;
  if (!(await hasApproved(SAFE, reviewer, digest))) {
    console.error('  approval did not register on chain. Stopping before execution.');
    process.exit(1);
  }
  console.log('  approval recorded');
}

// 2. The EOA signs the same digest. `sign` over the raw hash, NOT signMessage:
//    getTransactionHash already returns the EIP-712 digest, and signMessage
//    would prefix it again so the Safe would recover a different address.
const signature = await signer.sign({ hash: digest });

const approvals: SafeApproval[] = [
  { kind: 'ecdsa', owner: signer.address as Address, signature: signature as Hex },
  { kind: 'approved', owner: reviewer },
];
const signatures = encodeSafeSignatures(approvals);

// 3. Execute. Simulated first so a bad blob surfaces as a clear revert here
//    rather than as a burnt nonce.
const wallet = createWalletClient({ account: signer, chain: arcTestnet, transport: arcTransport });
const args = [
  tx.to, tx.value, tx.data, tx.operation, tx.safeTxGas, tx.baseGas,
  tx.gasPrice, tx.gasToken, tx.refundReceiver, signatures,
] as const;

console.log('\nsimulating execTransaction...');
await publicClient.simulateContract({
  address: SAFE,
  abi: SAFE_ABI,
  functionName: 'execTransaction',
  args,
  account: signer,
});
console.log('  simulation ok');

const hash = await wallet.writeContract({
  address: SAFE,
  abi: SAFE_ABI,
  functionName: 'execTransaction',
  args,
  account: signer,
  chain: arcTestnet,
});
console.log(`  tx ${hash}`);
await publicClient.waitForTransactionReceipt({ hash });

const after = await readSafe(SAFE);
console.log(`\nowners now ${after.owners.length}, threshold ${after.threshold}, nonce ${after.nonce}`);
for (const o of after.owners) console.log(`    ${o}`);
process.exit(0);
