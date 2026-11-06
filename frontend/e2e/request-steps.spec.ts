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

test('a request is one screen, parts folded until asked, and posts the chosen date and milestones (view 48)', async ({ page }) => {
  await signedInBuyer(page);
  let posted: Record<string, unknown> | null = null;
  await page.route(`${API}/api/jobs`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posted = route.request().postDataJSON();
    return route.fulfill({ json: { jobId: '0xjob', deadlineUnix: 0, txHash: '0x1', explorerUrl: '' } });
  });
  const rf = en.requestFlow;

  await page.goto('/buyer?mode=managed');
  await expect(page.getByRole('heading', { level: 1, name: rf.pageTitle })).toBeVisible();
  await expect(page.getByText(rs.stepOf.replace('{n}', '1'), { exact: false })).toHaveCount(0);
  const post = page.locator('button[data-guide="buyer-submit"]');
  await expect(post).toHaveText(rf.post);
  await expect(post).toBeDisabled();

  await page.locator('textarea[data-guide="buyer-brief"]').fill('A logo and colours for my bakery in Accra.');
  await page.locator('input[data-guide="buyer-budget"]').fill('150');
  // No agent balance beside the form: one balance, and Karwan moves money to the agent on confirmation (view 38).
  await expect(page.getByRole('button', { name: en.money.home.topUpGapTemplate.replace('{gap}', '30.00') })).toHaveCount(0);
  await page.getByRole('button', { name: new RegExp(`^${rs.weeks2}`) }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^${rs.weeks2}`) })).toHaveAttribute('aria-pressed', 'true');
  await expect(post).toBeEnabled();

  // Paid in parts only when asked.
  const tb = TERMS_COPY.en;
  await expect(page.getByRole('button', { name: tb.addPart, exact: true })).toHaveCount(0);
  await page.getByText(rf.payInParts, { exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: tb.noWhat.replace('{n}', '1') })).toBeVisible();
  await page.getByRole('textbox', { name: `${tb.part.replace('{n}', '1')}: ${tb.whatLabel}`, exact: true }).fill('Three logo sketches to choose from');
  await page.getByRole('button', { name: tb.addPart, exact: true }).click();
  await page.getByRole('textbox', { name: `${tb.part.replace('{n}', '2')}: ${tb.whatLabel}`, exact: true }).fill('Final logo in SVG and PNG');
  await page.getByRole('button', { name: tb.addPart, exact: true }).click();
  await expect(page.getByRole('textbox', { name: `${tb.part.replace('{n}', '1')} %` })).toHaveValue('33');
  await page.getByRole('textbox', { name: `${tb.part.replace('{n}', '3')}: ${tb.whatLabel}`, exact: true }).fill('Brand colours sheet');
  await page.getByRole('textbox', { name: `${tb.part.replace('{n}', '3')} %` }).fill('10');
  await expect(page.getByText(tb.needs100.replace('{sum}', '76'), { exact: true })).toBeVisible();
  await expect(post).toBeDisabled();
  await page.getByRole('textbox', { name: `${tb.part.replace('{n}', '1')} %` }).fill('20');
  await page.getByRole('textbox', { name: `${tb.part.replace('{n}', '2')} %` }).fill('70');
  await expect(page.getByText('More terms', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: tb.days.replace('{n}', '7'), exact: true }).click();
  await expect(page.getByText(tb.ready, { exact: true })).toBeVisible();

  await post.click();
  await expect(page.getByText(en.requestFlow.nothingPaid, { exact: true })).toBeVisible();
  await expect(page.getByText(en.requestFlow.agentLine, { exact: true })).toBeVisible();
  await post.click();
  await expect.poll(() => posted).not.toBeNull();
  expect(posted).toMatchObject({ budgetUsdc: 150, deadlineSeconds: 14 * DAY_S, milestonePcts: [20, 70, 10], reviewWindowDays: 7 });
  const agreement = String((posted as unknown as { terms: string }).terms);
  expect(agreement).toContain('• Milestone 1, 20% (30 USDC): Three logo sketches to choose from');
  expect(agreement).toContain('• Milestone 3, 10% (15 USDC): Brand colours sheet');
  expect(agreement).not.toContain('Accepted when');
  expect(agreement).toContain('Time to check: 7 days after each delivery');
});

test('left folded, a request is paid at once for what it asks, and Post request turns to Finding sellers while it posts', async ({ page }, testInfo) => {
  await signedInBuyer(page);
  let posted: Record<string, unknown> | null = null;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`${API}/api/jobs`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posted = route.request().postDataJSON();
    await held;
    return route.fulfill({ json: { jobId: '0xjob', deadlineUnix: 0, txHash: '0x1', explorerUrl: '' } });
  });
  const rf = en.requestFlow;
  await page.goto('/buyer?mode=managed');
  await page.locator('textarea[data-guide="buyer-brief"]').fill('A logo for my bakery, warm and simple.');
  await page.locator('input[data-guide="buyer-budget"]').fill('150');
  await page.getByRole('button', { name: new RegExp(`^${rs.week1}`) }).click();
  await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('request-one-screen.png'), fullPage: true });
  const post = page.locator('button[data-guide="buyer-submit"]');
  await post.click();
  await post.click();
  await expect(post).toHaveAttribute('aria-busy', 'true');
  await expect(post).toContainText(rf.finding);
  await expect.poll(() => posted).not.toBeNull();
  expect(posted).toMatchObject({ budgetUsdc: 150, deadlineSeconds: 7 * DAY_S, milestonePcts: [100] });
  expect(String((posted as unknown as { terms: string }).terms)).toContain('A logo for my bakery, warm and simple.');
  release();
});

test('a picked date becomes whole days until the end of that day', async ({ page }) => {
  await signedInBuyer(page);
  await page.goto('/buyer?mode=managed');
  await page.locator('textarea[data-guide="buyer-brief"]').fill('Year-end accounts for a small agency.');
  await page.locator('input[data-guide="buyer-budget"]').fill('300');
  const target = new Date(Date.now() + 10 * DAY_S * 1000).toISOString().slice(0, 10);
  await page.getByLabel(rs.pickDate, { exact: true }).fill(target);
  await expect(page.getByText(new RegExp(`^${rs.dueOn.replace('{date}', '.+')}$`))).toBeVisible();
  await expect(page.locator('button[data-guide="buyer-submit"]')).toBeEnabled();
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
  await page.getByRole('button', { name: new RegExp(`^${en.requestFlow.kinds.one}`) }).click();
  // One screen (view 48, 9b): no steps, and nothing goes until Review.
  await expect(page.getByText(rs.stepOf.replace('{n}', '1'), { exact: false })).toHaveCount(0);
  const review = page.getByRole('button', { name: en.dealCreation.review, exact: true });
  await expect(review).toBeDisabled();
  await page.getByLabel(dd.counterparty.oneBoxLabel).fill('0x3333333333333333333333333333333333333333');
  await expect(page.getByRole('button', { name: rs.noDate, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-money-input]').first().fill('200');
  await page.getByRole('button', { name: new RegExp(`^${rs.week1}`) }).click();
  await page.locator('[data-pay-in-parts] summary').click();
  await page.getByRole('textbox', { name: `${tb.part.replace('{n}', '1')}: ${tb.whatLabel}`, exact: true }).fill('Product photos for the first 10 items');
  // Every deal starts as one milestone; a second is added on purpose.
  await page.getByRole('button', { name: tb.addPart, exact: true }).click();
  await page.getByRole('textbox', { name: `${tb.part.replace('{n}', '2')}: ${tb.whatLabel}`, exact: true }).fill('Product photos for the other 10 items');
  await page.getByRole('button', { name: tb.addPart, exact: true }).click();
  await page.getByRole('textbox', { name: `${tb.part.replace('{n}', '3')}: ${tb.whatLabel}`, exact: true }).fill('Edited set in one folder, white background, 2000 px wide');
  await page.getByRole('textbox', { name: `${tb.part.replace('{n}', '1')} %` }).fill('40');
  await page.getByRole('textbox', { name: `${tb.part.replace('{n}', '2')} %` }).fill('40');
  await page.getByRole('textbox', { name: `${tb.part.replace('{n}', '3')} %` }).fill('20');
  await page.getByRole('button', { name: tb.other, exact: true }).click();
  await page.getByRole('textbox', { name: tb.otherDays, exact: true }).fill('10');

  await page.getByRole('button', { name: en.dealCreation.review, exact: true }).click();
  await expect(page.getByRole('region').getByText(/Edited set in one folder, white background, 2000 px wide/)).toBeVisible();
  const send = page.getByRole('button', { name: rs.sendTo.replace('{name}', '0x3333…3333'), exact: true });
  await send.click();
  await expect.poll(() => posted).not.toBeNull();
  expect(posted).toMatchObject({
    sellerAddress: '0x3333333333333333333333333333333333333333',
    dealAmountUsdc: 200,
    deadlineDays: 7,
    firstReleasePct: 40,
    milestonePcts: [40, 40, 20],
    reviewWindowDays: 10,
  });
  const agreement = String((posted as unknown as { terms: string }).terms);
  expect(agreement).toContain('• Milestone 1, 40% (80 USDC): Product photos for the first 10 items');
  expect(agreement).toContain('• Milestone 3, 20% (40 USDC): Edited set in one folder');
  expect(agreement).toContain('Time to check: 10 days after each delivery');
});

test('a person can open a goods deal handed over in person, and By the hour opens the hourly form (view 32)', async ({ page }) => {
  await signedInBuyer(page);
  let posted: Record<string, unknown> | null = null;
  await page.route(`${API}/api/deals/direct`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posted = route.request().postDataJSON();
    return route.fulfill({ status: 500, json: { error: 'stop here' } });
  });
  // By the hour shows only where hourly work runs.
  await page.route(`${API}/api/features`, route => route.fulfill({ json: { hourlyWork: true } }));
  const dd = en.directDeal;
  const wf = en.work.dealForm;
  const tb = TERMS_COPY.en;

  await page.goto('/buyer?mode=direct');
  await page.getByRole('button', { name: new RegExp(`^${en.requestFlow.kinds.one}`) }).click();
  await page.getByLabel(dd.counterparty.oneBoxLabel).fill('0x3333333333333333333333333333333333333333');

  await expect(page.getByRole('link', { name: wf.byTheHour, exact: true })).toHaveAttribute('href', '/work/new');
  await page.getByRole('button', { name: wf.goods, exact: true }).click();
  await expect(page.getByRole('link', { name: wf.byTheHour, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: wf.inPerson, exact: true }).click();
  await expect(page.getByRole('button', { name: wf.inPerson, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-money-input]').first().fill('80');
  await page.getByRole('button', { name: new RegExp(`^${rs.week1}`) }).click();
  // One payment: what is delivered has its own box.
  await page.getByLabel(en.editDealModal.deliverLabel, { exact: true }).fill('Tecno Spark 20, blue, with charger');
  await page.getByRole('button', { name: en.dealCreation.review, exact: true }).click();
  await page.getByRole('button', { name: rs.sendTo.replace('{name}', '0x3333…3333'), exact: true }).click();
  await expect.poll(() => posted).not.toBeNull();
  expect(posted).toMatchObject({ tradeType: 'goods', goodsWay: 'in_person', dealAmountUsdc: 80 });
  expect(posted).not.toHaveProperty('incoterms');
});

test('a deal starts with How do you want to pay?, showing only what runs (view 44, K1)', async ({ page }) => {
  await signedInBuyer(page);
  const rf = en.requestFlow;
  await page.goto('/buyer?mode=direct');
  await expect(page.getByRole('heading', { level: 1, name: rf.kindTitle })).toBeVisible();
  await expect(page.getByRole('region', { name: rf.forWork })).toBeVisible();
  await expect(page.getByRole('region', { name: rf.forGoods })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`^${rf.kinds.hourly}`) })).toHaveCount(0);
  await page.getByRole('button', { name: new RegExp(`^${rf.kinds.stages}`) }).click();
  await expect(page.getByLabel(en.directDeal.counterparty.oneBoxLabel)).toBeVisible();

  await page.goto('/buyer?mode=direct');
  await page.getByRole('button', { name: new RegExp(`^${rf.kinds.contest}`) }).click();
  await expect(page).toHaveURL(/\/contests\/new$/);

  await page.goto('/buyer?mode=direct&kind=in_person');
  await expect(page.getByRole('heading', { level: 1, name: rf.kindTitle })).toHaveCount(0);
  await expect(page.getByLabel(en.directDeal.counterparty.oneBoxLabel)).toBeVisible();
});

test('the desk starts a request; your requests open in Market, Yours (view 44, Batch 9)', async ({ page }) => {
  await signedInBuyer(page);
  await page.goto('/buyer?mode=managed');
  const yours = page.getByRole('link', { name: en.buyerHub.managedDeals.headline });
  await expect(yours).toHaveAttribute('href', '/market?view=yours&list=requests');
  await expect(page.getByText(en.buyerHub.managedDeals.statesEmpty)).toHaveCount(0);
});
