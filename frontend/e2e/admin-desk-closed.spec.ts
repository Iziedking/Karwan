import { expect, test } from '@playwright/test';

/// The public site has no admin desk (view 64). In a production build with no
/// admin host set, every desk page and the desk's API proxy answer 404, so
/// nothing about the desk is reachable from the open internet.

test('the public site answers 404 for the admin desk and its proxy', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop', 'one screen size is enough for a status check');
  for (const path of ['/admin', '/admin/updates', '/admin/access']) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(page.getByLabel('Team email')).toHaveCount(0);
  }
  for (const [method, path] of [['GET', '/api/admin-proxy/api/admin/updates'], ['POST', '/api/admin-proxy/api/admin/session']] as const) {
    const res = await request.fetch(path, { method });
    expect(res.status(), `${method} ${path}`).toBe(404);
  }
});
