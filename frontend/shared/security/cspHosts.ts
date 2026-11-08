/// The outside hosts a page may talk to (view 70). cspHosts.test.ts fails when
/// the wallet or bridge code calls an RPC that is not here. Hosts set through
/// NEXT_PUBLIC_* settings are added by the middleware at request time.

const ARC = ['https://rpc.testnet.arc.io', 'wss://rpc.testnet.arc.io', 'https://rpc.drpc.testnet.arc.io', 'https://rpc.mainnet.arc.io', 'wss://rpc.mainnet.arc.io'];

const TESTNET_RPCS = [
  'https://base-sepolia-rpc.publicnode.com',
  'https://base-sepolia.drpc.org',
  'https://sepolia.base.org',
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://rpc.sepolia.org',
  'https://optimism-sepolia-rpc.publicnode.com',
  'https://optimism-sepolia.drpc.org',
  'https://sepolia.optimism.io',
  'https://arbitrum-sepolia-rpc.publicnode.com',
  'https://arbitrum-sepolia.drpc.org',
  'https://sepolia-rollup.arbitrum.io',
  'https://polygon-amoy-bor-rpc.publicnode.com',
  'https://rpc-amoy.polygon.technology',
  'https://api.avax-test.network',
  'https://sepolia.unichain.org',
  'https://evm-rpc-testnet.sei-apis.com',
  'https://rpc.testnet.soniclabs.com',
  'https://worldchain-sepolia.drpc.org',
  'https://worldchain-sepolia.g.alchemy.com',
  'https://rpc.hyperliquid-testnet.xyz',
  'https://api.devnet.solana.com',
];

/// viem's default RPC for each mainnet source chain (viem 2.55.11).
const MAINNET_RPCS = [
  'https://ethereum.reth.rs',
  'https://mainnet.base.org',
  'https://mainnet-preconf.base.org',
  'https://mainnet.optimism.io',
  'https://arb1.arbitrum.io',
  'https://polygon.drpc.org',
  'https://api.avax.network',
  'https://mainnet.unichain.org',
  'https://evm-rpc.sei-apis.com',
  'https://rpc.soniclabs.com',
  'https://worldchain-mainnet.g.alchemy.com',
  'https://rpc.hyperliquid.xyz',
];

/// Passkey wallets (Circle), outside wallets (WalletConnect and Reown,
/// Coinbase, MetaMask) and the World ID check.
const WALLETS = [
  'https://modular-sdk.circle.com',
  'https://rpc.walletconnect.org',
  'https://rpc.walletconnect.com',
  'wss://relay.walletconnect.org',
  'wss://relay.walletconnect.com',
  'https://pulse.walletconnect.org',
  'https://api.web3modal.org',
  'https://explorer-api.walletconnect.com',
  'https://verify.walletconnect.org',
  'https://verify.walletconnect.com',
  'https://keys.coinbase.com',
  'https://chain-proxy.wallet.coinbase.com',
  'https://cca-lite.coinbase.com',
  'https://metamask-sdk.api.cx.metamask.io',
  'wss://metamask-sdk.api.cx.metamask.io',
  'https://mm-sdk-analytics.api.cx.metamask.io',
  'https://bridge.worldcoin.org',
  'https://developer.worldcoin.org',
];

export const CONNECT_HOSTS: readonly string[] = [...ARC, ...TESTNET_RPCS, ...MAINNET_RPCS, ...WALLETS];

/// Windows a wallet opens inside the page.
export const FRAME_HOSTS: readonly string[] = [
  'https://verify.walletconnect.org',
  'https://verify.walletconnect.com',
  'https://keys.coinbase.com',
];
