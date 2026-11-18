import { expect, test } from '@playwright/test';

const API = 'http://127.0.0.1:3199';

test('the feedback page sits in one centred column and sends', async ({ page }) => {
  const sent: unknown[] = [];
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: null, profile: null } });
    if (pathname === '/api/feedback' && route.request().method() === 'POST') {
      sent.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true, id: 'fb-1' } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/feedback');
  const column = page.locator('[data-feedback-page]');
  await expect(column).toBeVisible();

  const width = page.viewportSize()!.width;
  const box = (await column.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(12);
  expect(box.width).toBeLessThanOrEqual(600);
  const heading = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
  expect(Math.abs(heading.x + heading.width / 2 - width / 2)).toBeLessThan(12);

  await expect(page.locator('[data-feedback-kind="bug"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-feedback-kind="improvement"]').click();
  await expect(page.locator('[data-feedback-kind="improvement"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('An idea to make it better')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add screenshot' })).toBeVisible();

  await page.getByLabel('Title').fill('Bridge stuck');
  await page.getByLabel('What happened').fill('It stayed on attesting for an hour.');
  await page.getByLabel(/^Where/).fill('/bridge');
  await page.getByRole('button', { name: 'Send feedback' }).click();

  await expect(page.locator('[data-feedback-sent]')).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ category: 'improvement', title: 'Bridge stuck', context: { url: '/bridge' } });

  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(scroll).toBeLessThanOrEqual(0);
});
