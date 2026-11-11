import { expect, test, type Page } from '@playwright/test';
import { API, funded, serveMoney } from './moneyFixtures';

/// A new terms version asks a signed-in person to accept again, once.
/// The server says which version is current and which one the person accepted.

async function serveTerms(page: Page, accepted: string | null) {
  const world = { accepted, posted: [] as Array<{ version?: string; signature?: string }> };
  await page.route(`${API}/api/terms/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/terms/accept') {
      const body = route.request().postDataJSON() as { version?: string; signature?: string };
      world.posted.push(body);
      world.accepted = body.version ?? null;
      return route.fulfill({ json: { ok: true, version: body.version } });
    }
    return route.fulfill({ json: { currentVersion: '2.4.0', acceptedVersion: world.accepted } });
  });
  return world;
}

test('a person who accepted the older terms is asked once, and accepting clears it', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  const world = await serveTerms(page, '2.3.0');
  await page.goto('/account');

  const dialog = page.getByRole('dialog', { name: 'Karwan terms and conditions' });
  await expect(dialog).toBeVisible();
  const accept = dialog.getByRole('button', { name: /2\.4\.0/ });
  // Reading comes first: Accept opens only at the end of the text.
  await expect(accept).toBeDisabled();
  await dialog.evaluate((el) => {
    const box = [...el.querySelectorAll<HTMLElement>('*')].find(
      (n) => n.scrollHeight > n.clientHeight + 60 && getComputedStyle(n).overflowY !== 'visible',
    );
    if (box) box.scrollTop = box.scrollHeight;
  });
  await expect(accept).toBeEnabled();
  await accept.click();

  await expect(dialog).toHaveCount(0);
  // An email account's signed-in click is the consent: the version, and no signature.
  expect(world.posted).toEqual([{ version: '2.4.0' }]);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your balance');
  await expect(page.getByRole('dialog', { name: 'Karwan terms and conditions' })).toHaveCount(0);
});

test('a person on the current terms is not asked', async ({ page }) => {
  await serveMoney(page, { balances: funded });
  await serveTerms(page, '2.4.0');
  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your balance');
  await expect(page.getByRole('dialog', { name: 'Karwan terms and conditions' })).toHaveCount(0);
});
