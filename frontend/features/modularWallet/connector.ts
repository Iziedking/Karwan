import { createConnector } from 'wagmi';
import { getAddress, SwitchChainError, type Address } from 'viem';
import { settlementChain } from '@/core/arcNetwork';
import type { PasskeyProvider } from './provider';

export const PASSKEY_CONNECTOR_ID = 'circlePasskey';

/// wagmi connector for the Circle passkey account. Connected once a passkey is
/// stored (see obtainPasskey); reconnects on reload from that stored public
/// key. The SDK loads only when this connector is used.
export function passkeyConnector() {
  let provider: PasskeyProvider | null = null;

  async function load(): Promise<PasskeyProvider> {
    if (provider) return provider;
    const { storedPasskey, passkeyProvider } = await import('./passkey');
    const passkey = storedPasskey();
    if (!passkey) throw new Error('No passkey on this device yet');
    provider = await passkeyProvider(passkey);
    return provider;
  }

  async function accounts(): Promise<readonly Address[]> {
    const list = (await (await load()).request({ method: 'eth_accounts' })) as string[];
    return list.map((a) => getAddress(a));
  }

  return createConnector<PasskeyProvider>((config) => ({
    id: PASSKEY_CONNECTOR_ID,
    name: 'Passkey',
    type: PASSKEY_CONNECTOR_ID,
    async connect<withCapabilities extends boolean = false>() {
      const list = await accounts();
      return {
        accounts: list,
        chainId: settlementChain.id,
      } as unknown as {
        accounts: withCapabilities extends true
          ? readonly { address: Address; capabilities: Record<string, unknown> }[]
          : readonly Address[];
        chainId: number;
      };
    },
    async disconnect() {
      provider = null;
      const { forgetPasskey } = await import('./passkey');
      forgetPasskey();
    },
    getAccounts: accounts,
    async getChainId() {
      return settlementChain.id;
    },
    getProvider: load,
    async isAuthorized() {
      const { storedPasskey } = await import('./passkey');
      return !!storedPasskey();
    },
    async switchChain({ chainId }) {
      if (chainId !== settlementChain.id) {
        throw new SwitchChainError(new Error('A passkey account lives on Arc only'));
      }
      return settlementChain;
    },
    onAccountsChanged(list) {
      config.emitter.emit('change', { accounts: list.map((a) => getAddress(a)) });
    },
    onChainChanged() {},
    onDisconnect() {
      config.emitter.emit('disconnect');
    },
  }));
}
