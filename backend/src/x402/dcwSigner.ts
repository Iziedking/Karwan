import type { Address, Hex } from 'viem';
import { circleWalletsClient } from '../circle/wallets.js';

interface TypedDataParams {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

/// BatchEvmSigner over a Circle developer-controlled EOA wallet. Circle
/// Gateway verifies payment authorizations statically offchain and rejects
/// EIP-1271 signatures (per the Gateway technical guide), so the agent SCAs
/// can't sign x402 payments themselves. This EOA owns the Gateway deposit
/// and produces plain ECDSA signatures the facilitator accepts.
export function dcwEvmSigner(walletId: string, address: Address) {
  return {
    address,
    async signTypedData(params: TypedDataParams): Promise<Hex> {
      // Circle's typed-data endpoint takes the full EIP-712 JSON including
      // the EIP712Domain type, which viem-style callers leave implicit.
      // BigInts (value, validAfter, validBefore) serialize as strings.
      const data = JSON.stringify(
        {
          domain: params.domain,
          primaryType: params.primaryType,
          message: params.message,
          types: {
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'version', type: 'string' },
              { name: 'chainId', type: 'uint256' },
              { name: 'verifyingContract', type: 'address' },
            ],
            ...params.types,
          },
        },
        (_, v: unknown) => (typeof v === 'bigint' ? v.toString() : v),
      );
      const res = await circleWalletsClient().signTypedData({
        walletId,
        data,
        memo: 'Karwan x402 payment authorization',
      });
      const signature = res.data?.signature;
      if (!signature) throw new Error('Circle signTypedData returned no signature');
      return signature as Hex;
    },
  };
}
