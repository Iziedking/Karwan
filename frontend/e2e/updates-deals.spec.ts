import { expect, test, type Page } from '@playwright/test';
import { API, ME, RATES, funded, serveMoney } from './moneyFixtures';

/// Ways to deal in Updates (view 39, 18 Nov): a real photo with the deal drawn
/// over it, its amounts in the currency chosen in Settings.

const DIRECT = {
  id: 'upd_deal_direct', order: 3, kind: 'deal', scene: 'direct', tag: 'Ways to deal', title: 'Trade with someone you know',
  body: 'Name their Karwan tag and what will be delivered. The money is held until it arrives.', ctaLabel: 'Start a deal',
  href: '/buyer?mode=direct', image: '/updates/deals/direct.jpg', ground: 'paper', art: 0,
};

async function openHome(page: Page, settings: Record<string, unknown>) {
  await serveMoney(page, { balances: funded, rates: RATES, settings });
  await page.route(`${API}/api/profile**`, (route) =>
    route.fulfill({ json: { profile: { address: ME, displayName: 'Bola Ade', handle: 'bola', settings: { setupDoneAt: 1 } } } }));
  await page.route(`${API}/api/updates`, (route) => route.fulfill({ json: { cards: [DIRECT], trending: [] } }));
  await page.goto('/app');
  const card = page.locator('a.update-card', { hasText: DIRECT.title });
  await card.scrollIntoViewIfNeeded({ timeout: 15_000 });
  return card;
}

test('a ways-to-deal card shows its photo and the deal in naira when naira is chosen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const card = await openHome(page, { displayCurrency: 'NGN' });
  await expect(card.locator('img')).toHaveAttribute('src', '/updates/deals/direct.jpg');
  await expect(card).toContainText('Held by Karwan');
  await expect(card).toContainText('₦417,294');
  await expect(card).not.toContainText('USDC');
  await expect(card).toHaveAttribute('href', '/buyer?mode=direct');
});

test('with USDC chosen the same deal reads in USDC', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const card = await openHome(page, {});
  await expect(card).toContainText('310 USDC');
  await expect(card).not.toContainText('₦');
});
