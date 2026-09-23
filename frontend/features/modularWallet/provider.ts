import {
  numberToHex,
  serializeErc6492Signature,
  type Address,
  type Hex,
  type TypedDataDefinition,
} from 'viem';

export interface PasskeyAccountLike {
  address: Address;
  signMessage(args: { message: { raw: Hex } }): Promise<Hex>;
  signTypedData(args: TypedDataDefinition): Promise<Hex>;
  getFactoryArgs(): Promise<{ factory?: Address; factoryData?: Hex }>;
}

export interface BundlerLike {
  sendUserOperation(args: { calls: { to: Address; data: Hex; value: bigint }[] }): Promise<Hex>;
  waitForUserOperationReceipt(args: { hash: Hex }): Promise<{
    success: boolean;
    reason?: string;
    receipt: { transactionHash: Hex };
  }>;
}

export interface ReaderLike {
  getCode(args: { address: Address }): Promise<Hex | undefined>;
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

export class ProviderRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

/// EIP-1193 provider for a Circle passkey smart account, so wagmi and every
/// existing wallet flow (SIWE, bridge, Gateway) use it like any wallet.
///
/// Written here rather than taken from the SDK's EIP1193Provider for two
/// reasons, both found reading its source (1.0.16):
/// - its eth_sendTransaction returns the bundle's transaction hash even when the
///   user operation inside reverted; a reverted call must fail, not look paid.
/// - its signatures are not ERC-6492 wrapped, so a new account (no code on
///   chain until its first transaction) could not prove itself at sign-in.
export function createPasskeyProvider(deps: {
  chainId: number;
  account: PasskeyAccountLike;
  bundler: BundlerLike;
  reader: ReaderLike;
}) {
  const { chainId, account, bundler, reader } = deps;

  async function wrapIfUndeployed(signature: Hex): Promise<Hex> {
    const code = await reader.getCode({ address: account.address });
    if (code && code !== '0x') return signature;
    const { factory, factoryData } = await account.getFactoryArgs();
    if (!factory || !factoryData) return signature;
    return serializeErc6492Signature({ address: factory, data: factoryData, signature });
  }

  function assertSelf(address: unknown) {
    if (typeof address !== 'string' || address.toLowerCase() !== account.address.toLowerCase()) {
      throw new ProviderRpcError(4100, 'This passkey account did not request that signature');
    }
  }

  return {
    async request({ method, params }: { method: string; params?: unknown }): Promise<unknown> {
      const args = (params ?? []) as unknown[];
      switch (method) {
        case 'eth_accounts':
        case 'eth_requestAccounts':
          return [account.address];
        case 'eth_chainId':
          return numberToHex(chainId);
        case 'wallet_switchEthereumChain': {
          const target = Number((args[0] as { chainId?: string } | undefined)?.chainId);
          if (target === chainId) return null;
          throw new ProviderRpcError(4902, 'A passkey account lives on Arc only');
        }
        case 'personal_sign': {
          const [message, address] = args as [Hex, Address];
          assertSelf(address);
          return wrapIfUndeployed(await account.signMessage({ message: { raw: message } }));
        }
        case 'eth_signTypedData_v4': {
          const [address, data] = args as [Address, string | TypedDataDefinition];
          assertSelf(address);
          const typed = (typeof data === 'string' ? JSON.parse(data) : data) as TypedDataDefinition;
          return wrapIfUndeployed(await account.signTypedData(typed));
        }
        case 'eth_sendTransaction': {
          const [tx] = args as [{ to?: Address; data?: Hex; value?: Hex | bigint }];
          if (!tx?.to) throw new ProviderRpcError(-32602, 'A transaction needs a recipient');
          const hash = await bundler.sendUserOperation({
            calls: [{ to: tx.to, data: tx.data ?? '0x', value: tx.value ? BigInt(tx.value) : 0n }],
          });
          const result = await bundler.waitForUserOperationReceipt({ hash });
          if (!result.success) {
            throw new ProviderRpcError(-32603, result.reason || 'The transaction reverted');
          }
          return result.receipt.transactionHash;
        }
        default:
          return reader.request({ method, params });
      }
    },
  };
}

export type PasskeyProvider = ReturnType<typeof createPasskeyProvider>;
