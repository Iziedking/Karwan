import { expect, test, type Page, type Route } from '@playwright/test';

/// A designer's picture goes onto a Home Updates card from /admin/updates,
/// with no code change (owner, 24 Oct 2026). The desk calls the backend
/// through its own proxy and signs in with a team account (view 64).

const API = 'http://127.0.0.1:3199';
const DESK = '/api/admin-proxy';
const PATH = '/api/updates/images/0123456789abcdef01234567.png';
const ME = { id: 'm1', name: 'Ada', email: 'ada@karwan.test', owner: false, pages: ['updates'] };

function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(b);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

async function serveDesk(page: Page, handle: (pathname: string, route: Route) => Promise<void> | void) {
  await page.route(`**${DESK}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname.slice(DESK.length);
    if (pathname === '/api/admin/session') return route.fulfill({ json: { token: 'desk.t.s', expiresAt: Date.now() + 3_600_000, me: ME } });
    if (pathname === '/api/admin/updates' && route.request().method() === 'GET') return route.fulfill({ json: { cards: [], trending: [], source: null } });
    await handle(pathname, route);
  });
}

async function signIn(page: Page) {
  await page.goto('/admin/updates');
  await page.getByLabel('Team email').fill(ME.email);
  await page.getByLabel('Password').fill('test-password');
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Home updates' })).toBeVisible();
}

test('an admin uploads a picture and the card preview shows it from the server', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'admin console is desktop');
  const uploads: string[] = [];
  await serveDesk(page, (pathname, route) => {
    if (pathname === '/api/admin/updates/images') {
      uploads.push(String((route.request().postDataJSON() as { dataUrl: string }).dataUrl).slice(0, 22));
      return route.fulfill({ status: 201, json: { image: PATH, width: 1600, height: 900 } });
    }
    return route.fulfill({ json: {} });
  });
  await page.route(`${API}/**`, (route) => {
    if (new URL(route.request().url()).pathname === PATH) return route.fulfill({ body: png(1600, 900), contentType: 'image/png' });
    return route.fulfill({ json: {} });
  });

  await signIn(page);
  await page.locator('input[type="file"]').setInputFiles({ name: 'arc-mainnet.png', mimeType: 'image/png', buffer: png(1600, 900) });
  await expect(page.getByText('Uploaded, 1600x900. Fits the tile.')).toBeVisible();
  expect(uploads).toEqual(['data:image/png;base64,']);
  await expect(page.getByPlaceholder(/Upload a file/)).toHaveValue(PATH);
  await expect(page.locator(`img[src="${API}${PATH}"]`)).toHaveCount(1);
});

test('a picture over 4 MB is stopped before it is sent', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'admin console is desktop');
  let sent = false;
  await serveDesk(page, (pathname, route) => {
    if (pathname === '/api/admin/updates/images') sent = true;
    return route.fulfill({ json: {} });
  });
  await page.route(`${API}/**`, (route) => route.fulfill({ json: {} }));

  await signIn(page);
  await page.locator('input[type="file"]').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(4_000_001) });
  await expect(page.getByRole('alert').filter({ hasText: 'under 4 MB' })).toBeVisible();
  expect(sent).toBe(false);
});
