/// One-shot empirical check of the BACKEND Solana -> Arc bridge, exactly as
/// production runs it: App Kit `kit.bridge()` with the Circle Wallets adapter
/// (entity-secret signed), Solana Devnet source -> Arc Testnet. No DB writes, no
/// HTTP, no browser wallet. This isolates the ONE thing docs can't prove — that
/// the backend Circle Wallets Solana signer works end to end with YOUR creds.
///
/// It does NOT test the frontend Phantom/manual path (solanaCctp.ts); that is a
/// browser-adapter workaround for a different App Kit bug and can't be scripted here.
///
/// Prerequisites:
///   - CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET in .env (a TESTNET key).
///   - A Circle Developer-Controlled Wallet on SOL-DEVNET that you control, funded
///     with a little Devnet USDC (faucet.circle.com) AND some Devnet SOL for gas
///     (faucet.solana.com). This is the `source` arg — its base58 address.
///   - An Arc Testnet recipient address (0x...) — where the minted USDC lands.
///
/// Usage:
///   npm run solana:bridge-smoke -- <solanaSourceAddress> <arcRecipient0x> [amountUsdc]
///   (amount defaults to 0.5; keep it above the CCTPv2 max fee or the burn reverts)
///
/// Reads every App Kit step (approve/burn/fetchAttestation/mint) to the console,
/// then prints the structured result. Exit 0 = success, 1 = error, so it is CI-able.

import { AppKit, BridgeChain } from '@circle-fin/app-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { config } from '../config.js';

async function main() {
  const [, , source, recipient, amountArg] = process.argv;
  if (!source || !recipient) {
    console.error(
      'usage: npm run solana:bridge-smoke -- <solanaSourceAddress> <arcRecipient0x> [amountUsdc]',
    );
    process.exit(2);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    console.error(`arcRecipient must be a 0x 20-byte address, got: ${recipient}`);
    process.exit(2);
  }
  const amount = amountArg ?? '0.5';

  if (!config.CIRCLE_API_KEY || !config.CIRCLE_ENTITY_SECRET) {
    console.error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are required in .env');
    process.exit(2);
  }
  if (!config.CIRCLE_API_KEY.startsWith('TEST_API_KEY')) {
    console.warn('WARNING: CIRCLE_API_KEY is not a TEST_API_KEY — this moves REAL USDC.');
  }

  console.log(
    `\nSolana -> Arc bridge smoke\n  source (SOL-DEVNET DCW): ${source}\n  recipient (Arc):         ${recipient}\n  amount:                  ${amount} USDC\n`,
  );

  const adapter = createCircleWalletsAdapter({
    apiKey: config.CIRCLE_API_KEY,
    entitySecret: config.CIRCLE_ENTITY_SECRET,
  });
  const kit = new AppKit();

  // Mirror the production event surface so any failure step is visible.
  for (const step of ['bridge.approve', 'bridge.burn', 'bridge.fetchAttestation', 'bridge.mint'] as const) {
    kit.on(step, (payload) => {
      const v = (payload as { values?: { state?: string; txHash?: string } }).values;
      console.log(`  [${step}] state=${v?.state ?? '?'}${v?.txHash ? ` tx=${v.txHash}` : ''}`);
    });
  }

  const started = Date.now();
  try {
    const result = await kit.bridge({
      from: { adapter, chain: BridgeChain.Solana_Devnet, address: source },
      to: { recipientAddress: recipient, chain: BridgeChain.Arc_Testnet, useForwarder: true },
      amount,
    });

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\nResult (after ${secs}s):`);
    console.log(JSON.stringify(result, null, 2));

    if (result.state === 'error') {
      const failed = result.steps?.find?.((s) => s.state === 'error');
      console.error(`\nFAILED at step: ${failed?.name ?? 'unknown'}`);
      process.exit(1);
    }
    console.log('\nSUCCESS — backend Circle Wallets Solana->Arc bridge works with these creds.');
    process.exit(0);
  } catch (err) {
    console.error(`\nTHREW: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
