import assert from 'node:assert/strict';
import test from 'node:test';
import * as sdkChains from '@circle-fin/app-kit/chains';
import { CCTP_CHAINS_BY_NETWORK, CCTP_CHAIN_KEYS } from './cctpChains.js';
import { ARC_NETWORKS, type ArcNetworkName } from './networks.js';

type SdkChain = {
  chain: string;
  chainId?: number;
  isTestnet: boolean;
  usdcAddress: string;
  cctp?: { domain: number; contracts: { v2?: { tokenMessenger?: string } } };
};

const byName = new Map<string, SdkChain>(
  Object.values(sdkChains as Record<string, unknown>)
    .filter((d): d is SdkChain => !!d && typeof d === 'object' && 'chain' in d)
    .map((d) => [d.chain, d]),
);

for (const network of ['testnet', 'mainnet'] as ArcNetworkName[]) {
  test(`${network} source chains match Circle's own chain records`, () => {
    const spec = ARC_NETWORKS[network];
    for (const key of CCTP_CHAIN_KEYS) {
      const rec = CCTP_CHAINS_BY_NETWORK[network][key];
      const sdk = byName.get(rec.appKit);
      assert.ok(sdk, `${network}/${key}: App Kit has no chain named ${rec.appKit}`);
      assert.equal(sdk.isTestnet, spec.testnet, `${network}/${key}: wrong network`);
      assert.equal(sdk.chainId, rec.viemChain.id, `${network}/${key}: chain id`);
      assert.equal(sdk.cctp?.domain, rec.domain, `${network}/${key}: CCTP domain`);
      assert.equal(sdk.usdcAddress.toLowerCase(), rec.usdc.toLowerCase(), `${network}/${key}: USDC`);
      assert.equal(
        sdk.cctp?.contracts.v2?.tokenMessenger?.toLowerCase(),
        spec.contracts.tokenMessengerV2.toLowerCase(),
        `${network}/${key}: TokenMessenger`,
      );
    }
  });

  test(`${network} Arc record matches the App Kit chain it names`, () => {
    const spec = ARC_NETWORKS[network];
    const sdk = byName.get(spec.appKitChain);
    assert.ok(sdk, `App Kit has no chain named ${spec.appKitChain}`);
    assert.equal(sdk.chainId, spec.chainId);
    assert.equal(sdk.cctp?.domain, spec.cctpDomain);
    assert.equal(sdk.usdcAddress.toLowerCase(), spec.contracts.usdc.toLowerCase());
  });
}

test('mainnet has no backend-signed source chains', () => {
  for (const key of CCTP_CHAIN_KEYS) {
    assert.equal(CCTP_CHAINS_BY_NETWORK.mainnet[key].circleBlockchain, undefined, key);
  }
});
