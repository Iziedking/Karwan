import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

/// One block balance per page, every other figure in the chosen currency
/// (view 54). A screen never prints a figure with "USDC" by hand: it goes
/// through Price or useMoneyText. These are the only places that may, each for
/// the reason beside it.
///
///   npx tsx --test shared/components/oneCurrency.test.ts

const root = fileURLToPath(new URL('../../', import.meta.url));
const ALLOWED: Record<string, string> = {
  'features/money/components/Price.tsx': 'the formatter itself',
  'features/money/components/MoneyHome.tsx': 'the Balance tab block balance, USDC under it',
  'features/payLink/AnyChainPay.tsx': 'send exactly this USDC from another network',
  'features/order/AddMoneyPanel.tsx': 'the exact USDC to add',
  'features/deals/workspace/FundingQuoteRows.tsx': 'the confirm card before escrow is funded',
  'features/bridge/components/CrossChainFlow.tsx': 'moving between networks',
  'features/bridge/components/GatewayBalanceCard.tsx': 'moving between networks',
  'features/activity/components/StatsTicker.tsx': 'Karwan-wide totals on public pages',
  'features/developers/components/PaidDataArticle.tsx': 'developer docs priced in USDC',
  'app/docs/numbers/page.tsx': 'public numbers page',
};

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'admin') continue;
    if (statSync(join(root, path)).isDirectory()) files(path, out);
    else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) out.push(path.split('\\').join('/'));
  }
  return out;
}

test('no screen prints a figure with USDC by hand outside the formatter', () => {
  const offenders: string[] = [];
  for (const file of [...files('features'), ...files('shared'), ...files('app')]) {
    if (ALLOWED[file]) continue;
    const code = readFileSync(join(root, file), 'utf8');
    if (/\} USDC(<|`)|USDC`/.test(code)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], 'use Price or useMoneyText');
});

test('only block balances show USDC under the figure', () => {
  const price = readFileSync(join(root, 'features/money/components/Price.tsx'), 'utf8');
  assert.match(price, /local && size === 'block'/);
  for (const file of ['features/home/components/AccountHome.tsx', 'features/money/components/AgentsTab.tsx', 'features/guarantee/GuaranteeTab.tsx']) {
    assert.match(readFileSync(join(root, file), 'utf8'), /size="block"/, file);
  }
});
