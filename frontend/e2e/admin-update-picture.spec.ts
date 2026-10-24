import { expect, test } from '@playwright/test';

/// A designer's picture goes onto a Home Updates card from /admin/updates,
/// with no code change (owner, 24 Oct 2026).

const API = 'http://127.0.0.1:3199';
const PATH = '/api/updates/images/0123456789abcdef01234567.png';

function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(b);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

test('an admin uploads a picture and the card preview shows it from the server', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'admin console is desktop');
  const uploads: string[] = [];
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/admin/support/whoami') return route.fulfill({ json: { role: 'admin' } });
    if (pathname === '/api/admin/updates') return route.fulfill({ json: { cards: [], trending: [], source: null } });
    if (pathname === '/api/admin/updates/images') {
      uploads.push(String((route.request().postDataJSON() as { dataUrl: string }).dataUrl).slice(0, 22));
      return route.fulfill({ status: 201, json: { image: PATH, width: 1600, height: 900 } });
    }
    if (pathname === PATH) return route.fulfill({ body: png(1600, 900), contentType: 'image/png' });
    return route.fulfill({ json: {} });
  });

  await page.goto('/admin/updates');
  await page.getByLabel('Operator access key').fill('test-key');
  await page.getByRole('button', { name: 'Unlock operator console' }).click();
  await expect(page.getByRole('heading', { name: 'Home updates' })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({ name: 'arc-mainnet.png', mimeType: 'image/png', buffer: png(1600, 900) });
  await expect(page.getByText('Uploaded, 1600x900. Fits the tile.')).toBeVisible();
  expect(uploads).toEqual(['data:image/png;base64,']);
  await expect(page.getByPlaceholder(/Upload a file/)).toHaveValue(PATH);
  await expect(page.locator(`img[src="${API}${PATH}"]`)).toHaveCount(1);
});

test('a picture over 4 MB is stopped before it is sent', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'admin console is desktop');
  let sent = false;
  await page.route(`${API}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/admin/support/whoami') return route.fulfill({ json: { role: 'admin' } });
    if (pathname === '/api/admin/updates') return route.fulfill({ json: { cards: [], trending: [], source: null } });
    if (pathname === '/api/admin/updates/images') sent = true;
    return route.fulfill({ json: {} });
  });
  await page.goto('/admin/updates');
  await page.getByLabel('Operator access key').fill('test-key');
  await page.getByRole('button', { name: 'Unlock operator console' }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(4_000_001) });
  await expect(page.getByRole('alert').filter({ hasText: 'under 4 MB' })).toBeVisible();
  expect(sent).toBe(false);
});
