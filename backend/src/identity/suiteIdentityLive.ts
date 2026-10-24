import { ARC, publicClient } from '../chain/client.js';
import { suiteAddresses } from '../chain/suiteConfig.js';
import { executeContractCall } from '../chain/txs.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { getUserByAddress } from '../db/users.js';
import { dcwEvmSigner } from '../x402/dcwSigner.js';
import { createSuiteIdentity, registryAbi, type SuiteIdentity } from './suiteIdentity.js';

type Hex = `0x${string}`;

const SIGNATURES = {
  register: 'register()',
  bind: 'bind(address,uint8,uint64,uint128,uint128,uint256,bytes)',
  unbind: 'unbind(address)',
} as const;

function bindLive(registry: Hex): SuiteIdentity {
  return createSuiteIdentity({
    registry,
    chainId: ARC.chainId,
    now: () => Math.floor(Date.now() / 1000),
    binding: async (wallet) => {
      const [id, kind, expiry] = await publicClient.readContract({ address: registry, abi: registryAbi, functionName: 'bindingOf', args: [wallet] });
      return { id: BigInt(id), kind: Number(kind), expiry: BigInt(expiry) };
    },
    nonce: (wallet) => publicClient.readContract({ address: registry, abi: registryAbi, functionName: 'nonces', args: [wallet] }),
    wallets: async (userAddress) => {
      const agents = await getAgentWallets(userAddress);
      if (!agents) return null;
      // A Circle account's sign-in wallet is held by Karwan; a web3 account holds its own.
      const walletId = getUserByAddress(userAddress)?.circleIdentityWalletId ?? null;
      return {
        identity: { address: userAddress.toLowerCase() as Hex, walletId },
        buyer: { address: agents.buyerAddress as Hex, walletId: agents.buyerWalletId },
        seller: { address: agents.sellerAddress as Hex, walletId: agents.sellerWalletId },
      };
    },
    signTypedData: (walletId, typed) =>
      dcwEvmSigner(walletId, typed.message.wallet, 'Karwan record: agent binding').signTypedData({
        domain: typed.domain,
        types: typed.types,
        primaryType: typed.primaryType,
        message: typed.message,
      }),
    execute: (walletId, fn, args) =>
      executeContractCall(
        {
          walletId,
          contractAddress: registry,
          abiFunctionSignature: SIGNATURES[fn],
          abiParameters: args.map((a) => (typeof a === 'bigint' || typeof a === 'number' ? a.toString() : a)),
        },
        `identity.${fn}`,
      ),
  });
}

const registry = suiteAddresses()?.identity ?? null;

/// The live identity setup, or null where the escrow family is not set up.
export const suiteIdentity: SuiteIdentity | null = registry ? bindLive(registry) : null;
