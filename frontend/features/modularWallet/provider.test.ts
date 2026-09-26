import assert from 'node:assert/strict';
import test from 'node:test';
import { parseErc6492Signature, serializeErc6492Signature, type Address, type Hex } from 'viem';
import { createPasskeyProvider, type BundlerLike, type ReaderLike } from './provider';

const self: Address = '0x00000000000000000000000000000000000000a1';
const factory: Address = '0x0000000DF7E6c9Dc387cAFc5eCBfa6c3a6179AdD';
const innerSig: Hex = '0x1234';

function setup(opts: { deployed: boolean; opSuccess?: boolean; signature?: Hex }) {
  const sent: unknown[] = [];
  const account = {
    address: self,
    signMessage: async () => opts.signature ?? innerSig,
    signTypedData: async () => opts.signature ?? innerSig,
    getFactoryArgs: async () => ({ factory, factoryData: '0xabcd' as Hex }),
  };
  const bundler: BundlerLike = {
    sendUserOperation: async (args) => {
      sent.push(args);
      return '0xop' as Hex;
    },
    waitForUserOperationReceipt: async () => ({
      success: opts.opSuccess ?? true,
      reason: opts.opSuccess === false ? 'ERC20: transfer amount exceeds balance' : undefined,
      receipt: { transactionHash: '0xbundle' as Hex },
    }),
  };
  const reader: ReaderLike = {
    getCode: async () => (opts.deployed ? '0x60806040' : undefined),
    request: async ({ method }) => `read:${method}`,
  };
  return { provider: createPasskeyProvider({ chainId: 5042, account, bundler, reader }), sent };
}

test('a reverted user operation fails instead of returning the bundle hash', async () => {
  const { provider } = setup({ deployed: true, opSuccess: false });
  await assert.rejects(
    provider.request({ method: 'eth_sendTransaction', params: [{ to: self, data: '0x' }] }),
    /exceeds balance/,
  );
});

test('a successful transaction returns its hash and sends the value as bigint', async () => {
  const { provider, sent } = setup({ deployed: true });
  const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ to: self, value: '0x10' }] });
  assert.equal(hash, '0xbundle');
  assert.deepEqual(sent, [{ calls: [{ to: self, data: '0x', value: 16n }] }]);
});

test('the account stays on Arc', async () => {
  const { provider } = setup({ deployed: true });
  assert.equal(await provider.request({ method: 'eth_chainId' }), '0x13b2');
  assert.equal(await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x13b2' }] }), null);
  await assert.rejects(
    provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] }),
    (e: { code?: number }) => e.code === 4902,
  );
});

test('a new account signs with ERC-6492 so it can sign in before its first transaction', async () => {
  const fresh = setup({ deployed: false }).provider;
  const wrapped = (await fresh.request({ method: 'personal_sign', params: ['0x68', self] })) as Hex;
  const parsed = parseErc6492Signature(wrapped);
  assert.equal(parsed.address, factory);
  assert.equal(parsed.signature, innerSig);

  const deployed = setup({ deployed: true }).provider;
  assert.equal(await deployed.request({ method: 'personal_sign', params: ['0x68', self] }), innerSig);
});

test('a signature the account already wrapped in ERC-6492 is not wrapped again', async () => {
  // viem's toSmartAccount wraps undeployed accounts itself; a second wrapper
  // leaves the server's validator holding a wrapper instead of a signature.
  const already = serializeErc6492Signature({ address: factory, data: '0xabcd', signature: innerSig });
  const { provider } = setup({ deployed: false, signature: already });
  const out = (await provider.request({ method: 'personal_sign', params: ['0x68', self] })) as Hex;
  assert.equal(out, already);
  assert.equal(parseErc6492Signature(out).signature, innerSig);
});

test('it refuses to sign for any other address', async () => {
  const { provider } = setup({ deployed: true });
  await assert.rejects(
    provider.request({ method: 'personal_sign', params: ['0x68', '0x00000000000000000000000000000000000000b2'] }),
  );
});
