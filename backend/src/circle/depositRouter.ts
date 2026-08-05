import { logger } from '../logger.js';
import { config } from '../config.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { createBridge, getBridge } from '../db/bridges.js';
import {
  CCTP_CHAINS,
  CCTP_CHAIN_KEYS,
  chainKeyForCircleBlockchain,
  type CctpChainKey,
} from '../chain/cctpChains.js';
import { randomUUID } from 'node:crypto';

/// Move a deposit to Arc without asking.
///
/// The deposit watcher notices money landing on a source chain and says so. That
/// was the whole of it, and it left a gap the UI papered over: the card read
/// "landed" while the USDC sat on Base, not on Arc, so it could not fund an
/// escrow. Detection is not delivery.
///
/// This closes it. On a deposit credit, a CCTP transfer opens from that source
/// chain to the user's Arc identity wallet, over the same pipeline the manual
/// bridge uses. The user is told twice, once when it arrives and once when it is
/// spendable, and is never asked to choose a rail or a chain.
///
/// ## Why the identity wallet and not an agent
///
/// Escrow draws from an agent wallet, so sending straight there would make
/// funding a deal one hop instead of two. It would also put a user's deposit
/// into a wallet they did not pick, on our judgement of what they meant to do
/// with it. The identity wallet is the honest destination: it is their money
/// until they commit it to something.

/// Below this, the source-chain gas to burn can cost more than the transfer
/// moves. Those deposits stay put and accumulate rather than being spent on
/// their own delivery.
const MIN_AUTO_BRIDGE_USDC = Number(config.DEPOSIT_AUTO_BRIDGE_MIN_USDC ?? 1);

/// One deposit, one bridge. Derived from Circle's transaction id rather than
/// random, so a redelivered webhook resolves to the same row and `getBridge`
/// refuses the second attempt. A random id here would bridge the same deposit
/// twice and burn money that is not there the second time.
const SOLANA_CHAIN_KEY = 'solanaDevnet' as const;
const SOLANA_CIRCLE_CHAIN = 'SOL-DEVNET';
/// Solana is CCTP domain 5. Arc is 26.
const SOLANA_CCTP_DOMAIN = 5;

export function bridgeIdForDeposit(txId: string): string {
  return `deposit-${txId}`;
}

export interface DepositRoute {
  /// The Arc identity address, which is also the mint recipient.
  owner: string;
  /// Decimal USDC, as Circle reported it.
  amountUsdc: string;
  /// Circle blockchain code the deposit landed on.
  chain: string;
  /// Circle's transaction id. The idempotency key for the whole route, so it
  /// stays server-side.
  txId: string;
}

/// Fire and forget. Never throws at the caller: a deposit that cannot be routed
/// is still a deposit the user has, sitting where they sent it, and the credit
/// notification has already gone out.
export function routeDepositToArc(input: DepositRoute): void {
  void route(input).catch((err) =>
    logger.warn(
      { owner: input.owner, err: (err as Error).message },
      'could not auto-bridge a deposit to Arc; it stays on the source chain',
    ),
  );
}

function isCctpChainKey(key: string): key is CctpChainKey {
  return (CCTP_CHAIN_KEYS as readonly string[]).includes(key);
}

async function route(p: DepositRoute): Promise<void> {
  const owner = p.owner.toLowerCase();

  const amount = Number(p.amountUsdc);
  if (!Number.isFinite(amount) || amount <= 0) return;
  if (amount < MIN_AUTO_BRIDGE_USDC) {
    logger.info(
      { owner, amount, min: MIN_AUTO_BRIDGE_USDC },
      'deposit below the auto-bridge floor; leaving it on the source chain',
    );
    return;
  }

  const chainKey = chainKeyForCircleBlockchain(p.chain);
  if (!chainKey) {
    logger.info({ owner, chain: p.chain }, 'deposit chain does not map to a route');
    return;
  }

  // Solana takes a different route, not no route. Its burn is an SPL program
  // call, not an ERC-20 approve plus a CCTP contract call, so the EVM pipeline
  // cannot carry it. App Kit can, and the Circle DCW on Solana signs it.
  if (chainKey === SOLANA_CHAIN_KEY) {
    await routeSolana(owner, p);
    return;
  }

  if (!isCctpChainKey(chainKey)) {
    logger.info(
      { owner, chain: p.chain },
      'deposit chain has no pipeline the backend can sign; not auto-bridging',
    );
    return;
  }

  const chainCfg = CCTP_CHAINS[chainKey];
  if (!chainCfg.circleBlockchain) return; // web3-only chain, backend cannot sign

  const wallets = await getAgentWallets(owner);
  const bridgeWallet = wallets?.bridgeWallets?.[chainCfg.circleBlockchain];
  if (!bridgeWallet) {
    logger.warn(
      { owner, chainKey },
      'deposit credited but no source wallet on record; cannot auto-bridge',
    );
    return;
  }

  const bridgeId = bridgeIdForDeposit(p.txId);
  if (await getBridge(bridgeId)) return; // already routed, or being routed

  await createBridge({
    bridgeId,
    sourceDomain: chainCfg.domain,
    sourceTxHash: '',
    amountUsdc: p.amountUsdc,
    // Their own Arc address. Deposits are derived from the identity anchor, so
    // for an EVM chain this is the same string the money was sent to, one chain
    // over.
    mintRecipient: owner,
    status: 'approving',
    sourceChainKey: chainKey,
    bridgeWalletId: bridgeWallet.walletId,
    bridgeWalletAddress: bridgeWallet.address,
    // Generated before any submit, so a crash between Circle accepting a tx and
    // us persisting its id re-uses the key and Circle dedupes server-side.
    approveIdempotencyKey: randomUUID(),
    burnIdempotencyKey: randomUUID(),
  });

  logger.info(
    { owner, chainKey, amount: p.amountUsdc, bridgeId },
    'auto-bridging a deposit to the Arc identity wallet',
  );

  // Imported here rather than at module load. The bridge route module pulls in
  // the Circle bridge SDKs, and eagerly loading that from a watcher put the whole
  // chain into every import graph that touches deposits, including the tests.
  // Deferring it also means a process that never routes a deposit never pays for
  // it.
  const { startSourcePipeline } = await import('../routes/bridge.js');

  // Failures land on the bridge row as an error state rather than throwing here.
  // The money stays on the source chain, which is recoverable and visible, and
  // the common cause is the source wallet being out of native gas.
  startSourcePipeline({
    bridgeId,
    sourceChainKey: chainKey,
    bridgeWalletId: bridgeWallet.walletId,
    bridgeWalletAddress: bridgeWallet.address,
    amountUsdc: p.amountUsdc,
    mintRecipient: owner,
  });
}

/// Solana's leg, over App Kit.
///
/// Worth naming why this is separate rather than a branch inside the EVM path: a
/// Solana burn is a program call against the CCTP TokenMessengerMinter with its
/// own account list and PDA derivation, and there is no approve step at all.
/// Sharing the pipeline would mean a function that is two functions.
///
/// A note for whoever debugs this next. There is a known bug in
/// `adapter-solana-kit` where a burn never gets its fee-payer signature, which is
/// why the WEB3 Solana path hand-builds the instruction and signs it in Phantom.
/// That bug is in the browser provider signer: it wraps `window.solana` as
/// send-only, and partial-sign skips it. This path has no browser and no
/// provider. The Circle DCW signs through `adapter-circle-wallets`, so it does
/// not touch the failing code. If a Solana deposit does error with Solana
/// #5663012, that assumption is wrong and the fix is to port the frontend's
/// instruction builder here and sign it with the DCW `signTransaction` API,
/// which does accept a raw Solana transaction.
async function routeSolana(owner: string, p: DepositRoute): Promise<void> {
  const wallets = await getAgentWallets(owner);
  const bridgeWallet = wallets?.bridgeWallets?.[SOLANA_CIRCLE_CHAIN];
  if (!bridgeWallet) {
    logger.warn({ owner }, 'Solana deposit credited but no Solana wallet on record');
    return;
  }

  const bridgeId = bridgeIdForDeposit(p.txId);
  if (await getBridge(bridgeId)) return;

  await createBridge({
    bridgeId,
    // Solana's CCTP domain. Not in CCTP_CHAINS, which is the EVM table.
    sourceDomain: SOLANA_CCTP_DOMAIN,
    sourceTxHash: '',
    amountUsdc: p.amountUsdc,
    mintRecipient: owner,
    status: 'approving',
    sourceChainKey: SOLANA_CHAIN_KEY,
    bridgeWalletId: bridgeWallet.walletId,
    bridgeWalletAddress: bridgeWallet.address,
    // Marks the row as App-Kit-driven so the resume path does not try to feed it
    // back into the EVM source pipeline on restart.
    appKit: true,
  });

  logger.info(
    { owner, amount: p.amountUsdc, bridgeId },
    'auto-bridging a Solana deposit to the Arc identity wallet',
  );

  const { bridgeInToArcViaAppKit } = await import('./bridge-kit.js');
  void bridgeInToArcViaAppKit({
    bridgeId,
    sourceChainKey: SOLANA_CHAIN_KEY,
    bridgeWalletAddress: bridgeWallet.address,
    amountUsdc: p.amountUsdc,
    mintRecipient: owner,
  });
}
