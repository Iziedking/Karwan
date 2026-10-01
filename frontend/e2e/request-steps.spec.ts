import { expect, test, type Page } from '@playwright/test';
import { en } from '../shared/i18n/messages/en';
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
  await page.getByText(en.postJob.customSplit.eyebrow, { exact: true }).click();
  const part1 = page.getByRole('textbox', { name: `${rs.part.replace('{n}', '1')} %` });
  const part2 = page.getByRole('textbox', { name: `${rs.part.replace('{n}', '2')} %` });
  await part1.fill('30');
  await expect(page.getByText(`${rs.total.replace('{sum}', '80')}. ${rs.needs100}`)).toBeVisible();
  await part2.fill('70');
  await expect(page.getByText(rs.total.replace('{sum}', '100'), { exact: true })).toBeVisible();

  await page.getByRole('button', { name: rs.back, exact: true }).click();
  await expect(page.locator('input[data-guide="buyer-budget"]')).toHaveValue('150');
  await next.click();

  await page.locator('button[data-guide="buyer-submit"]').click();
  await page.locator('button[data-guide="buyer-submit"]').click();
  await expect.poll(() => posted).not.toBeNull();
  expect(posted).toMatchObject({ budgetUsdc: 150, deadlineSeconds: 14 * DAY_S, milestonePcts: [30, 70] });
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
