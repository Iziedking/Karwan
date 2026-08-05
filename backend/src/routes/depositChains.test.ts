import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_SEPOLIA_BLOCKCHAIN,
  ETH_SEPOLIA_BLOCKCHAIN,
  ARB_SEPOLIA_BLOCKCHAIN,
  POLYGON_AMOY_BLOCKCHAIN,
  SOL_DEVNET_BLOCKCHAIN,
} from '../circle/wallets.js';
import {
  CCTP_CHAINS,
  CCTP_CHAIN_KEYS,
  chainKeyForCircleBlockchain,
} from '../chain/cctpChains.js';

/// Every chain the deposit card offers must resolve to a name.
///
/// The route drops any chain it cannot map, so a renamed key or a dropped
/// `circleBlockchain` does not throw. It just quietly removes a chain from the
/// card, which reads as "we do not accept Arbitrum" rather than as a bug. This
/// makes that silence loud.
///
///   npx tsx --test src/routes/depositChains.test.ts

const EVM = [
  ETH_SEPOLIA_BLOCKCHAIN,
  BASE_SEPOLIA_BLOCKCHAIN,
  ARB_SEPOLIA_BLOCKCHAIN,
  POLYGON_AMOY_BLOCKCHAIN,
];

test('every EVM deposit chain maps to a CCTP row with a short name', () => {
  for (const chain of EVM) {
    const key = chainKeyForCircleBlockchain(chain);
    assert.ok(key, `${chain} does not map to a chain key`);
    assert.ok(
      (CCTP_CHAIN_KEYS as readonly string[]).includes(key),
      `${chain} maps to ${key}, which is not a CCTP chain key`,
    );
    const row = CCTP_CHAINS[key as (typeof CCTP_CHAIN_KEYS)[number]];
    assert.ok(row.shortName, `${key} has no shortName to show the user`);
    // The card tells the user to send USDC here, so the row it is named from has
    // to be the row the deposit watcher verifies the token against.
    assert.equal(row.circleBlockchain, chain);
  }
});

test('Solana maps to a key but is not a CCTP row', () => {
  // It has no hex USDC address and no viem chain, which is why the route names it
  // directly instead of looking it up. If it ever becomes a CCTP row, that
  // special case should go.
  const key = chainKeyForCircleBlockchain(SOL_DEVNET_BLOCKCHAIN);
  assert.equal(key, 'solanaDevnet');
  assert.ok(!(CCTP_CHAIN_KEYS as readonly string[]).includes(key!));
});

test('the four EVM chains are distinct chains', () => {
  // A copy-paste that pointed two entries at one chain would show the user a
  // shorter list than they think, and silently stop watching one.
  assert.equal(new Set(EVM).size, EVM.length);
  assert.equal(new Set(EVM.map((c) => chainKeyForCircleBlockchain(c))).size, EVM.length);
});
