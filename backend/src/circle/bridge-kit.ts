import { AppKit, BridgeChain } from '@circle-fin/app-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { bus } from '../events.js';
import { patchBridge } from '../db/bridges.js';
/// Source-chain keys supported by the App Kit bridge path.
///
/// Listed explicitly rather than derived from CctpChainKey. This path signs with
/// a Circle DCW, so it only reaches chains Circle can hold a wallet on. CCTP now
/// also covers Avalanche, Unichain, Sei, Sonic, World Chain and HyperEVM, but
/// those are web3-only (the user's own wallet signs the burn), so widening this
/// union to CctpChainKey would promise a Circle path that cannot exist. See
/// CctpChain.circleBlockchain.
export type AppKitSourceChainKey =
  | 'sepolia'
  | 'optimismSepolia'
  | 'arbitrumSepolia'
  | 'baseSepolia'
  | 'polygonAmoy'
  | 'solanaDevnet';

interface AppKitSourceChain {
  /// App Kit's chain identifier, fed to kit.bridge({ from: { chain } }).
  blockchain: BridgeChain;
  /// Circle DCW createWallets blockchain code (hyphen-uppercase) used to
  /// provision the per-user source-chain wallet. EVM testnets are SCAs;
  /// Solana is EOA (DCW SCAs are EVM-only per Circle's account-types doc).
  circleBlockchain: string;
  /// Display name. Surfaced in logs and back to the UI when available.
  name: string;
  /// Whether this chain is non-EVM. Drives accountType selection at DCW
  /// provisioning time and gates EVM-only features.
  isSolana: boolean;
}

export const APP_KIT_SOURCE_CHAINS: Record<AppKitSourceChainKey, AppKitSourceChain> = {
  sepolia: {
    blockchain: BridgeChain.Ethereum_Sepolia,
    circleBlockchain: 'ETH-SEPOLIA',
    name: 'Ethereum Sepolia',
    isSolana: false,
  },
  optimismSepolia: {
    blockchain: BridgeChain.Optimism_Sepolia,
    circleBlockchain: 'OP-SEPOLIA',
    name: 'OP Sepolia',
    isSolana: false,
  },
  arbitrumSepolia: {
    blockchain: BridgeChain.Arbitrum_Sepolia,
    circleBlockchain: 'ARB-SEPOLIA',
    name: 'Arbitrum Sepolia',
    isSolana: false,
  },
  baseSepolia: {
    blockchain: BridgeChain.Base_Sepolia,
    circleBlockchain: 'BASE-SEPOLIA',
    name: 'Base Sepolia',
    isSolana: false,
  },
  polygonAmoy: {
    blockchain: BridgeChain.Polygon_Amoy_Testnet,
    circleBlockchain: 'MATIC-AMOY',
    name: 'Polygon Amoy',
    isSolana: false,
  },
  solanaDevnet: {
    blockchain: BridgeChain.Solana_Devnet,
    circleBlockchain: 'SOL-DEVNET',
    name: 'Solana Devnet',
    isSolana: true,
  },
};

export function isAppKitSourceChainKey(v: string): v is AppKitSourceChainKey {
  return v in APP_KIT_SOURCE_CHAINS;
}

/// Tuple of supported source-chain keys for zod schema enums on the bridge
/// route. Hand-typed so TypeScript catches a stale key the moment the keys
/// drift from APP_KIT_SOURCE_CHAINS. The `satisfies` clause enforces exhaustive
/// coverage.
export const APP_KIT_SOURCE_CHAIN_KEYS = [
  'sepolia',
  'optimismSepolia',
  'arbitrumSepolia',
  'baseSepolia',
  'polygonAmoy',
  'solanaDevnet',
] as const satisfies readonly AppKitSourceChainKey[];

/// The Circle Wallets adapter is a single object that signs across both EVM
/// and Solana. It dispatches internally based on the `chain` in each call's
/// `from` / `to`. We memoize one adapter for the process lifetime; it reads
/// API credentials lazily so an unset CIRCLE_API_KEY only errors when something
/// actually tries to bridge, never at module load.
let _adapter: ReturnType<typeof createCircleWalletsAdapter> | null = null;

function getAdapter() {
  if (_adapter) return _adapter;
  if (!config.CIRCLE_API_KEY || !config.CIRCLE_ENTITY_SECRET) {
    throw new Error(
      'App Kit bridge: CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are required',
    );
  }
  _adapter = createCircleWalletsAdapter({
    apiKey: config.CIRCLE_API_KEY,
    entitySecret: config.CIRCLE_ENTITY_SECRET,
  });
  return _adapter;
}

export interface AppKitBridgeInput {
  bridgeId: string;
  sourceChainKey: AppKitSourceChainKey;
  /// Address of the source-chain Circle DCW that holds the USDC being bridged.
  /// On EVM this is the SCA address; on Solana it is the Solana address that
  /// owns the USDC ATA. Caller provisions this wallet before calling.
  bridgeWalletAddress: string;
  amountUsdc: string;
  /// Arc destination address that receives the minted USDC.
  mintRecipient: string;
}

/// Run an in-direction bridge (source chain -> Arc Testnet) through App Kit
/// with the Forwarding Service. This replaces the hand-rolled approve / burn
/// / IRIS-poll / receiveMessage pipeline (~600 lines) with a single
/// `kit.bridge()` call that handles all four steps internally. Circle's
/// forwarder broadcasts the destination mint, so no relay DCW is needed.
///
/// Fire-and-forget: the caller does NOT await the returned promise. The HTTP
/// handler returns immediately and this function patches the BridgeRelay record
/// at each step so the existing UI sees the same status progression as the
/// hand-rolled path ('approving' -> 'burning' -> 'relaying' -> 'minted').
///
/// On a process restart while a bridge is mid-flight (after burn-on-source
/// but before forwarder-mint-on-dest), the bridge record will stay in
/// 'burning' or 'relaying' state until manual cleanup. The forwarder may
/// still complete the mint on chain; an operator can mark the record 'minted'
/// once verified. A future iteration can persist the BridgeResult and call
/// kit.retry() on boot for full resumability.
export async function bridgeInToArcViaAppKit(input: AppKitBridgeInput): Promise<void> {
  const chain = APP_KIT_SOURCE_CHAINS[input.sourceChainKey];
  if (!chain) {
    const message = `App Kit bridge: unknown source chain ${input.sourceChainKey}`;
    logger.error({ bridgeId: input.bridgeId }, message);
    await patchBridge(input.bridgeId, { status: 'error', error: message });
    return;
  }

  let adapter: ReturnType<typeof createCircleWalletsAdapter>;
  try {
    adapter = getAdapter();
  } catch (err) {
    const message = (err as Error).message;
    await patchBridge(input.bridgeId, { status: 'error', error: message });
    return;
  }

  // Per-call kit so concurrent bridges don't share event listeners. The SDK
  // does not include a bridge identifier in event payloads, so listener-per-
  // instance is the cleanest disambiguation.
  const kit = new AppKit();

  // Patch the bridge record and emit bus events as the SDK reports progress.
  // The cast through `as any` here is because BridgeStep payload typing in the
  // SDK is generic by step; we read the well-defined fields (state, txHash)
  // and ignore the rest. The structured kit.bridge return value at the end is
  // the authoritative final state.
  // Read the bridge identifier through a closure: each per-call kit only ever
  // fires events for the single bridge it was created for.
  kit.on('bridge.approve', (payload) => {
    const values = (payload as { values?: { state?: string; txHash?: string } }).values;
    logger.info(
      { bridgeId: input.bridgeId, state: values?.state, txHash: values?.txHash },
      'appkit bridge.approve',
    );
    if (values?.state === 'success') {
      bus.emitEvent({
        type: 'bridge.approving',
        actor: 'buyer',
        payload: {
          bridgeId: input.bridgeId,
          sourceChainKey: input.sourceChainKey,
          circle: true,
          appKit: true,
        },
      });
    }
  });

  kit.on('bridge.burn', (payload) => {
    const values = (payload as { values?: { state?: string; txHash?: string } }).values;
    logger.info(
      { bridgeId: input.bridgeId, state: values?.state, txHash: values?.txHash },
      'appkit bridge.burn',
    );
    if (values?.state === 'success' && values?.txHash) {
      void patchBridge(input.bridgeId, {
        status: 'burning',
        sourceTxHash: values.txHash,
      });
      bus.emitEvent({
        type: 'bridge.burned',
        actor: 'buyer',
        payload: {
          bridgeId: input.bridgeId,
          sourceTxHash: values.txHash,
          amountUsdc: input.amountUsdc,
          mintRecipient: input.mintRecipient,
          circle: true,
          appKit: true,
        },
      });
    }
  });

  kit.on('bridge.fetchAttestation', (payload) => {
    const values = (payload as { values?: { state?: string } }).values;
    logger.info(
      { bridgeId: input.bridgeId, state: values?.state },
      'appkit bridge.fetchAttestation',
    );
    if (values?.state === 'success') {
      void patchBridge(input.bridgeId, { status: 'relaying' });
      bus.emitEvent({
        type: 'bridge.attested',
        actor: 'buyer',
        payload: { bridgeId: input.bridgeId },
      });
    }
  });

  kit.on('bridge.mint', (payload) => {
    const values = (payload as { values?: { state?: string; txHash?: string } }).values;
    logger.info(
      { bridgeId: input.bridgeId, state: values?.state, txHash: values?.txHash },
      'appkit bridge.mint',
    );
    if (values?.state === 'success' && values?.txHash) {
      void patchBridge(input.bridgeId, {
        status: 'minted',
        mintTxHash: values.txHash,
      });
      bus.emitEvent({
        type: 'bridge.minted',
        actor: 'buyer',
        payload: {
          bridgeId: input.bridgeId,
          amountUsdc: input.amountUsdc,
          mintRecipient: input.mintRecipient,
          txHash: values.txHash,
        },
      });
    }
  });

  try {
    const result = await kit.bridge({
      from: {
        adapter,
        chain: chain.blockchain,
        address: input.bridgeWalletAddress,
      },
      to: {
        recipientAddress: input.mintRecipient,
        chain: BridgeChain.Arc_Testnet,
        // Circle's forwarder fetches the attestation and broadcasts the mint
        // on Arc, so we don't need a destination DCW. The flat $0.20 USDC
        // forwarding fee is deducted via the maxFee Circle computes.
        useForwarder: true,
      },
      amount: input.amountUsdc,
    });

    if (result.state === 'error') {
      const failedStep = result.steps?.find?.((s) => s.state === 'error');
      // BridgeStep.error is typed `unknown`; coerce safely. Most failures
      // are either plain strings or Error instances; richer shapes fall back
      // to JSON.stringify so the bridge record carries something readable.
      const stepError = failedStep?.error;
      const message =
        typeof stepError === 'string'
          ? stepError
          : stepError instanceof Error
            ? stepError.message
            : stepError != null
              ? JSON.stringify(stepError)
              : 'bridge failed without a step-level error';
      logger.error(
        { bridgeId: input.bridgeId, failedStep: failedStep?.name, message },
        'appkit bridge errored',
      );
      await patchBridge(input.bridgeId, { status: 'error', error: message });
      bus.emitEvent({
        type: 'bridge.error',
        actor: 'buyer',
        payload: {
          bridgeId: input.bridgeId,
          scope: failedStep?.name ?? 'kit.bridge',
          message,
        },
      });
    } else {
      logger.info(
        { bridgeId: input.bridgeId, sourceChainKey: input.sourceChainKey },
        'appkit bridge succeeded',
      );
    }
  } catch (err) {
    const message = (err as Error).message;
    logger.error(
      { bridgeId: input.bridgeId, err: message },
      'appkit bridge threw',
    );
    await patchBridge(input.bridgeId, { status: 'error', error: message });
    bus.emitEvent({
      type: 'bridge.error',
      actor: 'buyer',
      payload: { bridgeId: input.bridgeId, scope: 'kit.bridge', message },
    });
  }
}

/// Every chain we can withdraw TO, keyed the way the rest of the app names them.
///
/// This is the whole point of the out-direction rewrite. The old path relayed the
/// destination mint from a Circle DCW on the destination chain, so it could only
/// reach chains Circle can hold a wallet on. The Forwarding Service submits that
/// mint instead, so no destination wallet exists to constrain us, and all eleven
/// non-Arc chains become valid. Verified: every one reports
/// cctp.forwarderSupported.destination = true.
export const APP_KIT_DEST_CHAINS: Record<string, BridgeChain> = {
  sepolia: BridgeChain.Ethereum_Sepolia,
  optimismSepolia: BridgeChain.Optimism_Sepolia,
  arbitrumSepolia: BridgeChain.Arbitrum_Sepolia,
  baseSepolia: BridgeChain.Base_Sepolia,
  polygonAmoy: BridgeChain.Polygon_Amoy_Testnet,
  avalancheFuji: BridgeChain.Avalanche_Fuji,
  unichainSepolia: BridgeChain.Unichain_Sepolia,
  seiTestnet: BridgeChain.Sei_Testnet,
  sonicTestnet: BridgeChain.Sonic_Testnet,
  worldchainSepolia: BridgeChain.World_Chain_Sepolia,
  hyperevmTestnet: BridgeChain.HyperEVM_Testnet,
};

export interface AppKitBridgeOutInput {
  bridgeId: string;
  /// Destination chain key. Any of the eleven non-Arc chains.
  destChainKey: string;
  /// Arc wallet that holds the USDC being withdrawn and signs the burn. A Circle
  /// DCW: identity or an agent. Arc IS a Circle-supported chain, so this works
  /// even for the destinations Circle cannot reach.
  sourceWalletAddress: string;
  amountUsdc: string;
  /// Address on the destination chain that receives the minted USDC.
  recipient: string;
}

/// Withdraw from Arc to any supported chain, for a Circle (email/passkey) user.
///
/// Mirrors bridgeInToArcViaAppKit with the direction reversed: the Arc DCW signs
/// the burn, and Circle's forwarder fetches the attestation and broadcasts the
/// mint on the destination. Because the forwarder owns the mint, there is no
/// destination DCW, which is exactly what used to cap withdrawals at five chains.
///
/// Fire-and-forget, same as the in-direction runner: the HTTP handler returns
/// immediately and this patches the BridgeRelay record as the SDK reports steps.
export async function bridgeOutFromArcViaAppKit(input: AppKitBridgeOutInput): Promise<void> {
  const destChain = APP_KIT_DEST_CHAINS[input.destChainKey];
  if (!destChain) {
    const message = `App Kit bridge-out: unknown destination chain ${input.destChainKey}`;
    logger.error({ bridgeId: input.bridgeId }, message);
    await patchBridge(input.bridgeId, { status: 'error', error: message });
    return;
  }

  let adapter: ReturnType<typeof createCircleWalletsAdapter>;
  try {
    adapter = getAdapter();
  } catch (err) {
    const message = (err as Error).message;
    await patchBridge(input.bridgeId, { status: 'error', error: message });
    return;
  }

  const kit = new AppKit();

  kit.on('bridge.burn', (payload) => {
    const values = (payload as { values?: { state?: string; txHash?: string } }).values;
    logger.info(
      { bridgeId: input.bridgeId, state: values?.state, txHash: values?.txHash },
      'appkit bridge-out.burn',
    );
    if (values?.state === 'success' && values.txHash) {
      void patchBridge(input.bridgeId, {
        status: 'relaying',
        sourceTxHash: values.txHash,
      });
      bus.emitEvent({
        type: 'bridge.burned',
        actor: 'buyer',
        payload: {
          bridgeId: input.bridgeId,
          destChainKey: input.destChainKey,
          circle: true,
          appKit: true,
        },
      });
    }
  });

  kit.on('bridge.mint', (payload) => {
    const values = (payload as { values?: { state?: string; txHash?: string } }).values;
    logger.info(
      { bridgeId: input.bridgeId, state: values?.state, txHash: values?.txHash },
      'appkit bridge-out.mint',
    );
    // The forwarder reports the mint as 'forwarded' (it submitted the tx), so
    // treat that as terminal too, exactly as the in-direction client path does.
    if (values?.state === 'success' || values?.state === 'forwarded') {
      void patchBridge(input.bridgeId, {
        status: 'minted',
        mintTxHash: values.txHash,
      });
      bus.emitEvent({
        type: 'bridge.minted',
        actor: 'buyer',
        payload: {
          bridgeId: input.bridgeId,
          destChainKey: input.destChainKey,
          circle: true,
          appKit: true,
        },
      });
    }
  });

  try {
    const result = await kit.bridge({
      from: {
        adapter,
        chain: BridgeChain.Arc_Testnet,
        address: input.sourceWalletAddress,
      },
      to: {
        recipientAddress: input.recipient,
        chain: destChain,
        // The forwarder mints on the destination, so no DCW is needed there.
        // This is what unlocks the six chains Circle cannot hold a wallet on.
        useForwarder: true,
      },
      amount: input.amountUsdc,
    });

    if (result.state === 'error') {
      const failedStep = result.steps?.find?.((s) => s.state === 'error');
      const stepError = failedStep?.error;
      const message =
        typeof stepError === 'string'
          ? stepError
          : stepError instanceof Error
            ? stepError.message
            : stepError != null
              ? JSON.stringify(stepError)
              : 'bridge-out failed without a step-level error';
      logger.error(
        { bridgeId: input.bridgeId, failedStep: failedStep?.name, message },
        'appkit bridge-out errored',
      );
      await patchBridge(input.bridgeId, { status: 'error', error: message });
      bus.emitEvent({
        type: 'bridge.error',
        actor: 'buyer',
        payload: {
          bridgeId: input.bridgeId,
          scope: failedStep?.name ?? 'kit.bridge',
          message,
        },
      });
    } else {
      logger.info(
        { bridgeId: input.bridgeId, destChainKey: input.destChainKey },
        'appkit bridge-out succeeded',
      );
    }
  } catch (err) {
    const message = (err as Error).message;
    logger.error({ bridgeId: input.bridgeId, err: message }, 'appkit bridge-out threw');
    await patchBridge(input.bridgeId, { status: 'error', error: message });
    bus.emitEvent({
      type: 'bridge.error',
      actor: 'buyer',
      payload: { bridgeId: input.bridgeId, scope: 'kit.bridge', message },
    });
  }
}
