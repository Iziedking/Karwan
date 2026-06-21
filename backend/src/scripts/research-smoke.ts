import { payExternal, researchMarket, externalPayerAddress } from '../x402/externalClient.js';

/// Smoke-test the off-platform market-research rail with the REAL funded payer
/// (X402_BASE_PRIVATE_KEY from .env), the same key the platform sponsors with.
/// NOT the Circle CLI agent wallet. Spends real USDC on Base (~$0.007).
///
///   cd backend && npm run research:smoke -- "solar inverter,logistics"
///
/// Step 1 pays Exa directly (proves the x402 round-trip + on-chain settle).
/// Step 2 runs the full researchMarket (Exa + LLM synthesis) used in product.

async function main(): Promise<void> {
  const arg = process.argv.slice(2).join(' ').trim();
  const keywords = (arg || 'solar inverter,logistics')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const query = `Current market demand, pricing and notable suppliers for: ${keywords.join(', ')}.`;

  console.log('payer (X402_BASE_PRIVATE_KEY):', externalPayerAddress() || '(unset)');
  console.log('keywords:', keywords.join(', '));

  console.log('\n--- step 1: raw Exa payment over x402 (Base) ---');
  const exa = await payExternal<{ results?: Array<{ title?: string; url?: string }> }>(
    'https://api.exa.ai/search',
    { method: 'POST', body: { query, numResults: 5, contents: { text: { maxCharacters: 400 } } } },
  );
  console.log('paidUsd:', exa.paidUsd, '| payer:', exa.payer, '| txHash:', exa.txHash ?? '(not echoed)');
  for (const r of exa.data.results ?? []) console.log('  -', r.title, '·', r.url);

  console.log('\n--- step 2: full researchMarket (Exa + LLM synthesis) ---');
  const read = await researchMarket(keywords);
  console.log('demand:', read.demand);
  console.log('summary:', read.summary);
  console.log('priceNote:', read.priceNote);
  console.log('highlights:', read.highlights);
  console.log('paidUsd:', read.paidUsd, '| cached:', read.cached, '| sources:', read.sources.length);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('research smoke failed:', (err as Error).message);
    process.exit(1);
  },
);
