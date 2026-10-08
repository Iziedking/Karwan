import { expect, test, type Page } from '@playwright/test';
import { SELLER } from './fixtures';
import { en } from '../shared/i18n/messages/en';

const API = 'http://127.0.0.1:3199';
const JOB = '0x' + 'c'.repeat(64);
const copy = en.cashoutFlow;
const DEAL_WALLET = '0x' + 'd'.repeat(40);
const OTHER = '0x8f3a' + '0'.repeat(32) + 'c41e';

const info = {
  jobId: JOB,
  sellerAddress: SELLER,
  dealAmountUsdc: '56.25',
  settledAt: Date.now() - 60_000,
  legacyEscrow: false,
  accountKind: 'circle',
  identityWallet: { address: SELLER, arcBalanceUsdc: '12', available: true },
  sellerAgentWallet: { address: DEAL_WALLET, arcBalanceUsdc: '56.25', available: true },
  buyerAgentWallet: { address: null, arcBalanceUsdc: null, available: false },
};

async function mock(page: Page, opts: { onArc?: (body: Record<string, unknown>) => void; onOut?: (body: Record<string, unknown>) => void; bridgeStates?: string[]; info?: Record<string, unknown> } = {}) {
  let tick = 0;
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: { address: SELLER, method: 'circle', hasPasskey: true }, profile: null } });
    if (pathname === `/api/cashout/${JOB}`) return route.fulfill({ json: opts.info ?? info });
    if (pathname === '/api/cashout/arc-withdraw' && method === 'POST') {
      opts.onArc?.(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true, txHash: '0x' + 'a'.repeat(64), explorerUrl: 'https://x', reference: 'KWN-AAAA-BBBB-CCCC', movementState: 'completed' } });
    }
    if (pathname === '/api/bridge/circle-bridge-out' && method === 'POST') {
      opts.onOut?.(route.request().postDataJSON());
      return route.fulfill({ json: { bridgeId: 'b-1', reference: 'KWN-OUT1-OUT2-OUT3' } });
    }
    if (pathname === '/api/bridge/b-1') {
      const states = opts.bridgeStates ?? ['minted'];
      const status = states[Math.min(tick++, states.length - 1)];
      return route.fulfill({ json: { bridgeId: 'b-1', status, movementState: status === 'minted' ? 'completed' : 'submitted', burnTxHash: '0x' + 'b'.repeat(64) } });
    }
    if (method !== 'GET') return route.fulfill({ status: 403, body: '' });
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
  });
}

test('earnings go to the Karwan balance in one tap, then the receipt', async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  await mock(page, { onArc: (b) => (sent = b) });
  await page.goto(`/cashout/${JOB}`);
  await expect(page.getByText(copy.earnings)).toBeVisible();
  await expect(page.getByRole('radio', { name: new RegExp(copy.optBalance) })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(copy.optBank)).toBeVisible();
  await expect(page.getByRole('radio', { name: new RegExp(copy.optBank) })).toHaveCount(0);
  // No internals: no wallet kinds, no burn and mint.
  await expect(page.getByText(/Deal wallet|Identity wallet|Burn|Mint/)).toHaveCount(0);
  await page.getByRole('button', { name: copy.moveCta.replace('{amount}', '56.25') }).click();
  await expect.poll(() => sent).toMatchObject({ recipient: SELLER, amountUsdc: 56.25, walletKind: 'sellerAgent' });
  await expect(page.getByText(copy.sentBadge, { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: copy.back })).toHaveAttribute('href', `/deals/${JOB}`);
  await expect(page.getByRole('link', { name: copy.back })).toHaveCount(1);
});

test('another wallet on another chain shows the steps and waits for Done', async ({ page }) => {
  let out: Record<string, unknown> | null = null;
  await mock(page, { onOut: (b) => (out = b), bridgeStates: ['burning', 'relaying', 'minted'] });
  await page.goto(`/cashout/${JOB}`);
  await page.getByRole('radio', { name: new RegExp(copy.optWallet) }).click();
  await page.getByRole('radio', { name: /Base Sepolia/ }).click();
  await page.getByLabel(copy.address).fill('not an address');
  await expect(page.getByText(copy.invalidAddress.replace('{chain}', 'Base Sepolia'))).toBeVisible();
  await page.getByLabel(copy.address).fill(OTHER);
  await page.getByRole('button', { name: /Send 56.25 USDC to Base/ }).click();
  await expect.poll(() => out).toMatchObject({ destChainKey: 'baseSepolia', recipient: OTHER, sourceKind: 'sellerAgent', sourceJobId: JOB });
  const done = page.getByRole('button', { name: en.money.cross.done, exact: true });
  await expect(done).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(copy.sentBadge, { exact: true })).toHaveCount(0);
  await done.click();
  await expect(page.getByText(copy.sentBadge, { exact: true })).toBeVisible();
});

test('cashing out starts from the seller agent, even empty, and the buyer agent or main wallet are a tap away', async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  await mock(page, {
    onArc: (b) => (sent = b),
    info: {
      ...info,
      sellerAgentWallet: { address: DEAL_WALLET, arcBalanceUsdc: '0', available: true },
      buyerAgentWallet: { address: '0x' + 'b'.repeat(40), arcBalanceUsdc: '4', available: true },
    },
  });
  await page.goto(`/cashout/${JOB}`);
  const from = page.getByRole('radiogroup', { name: copy.from });
  await expect(from.getByRole('radio', { name: new RegExp(copy.fromSeller) })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(copy.nothingLeft)).toBeVisible();
  await from.getByRole('radio', { name: new RegExp(copy.fromMain) }).click();
  // From the main wallet there is no "move to your balance": it already is the balance.
  await expect(page.getByRole('radio', { name: new RegExp(copy.optBalance) })).toHaveCount(0);
  await page.getByLabel(copy.addressArc).fill(OTHER);
  await page.getByRole('button', { name: /^Send 12(\.00)? USDC$/ }).click();
  await expect.poll(() => sent).toMatchObject({ recipient: OTHER, amountUsdc: 12, walletKind: 'identity' });
});
