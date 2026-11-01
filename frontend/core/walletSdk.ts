import type { CreateConnectorFn } from 'wagmi';

/// Connectors whose wallet SDK is large (WalletConnect with Reown, Coinbase).
const LAZY_SDK_TYPES = new Set(['walletConnect', 'coinbaseWallet']);

/// wagmi sets up every connector when the app starts and asks each for its
/// provider while reconnecting, which downloaded the WalletConnect and Coinbase
/// SDKs (about 330 KB) on every page for people who never use them. Such a
/// connector now passes on that first startup ask unless it was the last one
/// used, and sets itself up the first time it is really asked for: picking it
/// in the wallet list, or reconnecting the wallet used last time.
export function sdkWhenUsed(create: CreateConnectorFn): CreateConnectorFn {
  return (config) => {
    const connector = create(config);
    if (!LAZY_SDK_TYPES.has(connector.type)) return connector;
    const { setup, getProvider, connect } = connector;
    let startupAsked = false;
    let setUp = false;
    const begin = (self: typeof connector) => {
      startupAsked = true;
      if (setUp) return;
      setUp = true;
      void setup?.call(self);
    };
    // Cast: connect's generic return type is kept by passing the call through.
    return {
      ...connector,
      setup: undefined,
      async getProvider(this: typeof connector, ...args: Parameters<typeof getProvider>) {
        if (!startupAsked) {
          startupAsked = true;
          const recent = await Promise.resolve(config.storage?.getItem('recentConnectorId')).catch(() => null);
          if (recent !== connector.id) return undefined;
        }
        begin(this);
        return getProvider.apply(this, args);
      },
      async connect(this: typeof connector, ...args: Parameters<typeof connect>) {
        begin(this);
        return connect.apply(this, args);
      },
    } as typeof connector;
  };
}
