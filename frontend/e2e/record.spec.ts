import { expect, test, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:3199';

const record = {
  displayName: 'Ada Builds',
  tag: 'ada',
  level: 'work_verified',
  tier: 'Established',
  reasons: [],
  facts: [{ kind: 'client_confirmation', issuedAt: Date.now() - 1000, expiresAt: Date.now() + 86_400_000 * 300, txHash: `0x${'ab'.repeat(32)}` }],
};

async function serve(page: Page, answer: () => { status: number; json: unknown }) {
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/r/ada') return route.fulfill(answer());
    if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: null, profile: null } });
    return route.fulfill({ json: {} });
  });
}

test('a record that fails to load says so and can be tried again', async ({ page }) => {
  let calls = 0;
  await serve(page, () => (++calls === 1 ? { status: 503, json: { error: 'down' } } : { status: 200, json: record }));
  await page.goto('/r/ada');
  await expect(page.getByText('This record cannot be shown right now.')).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Ada Builds' })).toBeVisible();
});

test('an unknown tag says what to check and links home', async ({ page }) => {
  await serve(page, () => ({ status: 404, json: { error: 'No Karwan record with that tag.' } }));
  await page.goto('/r/ada');
  await expect(page.getByText('No Karwan record with that tag.')).toBeVisible();
  await expect(page.getByText('Check the spelling, or ask the person for their link.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to Karwan' })).toHaveAttribute('href', '/');
});

test('no text on the record is under 14px', async ({ page }) => {
  await serve(page, () => ({ status: 200, json: record }));
  await page.goto('/r/ada');
  await expect(page.getByRole('heading', { name: 'Ada Builds' })).toBeVisible();
  const small = await page.locator('main *').evaluateAll((els) =>
    els
      .filter((el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()))
      .map((el) => ({ text: el.textContent!.trim().slice(0, 40), size: Number.parseFloat(getComputedStyle(el).fontSize) }))
      .filter((x) => x.size < 14),
  );
  expect(small).toEqual([]);
});

test('what others see is words only, with what they sell, even on your own preview (view 44, P10)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  const ada = '0x2222222222222222222222222222222222222222';
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/r/ada') {
      return route.fulfill({ json: { ...record, level: 'person_verified', tier: 'ESTABLISHED', score: 512, counts: { completed: 23, onTimeRate: 0.95, disputesLost: 0 }, rating: { kind: 'rated', value: 4.8, count: 23 }, reasons: ['HAS_COMPLETED_DEALS', 'USUALLY_ON_TIME', 'NO_LOST_DISPUTES', 'VERIFIED_PERSON'] } });
    }
    if (pathname === '/api/tags/ada') return route.fulfill({ json: { found: true, self: true, tag: 'ada', displayName: 'Ada Builds', address: ada } });
    if (pathname === '/api/listings') return route.fulfill({ json: { listings: [{ id: 'lst_1', sellerUser: ada, sellerAgent: ada, title: 'Logo design', description: 'd', askingPriceUsdc: 120, postedAt: 0, expiresAt: Date.now() + 86_400_000 }] } });
    if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: null, profile: null } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/r/ada');
  await expect(page.getByRole('heading', { level: 1, name: 'Ada Builds' })).toBeVisible();
  // View 48: three facts in one card, the rating, how many rated it and the level; never a deal count or a score.
  const facts = page.locator('[data-record-facts]');
  await expect(facts).toContainText('4.8');
  await expect(facts).toContainText('average rating');
  await expect(facts).toContainText('23');
  await expect(facts).toContainText('ratings');
  await expect(page.getByText('512')).toHaveCount(0);
  await expect(page.getByText(/95%/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'What Ada sells' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Logo design/ })).toHaveAttribute('href', '/listings/lst_1');
  // Your own record never asks you for an offer.
  await expect(page.getByRole('link', { name: 'Ask Ada for an offer' })).toHaveCount(0);
});

test("someone else's record has one primary: ask them for an offer (view 48)", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  const ada = '0x2222222222222222222222222222222222222222';
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/r/ada') return route.fulfill({ json: { ...record, rating: { kind: 'rated', value: 4.8, count: 23 } } });
    if (pathname === '/api/tags/ada') return route.fulfill({ json: { found: true, self: false, tag: 'ada', displayName: 'Ada Builds', address: ada } });
    if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: null, profile: null } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/r/ada');
  await expect(page.getByRole('link', { name: 'Ask Ada for an offer' })).toHaveAttribute('href', `/buyer?seller=${ada}`);
  await expect(page.getByRole('link', { name: 'Message @ada' })).toBeVisible();
  const green = await page.locator('main a, main button').evaluateAll((els) => els
    .filter((el) => el.checkVisibility() && getComputedStyle(el).backgroundColor === 'rgb(175, 201, 91)')
    .map((el) => el.textContent?.trim()));
  expect(green).toEqual(['Ask Ada for an offer']);
});

test('the record has Back, which goes to the market when opened from a link', async ({ page }) => {
  await serve(page, () => ({ status: 200, json: record }));
  await page.goto('/r/ada');
  await expect(page.getByRole('heading', { name: 'Ada Builds' })).toBeVisible();
  const back = page.getByRole('button', { name: /back/i }).first();
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/\/market/);
});
