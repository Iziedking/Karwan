import { createClient, createPublicClient, fallback, http, type Hex } from 'viem';
import { createBundlerClient, toWebAuthnAccount } from 'viem/account-abstraction';
import { ARC_NETWORK, publicRpcFor, settlementChain as arcChain } from '@/core/arcNetwork';
import { modularClient } from './config';
import { createPasskeyProvider, type PasskeyProvider } from './provider';

/// The public half of a passkey: its id, public key and relying party. Nothing
/// here can sign; the private key never leaves the user's device.
export interface StoredPasskey {
  id: string;
  publicKey: Hex;
  rpId: string | undefined;
}

const STORAGE_KEY = 'karwan-passkey';

export function storedPasskey(): StoredPasskey | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPasskey) : null;
  } catch {
    return null;
  }
}

export function forgetPasskey(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browsers.
  }
}

/// Create a passkey (new account, named by the email) or use an existing one.
/// Login needs no name: the browser offers the passkeys saved for this site.
export async function obtainPasskey(mode: 'register' | 'login', email?: string): Promise<StoredPasskey> {
  const { toPasskeyTransport, toWebAuthnCredential, WebAuthnMode } = await import(
    '@circle-fin/modular-wallets-core'
  );
  const { key, url } = modularClient();
  const credential = await toWebAuthnCredential({
    transport: toPasskeyTransport(url, key),
    mode: mode === 'register' ? WebAuthnMode.Register : WebAuthnMode.Login,
    ...(mode === 'register' ? { username: email } : {}),
  });
  const stored: StoredPasskey = { id: credential.id, publicKey: credential.publicKey, rpId: credential.rpId };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Without storage the user signs in with the passkey again next visit.
  }
  return stored;
}

/// The EIP-1193 provider for the Circle smart account this passkey owns.
export async function passkeyProvider(passkey: StoredPasskey): Promise<PasskeyProvider> {
  const { toCircleSmartAccount, toModularTransport } = await import('@circle-fin/modular-wallets-core');
  const { key, chainUrl } = modularClient();
  const transport = toModularTransport(chainUrl, key);
  const client = createClient({ chain: arcChain, transport });
  const account = await toCircleSmartAccount({
    client,
    owner: toWebAuthnAccount({
      credential: { id: passkey.id, publicKey: passkey.publicKey },
      rpId: passkey.rpId,
    }),
  });
  const bundler = createBundlerClient({ account, chain: arcChain, transport });
  const reader = createPublicClient({
    chain: arcChain,
    transport: fallback(
      [process.env.NEXT_PUBLIC_ARC_RPC_URL, publicRpcFor(ARC_NETWORK)]
        .filter((u): u is string => !!u)
        .map((u) => http(u)),
    ),
  });
  return createPasskeyProvider({
    chainId: arcChain.id,
    account: {
      address: account.address,
      signMessage: (a) => account.signMessage(a),
      signTypedData: (a) => account.signTypedData(a as Parameters<typeof account.signTypedData>[0]),
      getFactoryArgs: () => account.getFactoryArgs(),
    },
    bundler: {
      sendUserOperation: (a) => bundler.sendUserOperation({ account, calls: a.calls }),
      waitForUserOperationReceipt: (a) => bundler.waitForUserOperationReceipt(a),
    },
    reader: {
      getCode: (a) => reader.getCode(a),
      request: (a) => reader.request(a as Parameters<typeof reader.request>[0]),
    },
  });
}
