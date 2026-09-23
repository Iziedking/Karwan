import assert from 'node:assert/strict';
import test from 'node:test';
import * as sdkChains from '@circle-fin/app-kit/chains';
import { SOURCE_CHAINS_BY_NETWORK, SOURCE_CHAIN_KEYS } from './config';

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

for (const network of ['testnet', 'mainnet'] as const) {
  test(`${network} source chains match Circle's own chain records`, () => {
    for (const key of SOURCE_CHAIN_KEYS) {
      const rec = SOURCE_CHAINS_BY_NETWORK[network][key];
      const sdk = byName.get(rec.appKit);
      assert.ok(sdk, `${network}/${key}: App Kit has no chain named ${rec.appKit}`);
      assert.equal(sdk.isTestnet, network === 'testnet', `${network}/${key}: wrong network`);
      assert.equal(sdk.chainId, rec.chainId, `${network}/${key}: chain id`);
      assert.equal(sdk.cctp?.domain, rec.domain, `${network}/${key}: CCTP domain`);
      assert.equal(sdk.usdcAddress.toLowerCase(), rec.usdc.toLowerCase(), `${network}/${key}: USDC`);
      assert.equal(
        sdk.cctp?.contracts.v2?.tokenMessenger?.toLowerCase(),
        rec.tokenMessenger.toLowerCase(),
        `${network}/${key}: TokenMessenger`,
      );
    }
  });
}
