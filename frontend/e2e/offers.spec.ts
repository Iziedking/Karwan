import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { funded, API } from './moneyFixtures';
import { JOB, makeJob, serveSearch } from './searchFixtures';

const SELLER_A = '0x5555555555555555555555555555555555555555';
const SELLER_B = '0x8888888888888888888888888888888888888888';
const REQUEST = {
  briefText: 'Logo and brand kit for a Lagos bakery. Logo, colours and a one page guide.',
  budgetUsdc: '120',
  deadlineUnix: Math.floor(Date.now() / 1000) + 5 * 86_400,
};
const offer = (id: string, seller: string, price: string, createdAt: number) => ({
  id,
  jobId: JOB,
  sellerUser: seller,
  priceUsdc: price,
  deliverByUnix: REQUEST.deadlineUnix - 86_400,
  note: 'Three logo routes in 48 hours, final kit by Saturday.',
  state: 'pending',
  createdAt,
  lapsesAt: REQUEST.deadlineUnix,
  fundedUsdc: (Number(price) * 1.0075).toFixed(2),
});

type World = {
  role: 'buyer' | 'seller' | 'visitor';
  offers: ReturnType<typeof offer>[];
  count?: number;
  signedOut?: boolean;
  accept?: { status: number; code?: string };
};

async function open(page: Page, world: World, theme: 'light' | 'dark' = 'light', locale: 'en' | 'ar' = 'en') {
  await page.context().addCookies([{ name: 'karwan-locale', value: locale, domain: '127.0.0.1', path: '/' }]);
  await page.addInitScript((value) => localStorage.setItem('karwan-theme', value), theme);
  await serveSearch(page, {
    balances: funded,
    job: world.role === 'buyer' ? makeJob() : { jobId: JOB, isParty: false, status: 'open' },
  });
  await page.route('**/*', async (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') return route.abort();
    return route.fallback();
  });
  let offers = [...world.offers];
  await page.route(`${API}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (world.signedOut && path === '/api/auth/bootstrap') return route.fulfill({ json: { user: null, profile: null } });
    if (path === `/api/jobs/${JOB}/offers` && method === 'GET') {
      return route.fulfill({
        json: { count: world.count ?? offers.length, offers: world.role === 'visitor' ? [] : offers, role: world.role, request: REQUEST },
      });
    }
    if (path === `/api/jobs/${JOB}/offers` && method === 'POST') {
      const body = route.request().postDataJSON() as { priceUsdc: string };
      const sent = offer('o-new', '0x1111111111111111111111111111111111111111', body.priceUsdc, Date.now());
      offers = [sent];
      return route.fulfill({ status: 201, json: { offer: sent } });
    }
    if (/\/offers\/[^/]+\/accept$/.test(path)) {
      const a = world.accept ?? { status: 200 };
      return a.status === 200
        ? route.fulfill({ json: { ok: true, txHash: '0xfund' } })
        : route.fulfill({ status: a.status, json: { error: 'short', code: a.code } });
    }
    return route.fallback();
  });
  await page.goto(`/jobs/${JOB}`);
}

async function layoutIsSound(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  for (const locale of ['en', 'ar'] as const) {
    test(`seller sees the request and can offer, ${theme} ${locale}`, async ({ page }) => {
      await open(page, { role: 'seller', offers: [] }, theme, locale);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(locale === 'en' ? 'Logo and brand kit' : 'Logo');
      // A request written in English keeps its own direction on an Arabic page.
      await expect(page.getByRole('heading', { level: 1 })).toHaveAttribute('dir', 'auto');
      await layoutIsSound(page);
    });
  }
}

test('seller sends an offer and sees it as sent', async ({ page }) => {
  await open(page, { role: 'seller', offers: [] });
  await page.getByRole('button', { name: 'Make an offer' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Price')).toHaveValue('120');
  await dialog.getByLabel('Price').fill('110');
  await layoutIsSound(page);
  await dialog.getByRole('button', { name: 'Send offer' }).click();
  await expect(page.getByText('Offer sent')).toBeVisible();
  await expect(page.getByText(/110 USDC/)).toBeVisible();
});

test('buyer sees offers cheapest first and accepts through the confirm sheet', async ({ page }) => {
  await open(page, { role: 'buyer', offers: [offer('o1', SELLER_A, '120', 1), offer('o2', SELLER_B, '96', 2)] });
  await expect(page.getByRole('heading', { name: '2 offers' })).toBeVisible();
  await expect(page.getByText('Sorted by price. You decide.')).toBeVisible();
  await layoutIsSound(page);
  await page.getByRole('button', { name: /Accept 0x8888…8888 · 96 USDC/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('held until you approve the work');
  // The amount that leaves the wallet, fee included, is the loudest number.
  await expect(dialog).toContainText('96.72 USDC');
  await expect(dialog).toContainText('96 USDC offer plus the fee');
  // The sheet must be a solid surface: money copy never sits over the page text.
  await expect.poll(() => dialog.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  const bg = await dialog.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toMatch(/rgba\(.*,\s*0(\.\d+)?\)$/);
  await dialog.getByRole('button', { name: /Accept 0x8888/ }).click();
  await expect(page.getByText('Offer accepted. The money is held.')).toBeVisible();
});

test('buyer accepting above budget sees the difference', async ({ page }) => {
  await open(page, { role: 'buyer', offers: [offer('o1', SELLER_A, '150', 1)] });
  await page.getByRole('button', { name: /Accept 0x5555/ }).click();
  await expect(page.getByRole('dialog')).toContainText('30 USDC above your budget');
});

test('buyer accepting while short sees the top-up message', async ({ page }) => {
  await open(page, { role: 'buyer', offers: [offer('o1', SELLER_A, '96', 1)], accept: { status: 409, code: 'INSUFFICIENT_AGENT_BALANCE' } });
  await page.getByRole('button', { name: /Accept 0x5555/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Accept 0x5555/ }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Top up to accept this offer.');
});

test('signed-out visitor sees the count and a sign-in, never prices of offers', async ({ page }) => {
  await open(page, { role: 'visitor', offers: [], count: 2, signedOut: true });
  await expect(page.getByText('2 offers')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in to make an offer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make an offer' })).toHaveCount(0);
});
