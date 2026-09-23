import type { Address } from 'viem';

/// Every chain-specific value the backend uses, per Arc network. Nothing
/// outside this file should name a chain id or a network address.
///
/// Addresses: docs.arc.io/arc/references/contract-addresses (read 2026-09-23).
/// Testnet endpoint defaults are the ones the backend has always used, so an
/// unset ARC_NETWORK behaves exactly as before.

export type ArcNetworkName = 'testnet' | 'mainnet';

export interface ArcNetworkSpec {
  name: ArcNetworkName;
  chainId: number;
  label: string;
  testnet: boolean;
  defaultRpc: string;
  defaultWss: string;
  defaultExplorer: string;
  /// Circle Wallets blockchain id, or null where Circle has not published one.
  circleBlockchain: string | null;
  cctpDomain: number;
  /// Circle's CCTP attestation API for this network.
  irisApiBase: string;
  contracts: {
    usdc: Address;
    eurc: Address;
    usyc: Address;
    usycTeller: Address;
    usycEntitlements: Address;
    gatewayWallet: Address;
    gatewayMinter: Address;
    tokenMessengerV2: Address;
    messageTransmitterV2: Address;
    fxEscrow: Address;
  };
}

export const ARC_NETWORKS: Record<ArcNetworkName, ArcNetworkSpec> = {
  testnet: {
    name: 'testnet',
    chainId: 5042002,
    label: 'Arc Testnet',
    testnet: true,
    defaultRpc: 'https://rpc.testnet.arc.network',
    defaultWss: 'wss://rpc.testnet.arc.network',
    defaultExplorer: 'https://testnet.arcscan.app',
    circleBlockchain: 'ARC-TESTNET',
    cctpDomain: 26,
    irisApiBase: 'https://iris-api-sandbox.circle.com',
    contracts: {
      usdc: '0x3600000000000000000000000000000000000000',
      eurc: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
      usyc: '0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C',
      usycTeller: '0x9fdF14c5B14173D74C08Af27AebFf39240dC105A',
      usycEntitlements: '0xcc205224862c7641930c87679e98999d23c26113',
      gatewayWallet: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
      gatewayMinter: '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B',
      tokenMessengerV2: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
      messageTransmitterV2: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
      fxEscrow: '0xd68256f4D69C6BbEcB873D8588AE0Dc6B8E22E10',
    },
  },
  mainnet: {
    name: 'mainnet',
    chainId: 5042,
    label: 'Arc',
    testnet: false,
    defaultRpc: 'https://rpc.mainnet.arc.io',
    defaultWss: 'wss://rpc.mainnet.arc.io',
    defaultExplorer: 'https://explorer.arc.io',
    circleBlockchain: null,
    cctpDomain: 26,
    irisApiBase: 'https://iris-api.circle.com',
    contracts: {
      usdc: '0x3600000000000000000000000000000000000000',
      eurc: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1',
      usyc: '0x8a5D989Bbb96929F689B0200f435f53dA42bF490',
      usycTeller: '0x51A8CE47dC08ba5CD19c7aa84EA6fD6664f60f9b',
      usycEntitlements: '0xb69ecb156Dc0028198028c501340d5367845ca72',
      gatewayWallet: '0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE',
      gatewayMinter: '0x2222222d7164433c4C09B0b0D809a9b52C04C205',
      tokenMessengerV2: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
      messageTransmitterV2: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
      fxEscrow: '0xe2E5F173576B513d994073CCbDaCBE027d43DFe6',
    },
  },
};

export interface NetworkConfigInput {
  ARC_NETWORK: ArcNetworkName;
  ARC_RPC_URL?: string;
  ARC_RPC_URLS?: string;
  ARC_WSS_URL?: string;
  ARC_WSS_URLS?: string;
  ARC_EXPLORER_URL?: string;
  ARC_CIRCLE_BLOCKCHAIN?: string;
  CCTP_MESSAGE_TRANSMITTER_ADDR?: string;
  IRIS_API_BASE?: string;
  ARC_TESTNET_RPC_URL?: string;
  ARC_TESTNET_RPC_URLS?: string;
  ARC_TESTNET_WSS_URL?: string;
  ARC_TESTNET_WSS_URLS?: string;
  ARC_TESTNET_EXPLORER_URL?: string;
}

export interface ResolvedArcNetwork extends ArcNetworkSpec {
  rpcUrls: string[];
  wssUrls: string[];
  explorer: string;
  circleBlockchain: string;
  /// CAIP-2 id, e.g. eip155:5042002.
  caip2: string;
  cctpMessageTransmitter: Address;
}

function list(primary: string, extra: string | undefined): string[] {
  const urls = [primary];
  for (const u of (extra ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!urls.includes(u)) urls.push(u);
  }
  return urls;
}

/// Resolve the active network from config. Testnet keeps honouring the
/// ARC_TESTNET_* variables; mainnet ignores them, so a testnet endpoint can
/// never be used for mainnet by accident. Throws on an unsafe mainnet setup.
export function resolveArcNetwork(c: NetworkConfigInput): ResolvedArcNetwork {
  const spec = ARC_NETWORKS[c.ARC_NETWORK];
  const legacy = spec.testnet;
  const rpc = c.ARC_RPC_URL ?? (legacy ? c.ARC_TESTNET_RPC_URL : undefined) ?? spec.defaultRpc;
  const rpcExtra = c.ARC_RPC_URLS ?? (legacy ? c.ARC_TESTNET_RPC_URLS : undefined);
  const wss = c.ARC_WSS_URL ?? (legacy ? c.ARC_TESTNET_WSS_URL : undefined) ?? spec.defaultWss;
  const wssExtra = c.ARC_WSS_URLS ?? (legacy ? c.ARC_TESTNET_WSS_URLS : undefined);
  const explorer = c.ARC_EXPLORER_URL ?? (legacy ? c.ARC_TESTNET_EXPLORER_URL : undefined) ?? spec.defaultExplorer;
  const circleBlockchain = c.ARC_CIRCLE_BLOCKCHAIN ?? spec.circleBlockchain;
  if (!circleBlockchain) {
    throw new Error(
      `ARC_CIRCLE_BLOCKCHAIN must be set for Arc ${spec.name}: Circle has not published a Wallets id for it`,
    );
  }
  return {
    ...spec,
    rpcUrls: list(rpc, rpcExtra),
    wssUrls: list(wss, wssExtra),
    explorer,
    circleBlockchain,
    caip2: `eip155:${spec.chainId}`,
    irisApiBase: c.IRIS_API_BASE ?? spec.irisApiBase,
    cctpMessageTransmitter: (c.CCTP_MESSAGE_TRANSMITTER_ADDR ?? spec.contracts.messageTransmitterV2) as Address,
  };
}
