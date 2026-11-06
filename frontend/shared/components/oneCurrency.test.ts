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

/// Amounts are typed in the person's own currency (view 55) through MoneyInput
/// or AmountHero. A plain decimal field is allowed only where it is not money,
/// or where another network sends or receives USDC.
const DECIMAL_FIELDS: Record<string, string> = {
  'features/money/components/MoneyInput.tsx': 'the money field itself',
  'features/money/components/AmountHero.tsx': 'the big money field itself',
  'features/money/components/MoneySheet.tsx': 'its field follows useAmountInput',
  'features/agent/agentPanels.tsx': 'days, not money',
  'features/profile/WaysEditor.tsx': 'days and counts, not money',
  'app/profile/edit/page.tsx': 'days, not money',
  'features/financier/components/FinancierDashboard.tsx': 'a percentage',
  'features/bridge/components/BridgeCard.tsx': 'moving between networks',
  'features/bridge/components/BridgeOutCard.tsx': 'moving between networks',
  'features/bridge/components/CrossChainFlow.tsx': 'moving between networks',
  'features/bridge/components/GatewayBalanceCard.tsx': 'moving between networks',
  'features/gateway/TopUpFromGateway.tsx': 'moving between networks',
  'features/money/components/WithdrawStart.tsx': 'the bridge page, moving between networks',
  'features/jobs/components/MatchBanner.tsx': 'being changed in another session; moves to MoneyInput when it lands',
};

test('every money field is typed in the chosen currency', () => {
  const found: string[] = [];
  for (const file of [...files('features'), ...files('shared'), ...files('app')]) {
    const code = readFileSync(join(root, file), 'utf8');
    if (/inputMode=("decimal"|\{keypad \? 'none' : 'decimal'\})/.test(code)) found.push(file);
  }
  assert.deepEqual(found.filter((file) => !DECIMAL_FIELDS[file]), [], 'use MoneyInput or AmountHero');
});
