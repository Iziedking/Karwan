import { expect, test, type Page } from '@playwright/test';
import { en } from '../shared/i18n/messages/en';
import { TERMS_COPY } from '../features/deals/terms/termsCopy';
import { API, ME, funded, serveMoney } from './moneyFixtures';

const rs = en.dealCreation.requestSteps;
const DAY_S = 86_400;

async function signedInBuyer(page: Page) {
  // The coachmark tour is its own dialog over the form; tours have their own tests.
  await page.addInitScript(() => {
    try { localStorage.setItem('karwan:guide:disabled', '1'); } catch { /* private mode */ }
  });
  await serveMoney(page, { balances: funded });
  await page.route(`${API}/api/profile**`, route =>
    route.fulfill({ json: { profile: { address: ME, role: 'buyer', displayName: 'Ada', handle: 'ada', buyer: { milestonePcts: [50, 50] } } } }));
  await page.route(`${API}/api/agents/buyer**`, route => route.fulfill({ json: { profile: null, jobs: [] } }));
}

test('a request is asked in three steps and posts the chosen date and milestones', async ({ page }) => {
  await signedInBuyer(page);
  let posted: Record<string, unknown> | null = null;
  await page.route(`${API}/api/jobs`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posted = route.request().postDataJSON();
    return route.fulfill({ json: { jobId: '0xjob', deadlineUnix: 0, txHash: '0x1', explorerUrl: '' } });
  });

  await page.goto('/buyer?mode=managed');
  await expect(page.getByText(`${rs.stepOf.replace('{n}', '1')} · ${rs.describe}`)).toBeVisible();
  const next = page.getByRole('button', { name: rs.continue, exact: true });
  await expect(next).toBeDisabled();

  await page.locator('textarea[data-guide="buyer-brief"]').fill('A logo and colours for my bakery in Accra.');
  await next.click();

  await expect(page.getByText(`${rs.stepOf.replace('{n}', '2')} · ${rs.price}`)).toBeVisible();
  await expect(next).toBeDisabled();
  await page.locator('input[data-guide="buyer-budget"]').fill('150');
  await page.getByRole('button', { name: new RegExp(`^${rs.weeks2}`) }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^${rs.weeks2}`) })).toHaveAttribute('aria-pressed', 'true');
  await next.click();

  await expect(page.getByText(`${rs.stepOf.replace('{n}', '3')} · ${rs.payment}`)).toBeVisible();
  const tb = TERMS_COPY.en;
  await page.getByRole('textbox', { name: `${tb.items} 1`, exact: true }).fill('Logo in SVG and PNG');
  await expect(page.getByRole('button', { name: tb.payHalf, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('summary', { hasText: tb.moreTerms }).click();
  await page.getByRole('textbox', { name: `${tb.conditions} 1`, exact: true }).fill('2 rounds of changes included');
  await page.getByRole('button', { name: tb.payCustom, exact: true }).click();
  const part1 = page.getByRole('textbox', { name: `${tb.part.replace('{n}', '1')} %` });
  const part2 = page.getByRole('textbox', { name: `${tb.part.replace('{n}', '2')} %` });
  await part1.fill('25');
  await expect(part2).toHaveValue('75');
  await page.getByRole('button', { name: tb.addPart, exact: true }).click();
  await page.getByRole('textbox', { name: `${tb.part.replace('{n}', '3')} %` }).fill('10');
  await expect(page.getByText(tb.needs100.replace('{sum}', '72'), { exact: true })).toBeVisible();
  await expect(page.locator('button[data-guide="buyer-submit"]')).toBeDisabled();
  await page.getByRole('button', { name: tb.payThirty, exact: true }).click();
  await expect(part2).toHaveCount(0);
  await page.getByRole('button', { name: tb.days.replace('{n}', '7'), exact: true }).click();
  await expect(page.getByText(tb.ready, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: rs.back, exact: true }).click();
  await expect(page.locator('input[data-guide="buyer-budget"]')).toHaveValue('150');
  await next.click();

  await page.locator('button[data-guide="buyer-submit"]').click();
  await page.locator('button[data-guide="buyer-submit"]').click();
  await expect.poll(() => posted).not.toBeNull();
  expect(posted).toMatchObject({ budgetUsdc: 150, deadlineSeconds: 14 * DAY_S, milestonePcts: [30, 70], reviewWindowDays: 7 });
  const agreement = String((posted as unknown as { terms: string }).terms);
  expect(agreement).toContain('• Logo in SVG and PNG');
  expect(agreement).toContain('• 2 rounds of changes included');
  expect(agreement).toContain('45 USDC');
  expect(agreement).toContain('Check window: 7 days');
});

test('a picked date becomes whole days until the end of that day', async ({ page }) => {
  await signedInBuyer(page);
  await page.goto('/buyer?mode=managed');
  await page.locator('textarea[data-guide="buyer-brief"]').fill('Year-end accounts for a small agency.');
  await page.getByRole('button', { name: rs.continue, exact: true }).click();
  await page.locator('input[data-guide="buyer-budget"]').fill('300');
  const target = new Date(Date.now() + 10 * DAY_S * 1000).toISOString().slice(0, 10);
  await page.getByLabel(rs.pickDate, { exact: true }).fill(target);
  await expect(page.getByText(new RegExp(`^${rs.dueOn.replace('{date}', '.+')}$`))).toBeVisible();
  await expect(page.getByRole('button', { name: rs.continue, exact: true })).toBeEnabled();
});

test('a direct deal names the seller in one box and sends the agreed terms in two parts', async ({ page }) => {
  await signedInBuyer(page);
  let posted: Record<string, unknown> | null = null;
  await page.route(`${API}/api/deals/direct`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posted = route.request().postDataJSON();
    return route.fulfill({ status: 500, json: { error: 'stop here' } });
  });
  const dd = en.directDeal;
  const tb = TERMS_COPY.en;

  await page.goto('/buyer?mode=direct');
  await expect(page.getByText(`${rs.stepOf.replace('{n}', '1')} · ${rs.seller}`)).toBeVisible();
  const next = page.getByRole('button', { name: rs.continue, exact: true });
  await expect(next).toBeDisabled();
  await page.getByLabel(dd.counterparty.oneBoxLabel).fill('0x3333333333333333333333333333333333333333');
  await next.click();

  await expect(page.getByText(`${rs.stepOf.replace('{n}', '2')} · ${rs.price}`)).toBeVisible();
  await expect(page.getByRole('button', { name: rs.noDate, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('spinbutton').first().fill('200');
  await page.getByRole('button', { name: new RegExp(`^${rs.week1}`) }).click();
  await next.click();

  await expect(page.getByText(`${rs.stepOf.replace('{n}', '3')} · ${rs.payment}`)).toBeVisible();
  await page.getByRole('textbox', { name: `${tb.items} 1`, exact: true }).fill('Product photos for 20 items');
  await page.locator('summary', { hasText: tb.moreTerms }).click();
  await page.getByRole('textbox', { name: `${tb.conditions} 1`, exact: true }).fill('White background, 2000 px wide');
  await page.getByRole('button', { name: tb.payCustom, exact: true }).click();
  await expect(page.getByRole('button', { name: tb.addPart, exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: `${tb.part.replace('{n}', '1')} %` }).fill('40');
  await expect(page.getByRole('textbox', { name: `${tb.part.replace('{n}', '2')} %` })).toHaveValue('60');
  await page.getByRole('button', { name: tb.other, exact: true }).click();
  await page.getByRole('textbox', { name: tb.otherDays, exact: true }).fill('10');

  await page.getByRole('button', { name: en.dealCreation.review, exact: true }).click();
  const send = page.getByRole('button', { name: rs.sendTo.replace('{name}', '0x3333…3333'), exact: true });
  await send.click();
  await expect.poll(() => posted).not.toBeNull();
  expect(posted).toMatchObject({
    sellerAddress: '0x3333333333333333333333333333333333333333',
    dealAmountUsdc: 200,
    deadlineDays: 7,
    firstReleasePct: 40,
    reviewWindowDays: 10,
  });
  const agreement = String((posted as unknown as { terms: string }).terms);
  expect(agreement).toContain('• Product photos for 20 items');
  expect(agreement).toContain('80 USDC');
  expect(agreement).toContain('Check window: 10 days');
});
