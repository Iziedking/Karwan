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
