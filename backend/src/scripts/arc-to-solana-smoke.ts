/// One-shot empirical check of the Arc -> Solana bridge (bridge OUT to Solana),
/// which is NOT wired into production yet. This exists to ANSWER the open
/// question before we build it: does App Kit's `kit.bridge` to a Solana
/// destination handle the recipient's USDC Associated Token Account (ATA), or
/// does it fail because the ATA does not exist?
///
/// Solana SPL transfers require the recipient to hold a USDC ATA (Circle docs:
/// "you must create the ATA and pay its rent before a transfer can succeed").
/// App Kit's docs only show Solana as a SOURCE, so ATA handling for a Solana
/// DESTINATION is undocumented. Run this to find out empirically:
///   - If it SUCCEEDS: App Kit / the forwarder handles the ATA. We can wire
///     Arc->Solana cash-out with just a base58 recipient.
///   - If it FAILS with an ATA / account-not-found error: we must pre-create the
///     recipient ATA (see https://developers.circle.com/wallets/gas-station/create-solana-ata)
///     before the mint, and wire that step in.
///
/// Also verifies whether the forwarder even supports Solana as a destination
/// (bridge-kit.ts only verified forwarder support for the 11 EVM dest chains).
///
/// Prerequisites:
///   - CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET in .env (testnet).
///   - An Arc Testnet Circle DCW holding Devnet USDC (the source; e.g. an agent
///     or identity wallet address) — the `arcSource` arg.
///   - A Solana Devnet recipient address (base58) — the `solanaRecipient` arg.
///     Try it BOTH with a recipient that already has a USDC ATA and one that does
///     not, to see the difference.
///
/// Usage:
///   npm run arc-solana-smoke -- <arcSourceDCW_0x> <solanaRecipient_base58> [amountUsdc]

import { AppKit, BridgeChain } from '@circle-fin/app-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { config } from '../config.js';

async function main() {
  const [, , arcSource, solanaRecipient, amountArg] = process.argv;
  if (!arcSource || !solanaRecipient) {
    console.error('usage: npm run arc-solana-smoke -- <arcSourceDCW_0x> <solanaRecipient_base58> [amountUsdc]');
    process.exit(2);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(arcSource)) {
    console.error(`arcSource must be a 0x 20-byte Arc address, got: ${arcSource}`);
    process.exit(2);
  }
  // Loose base58 sanity check (Solana addresses are 32-44 base58 chars).
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(solanaRecipient)) {
    console.error(`solanaRecipient does not look like a base58 Solana address: ${solanaRecipient}`);
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
    `\nArc -> Solana bridge smoke (UNWIRED path — verification only)\n  source (Arc DCW):        ${arcSource}\n  recipient (Solana):      ${solanaRecipient}\n  amount:                  ${amount} USDC\n`,
  );

  const adapter = createCircleWalletsAdapter({
    apiKey: config.CIRCLE_API_KEY,
    entitySecret: config.CIRCLE_ENTITY_SECRET,
  });
  const kit = new AppKit();
  for (const step of ['bridge.approve', 'bridge.burn', 'bridge.fetchAttestation', 'bridge.mint'] as const) {
    kit.on(step, (payload) => {
      const v = (payload as { values?: { state?: string; txHash?: string } }).values;
      console.log(`  [${step}] state=${v?.state ?? '?'}${v?.txHash ? ` tx=${v.txHash}` : ''}`);
    });
  }

  const started = Date.now();
  try {
    const result = await kit.bridge({
      from: { adapter, chain: BridgeChain.Arc_Testnet, address: arcSource },
      to: { recipientAddress: solanaRecipient, chain: BridgeChain.Solana_Devnet, useForwarder: true },
      amount,
    });

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\nResult (after ${secs}s):`);
    console.log(JSON.stringify(result, null, 2));

    if (result.state === 'error') {
      const failed = result.steps?.find?.((s) => s.state === 'error');
      console.error(`\nFAILED at step: ${failed?.name ?? 'unknown'}`);
      console.error('If the error mentions a missing ATA / token account, Arc->Solana needs an');
      console.error('explicit recipient-ATA creation step before we wire it into production.');
      process.exit(1);
    }
    console.log('\nSUCCESS — App Kit handles Arc->Solana (incl. the recipient ATA). Safe to wire.');
    process.exit(0);
  } catch (err) {
    console.error(`\nTHREW: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
