import { createConfig, fallback, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { arcTestnet, ARC_RPC_URLS } from './wagmi';

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();

const adminConnectors = walletConnectProjectId
  ? [
    injected({ shimDisconnect: true }),
    walletConnect({
      projectId: walletConnectProjectId,
      showQrModal: true,
      metadata: {
        name: 'Karwan Operator',
        description: 'Isolated signing session for Karwan administration',
        url: 'https://karwan.site',
        icons: ['https://karwan.site/icon.png'],
      },
    }),
  ]
  : [injected({ shimDisconnect: true })];

/**
 * Deliberately separate from the customer wagmi config. It has no storage and
 * the provider disables reconnect-on-mount, so visiting /admin can never reuse
 * the account or connection state from the ordinary Karwan application.
 */
export const adminWagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: adminConnectors,
  transports: {
    [arcTestnet.id]: fallback(ARC_RPC_URLS.map((url) => http(url, { retryCount: 1 }))),
  },
  multiInjectedProviderDiscovery: false,
  storage: null,
  ssr: true,
});
