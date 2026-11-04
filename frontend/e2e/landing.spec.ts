import { expect, test, type Page } from '@playwright/test';
import { landingCopy } from '../shared/i18n/messages/landing';

/// The landing as the advert (view 49): six scenes, chips that carry words to
/// the assistant, the team email, clips that play only in view, reduced motion
/// at rest, no sideways scroll, and the footer at the end.
const API = 'http://127.0.0.1:3199';
const t = landingCopy.en;

async function open(page: Page) {
  await page.addInitScript(() => localStorage.setItem('karwan:guide:disabled', '1'));
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/bootstrap') return route.fulfill({ json: { user: null, profile: null } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/');
  await expect(page.locator('#landing-title')).toBeVisible();
}

test('all six scenes are on the page, in order', async ({ page }) => {
  await open(page);
  const headings = page.locator('main h1, main h2');
  const texts = (await headings.allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  const want = [t.hero.titleFirst, t.panels.find.title, t.panels.protect.title, t.panels.record.title, t.trades.title, t.agent.titleFirst, t.ask.title, t.closing.titleFirst];
  let at = -1;
  for (const w of want) {
    const found = texts.findIndex((text, i) => i > at && text.includes(w));
    expect(found, w).toBeGreaterThan(at);
    at = found;
  }
});

test('a chip carries its words to the assistant', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const chip = page.getByRole('button', { name: t.ask.chips[0], exact: true });
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
  await expect(page).toHaveURL(/\/assistant$/);
});

test('with motion on, falling chips settle and send nothing by themselves', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await open(page);
  const toss = page.locator('section[aria-labelledby="landing-ask"]');
  await toss.scrollIntoViewIfNeeded();
  await page.waitForTimeout(4000);
  await expect(page).toHaveURL(/\/$/);
  const chip = toss.getByRole('button', { name: t.ask.chips[3], exact: true });
  await expect(chip).toBeInViewport();
});

test('typed words are carried the same way', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.getByLabel(t.ask.placeholder).fill('Find a carpenter in Ibadan');
  const carried = page.waitForURL(/\/assistant$/);
  await page.locator('section[aria-labelledby="landing-ask"]').getByRole('button', { name: t.ask.send, exact: true }).click();
  await carried;
});

test('Talk to our team writes to the team, and the main action names the right place', async ({ page }) => {
  await open(page);
  const closing = page.locator('section[aria-labelledby="landing-closing"]');
  await expect(closing.getByRole('link', { name: t.closing.team })).toHaveAttribute('href', 'mailto:admin@karwan.site');
  await expect(closing.getByRole('link', { name: 'admin@karwan.site' })).toHaveAttribute('href', 'mailto:admin@karwan.site');
});

test('clips play only on screen, and reduced motion plays none', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const trades = page.locator('section[aria-labelledby="landing-trades"]');
  await trades.scrollIntoViewIfNeeded();
  const first = trades.locator('video').first();
  await expect(first).toHaveAttribute('poster', /\/media\/landing\/trades\/tailor-poster\.webp/);
  await expect(first.locator('source')).toHaveAttribute('src', /tailor-1080\.mp4$/);
  await page.locator('section[aria-labelledby="landing-closing"]').scrollIntoViewIfNeeded();
  await expect.poll(() => first.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.locator('section[aria-labelledby="landing-trades"]').scrollIntoViewIfNeeded();
  await expect(page.locator('section[aria-labelledby="landing-trades"] video')).toHaveCount(0);
  await expect(page.locator('section[aria-labelledby="landing-trades"] img')).toHaveCount(6);
  const heroHeight = await page.locator('section[aria-labelledby="landing-title"]').evaluate((el) => el.getBoundingClientRect().height);
  expect(heroHeight).toBeLessThan(2 * 900);
});

for (const width of [360, 390, 430]) {
  test(`no sideways scroll at ${width} wide, top to bottom`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 1600) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    }
  });
}

test('the footer is there at the end, and phones get no social icons on the landing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const footer = page.locator('#site-footer');
  await expect(footer).toBeVisible();
  await expect(footer.getByRole('link', { name: 'LinkedIn' })).toBeHidden();
});

for (const [width, height] of [[1440, 800], [1280, 720], [1600, 1000]]) {
  test(`at ${width}x${height} the whole footer can be seen, its top never under the bar`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    const footer = page.locator('#site-footer');
    // Pinned as a curtain only when all of it fits under the bar.
    const fit = await footer.evaluate((el) => {
      const bar = document.querySelector('header[data-chrome="nav"]')!.getBoundingClientRect().height;
      return { pinned: getComputedStyle(el).position === 'sticky', fits: el.offsetHeight <= window.innerHeight - bar, bar };
    });
    if (fit.pinned) expect(fit.fits).toBe(true);
    // Scrolling to the footer's top shows it just under the bar.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await footer.evaluate((el, bar) => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, Math.min(top - bar, document.documentElement.scrollHeight));
    }, fit.bar);
    const brand = footer.getByRole('link', { name: 'Karwan' }).first();
    await expect(brand).toBeInViewport();
    const nav = await page.locator('header[data-chrome="nav"]').boundingBox();
    const top = await brand.boundingBox();
    expect(top!.y).toBeGreaterThanOrEqual(nav!.y + nav!.height);
  });
}
