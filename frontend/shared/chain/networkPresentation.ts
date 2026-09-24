type NetworkMetadata = {
  id: number;
  testnet?: boolean;
  blockExplorers?: { default: { url: string } };
};

/** Presentation only. No storage, environment override, or network switching. */
export function networkPresentation(chain: NetworkMetadata) {
  const environment = chain.testnet === true ? 'testnet' : chain.testnet === false ? 'mainnet' : 'unknown';
  return {
    chainId: chain.id,
    environment,
    explorerUrl: chain.blockExplorers?.default.url,
    faucetUrl: environment === 'testnet' ? 'https://faucet.circle.com' : undefined,
    noticeKey: `${environment}Notice` as 'testnetNotice' | 'mainnetNotice' | 'unknownNotice',
  } as const;
}
