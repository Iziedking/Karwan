/// Probe: does Circle's derive endpoint give an SCA wallet the SAME address on
/// another EVM chain?
///
/// This is the one thing Circle's docs do not answer, and the whole "one wallet
/// everywhere" design depends on it. Their API reference says derive returns
/// "an EOA ... or SCA ... wallet", but the SDK's own doc comment says "Derives
/// an EOA wallet", the request body has NO accountType field, and elsewhere the
/// docs say account type defaults to EOA when unspecified. An SCA's address
/// comes from contract deployment rather than directly from the key, so parity
/// across chains cannot be assumed.
///
/// Touches NO existing user: it creates a THROWAWAY wallet that mimics signup
/// exactly (ARC-TESTNET, accountType SCA, same wallet set), derives that, and
/// reports. No funds move; SCA creation costs nothing until first outbound tx.
///
/// Run: npm run derive:probe

import { circleWalletsClient } from '../circle/wallets.js';
import { config } from '../config.js';

const SOURCE = 'ARC-TESTNET' as const;
const TARGETS = ['BASE-SEPOLIA', 'MATIC-AMOY'] as const;

function line(label: string, value: unknown) {
  console.log(`  ${label.padEnd(14)} ${String(value)}`);
}

/// The SDK's Wallet type omits accountType, but the REST response carries it.
/// Read it off the raw object rather than trusting the narrowed type.
function acctType(w: unknown): string | undefined {
  const v = (w as { accountType?: unknown } | null | undefined)?.accountType;
  return typeof v === 'string' ? v : undefined;
}

async function main() {
  if (!config.CIRCLE_WALLET_SET_ID) throw new Error('CIRCLE_WALLET_SET_ID is not set');
  const client = circleWalletsClient();
  const refId = `derive-probe-${Date.now()}`;

  console.log('\n=== STEP 1: create a throwaway SCA wallet on Arc (mimics signup) ===');
  const created = await client.createWallets({
    blockchains: [SOURCE],
    count: 1,
    walletSetId: config.CIRCLE_WALLET_SET_ID,
    accountType: 'SCA',
    metadata: [{ name: 'karwan-derive-probe', refId }],
  });
  const source = created.data?.wallets?.[0];
  if (!source?.id || !source.address) throw new Error('probe wallet creation returned no wallet');
  line('walletId', source.id);
  line('address', source.address);
  line('accountType', acctType(source) ?? '(not returned)');
  line('blockchain', source.blockchain);

  const results: { chain: string; address?: string; accountType?: string; error?: string }[] = [];

  for (const target of TARGETS) {
    console.log(`\n=== STEP 2: derive that same wallet onto ${target} ===`);
    try {
      const derived = await client.deriveWallet({
        id: source.id,
        blockchain: target,
        metadata: { name: 'karwan-derive-probe', refId },
      });
      const w = derived.data?.wallet;
      line('walletId', w?.id ?? '(none)');
      line('address', w?.address ?? '(none)');
      line('accountType', acctType(w) ?? '(not returned)');
      line('blockchain', w?.blockchain ?? '(none)');
      results.push({
        chain: target,
        ...(w?.address ? { address: w.address } : {}),
        ...(acctType(w) ? { accountType: acctType(w) as string } : {}),
      });
    } catch (err) {
      const detail =
        (err as { response?: { data?: unknown } }).response?.data ?? (err as Error).message;
      line('ERROR', typeof detail === 'string' ? detail : JSON.stringify(detail));
      results.push({ chain: target, error: (err as Error).message });
    }
  }

  console.log('\n=== VERDICT ===');
  const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  let pass = true;
  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.chain}: FAILED to derive (${r.error})`);
      pass = false;
      continue;
    }
    const addrMatch = same(r.address, source.address);
    const typeMatch = (r.accountType ?? '').toUpperCase() === 'SCA';
    console.log(
      `  ${r.chain}: address ${addrMatch ? 'MATCHES' : 'DIFFERS'}, accountType ${r.accountType ?? '?'} ${typeMatch ? '(SCA, good)' : '(NOT SCA)'}`,
    );
    if (!addrMatch || !typeMatch) pass = false;
  }
  console.log(
    `\n  ${pass ? 'PASS — one address, still a smart account. The unified-wallet design is viable.' : 'FAIL — see above. Do NOT run a backfill; the one-address promise does not hold as-is.'}\n`,
  );
  console.log(`  Probe wallet refId (for cleanup/reference): ${refId}\n`);
}

main().catch((err) => {
  const detail = (err as { response?: { data?: unknown } }).response?.data;
  console.error('\nprobe failed:', detail ? JSON.stringify(detail, null, 2) : (err as Error).message);
  process.exit(1);
});
