import { expect, test, type Page } from '@playwright/test';
import { en } from '../shared/i18n/messages/en';
import { TERMS_COPY } from '../features/deals/terms/termsCopy';
import { API, ME, funded, serveMoney } from './moneyFixtures';
import { attachCopy } from '../shared/i18n/messages/attachCopy';

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
  await page.route(`${API}/api/deals/fits`, route => route.fulfill({ json: { count: 0, offers: [] } }));
}

test('a request is said in words and Prepare my request drafts its parts; the review lists them and posts them (view 56)', async ({ page }) => {
  await signedInBuyer(page);
  let posted: Record<string, unknown> | null = null;
  let draftedFrom = '';
  await page.route(`${API}/api/jobs`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posted = route.request().postDataJSON();
    return route.fulfill({ json: { jobId: '0xjob', deadlineUnix: 0, txHash: '0x1', explorerUrl: '' } });
  });
  await page.route(`${API}/api/deals/draft`, async route => {
    draftedFrom = (route.request().postDataJSON() as { brief: string }).brief;
    return route.fulfill({ json: { draft: { title: 'A logo for my bakery', parts: [{ pct: 30, what: 'Three logo sketches to choose from' }, { pct: 70, what: 'Final logo in SVG and PNG' }], tradeType: 'service', quantity: null, source: 'rules' } } });
  });
  const rf = en.requestFlow;

  await page.goto('/buyer?mode=managed');
  await expect(page.getByRole('heading', { level: 1, name: rf.pageTitle })).toBeVisible();
  await expect(page.getByText(rs.stepOf.replace('{n}', '1'), { exact: false })).toHaveCount(0);
  const post = page.locator('button[data-guide="buyer-submit"]');
  await expect(post).toHaveText(rf.prepare);
  await expect(post).toBeDisabled();
  // No milestone setup on the form: the words carry it.
  await expect(page.getByText(rf.payInParts, { exact: true })).toHaveCount(0);

  await page.locator('textarea[data-guide="buyer-brief"]').fill('A logo for my bakery: three sketches first, then the final files.');
  await page.locator('input[data-guide="buyer-budget"]').fill('150');
  await page.getByRole('button', { name: new RegExp(`^${rs.weeks2}`) }).click();
  await expect(post).toBeEnabled();

  await post.click();
  expect(draftedFrom).toBe('A logo for my bakery: three sketches first, then the final files.');
  await expect(page.locator('[data-drafted]')).toHaveText(rf.drafted);
  await expect(page.getByRole('region').locator('dd').filter({ hasText: '30%: Three logo sketches to choose from' }).first()).toBeVisible();
  await expect(page.getByText(en.requestFlow.nothingPaid, { exact: true })).toBeVisible();
  await post.click();
  await expect.poll(() => posted).not.toBeNull();
  expect(posted).toMatchObject({ budgetUsdc: 150, deadlineSeconds: 14 * DAY_S, milestonePcts: [30, 70] });
  const agreement = String((posted as unknown as { terms: string }).terms);
  expect(agreement).toContain('• Milestone 1, 30%: Three logo sketches to choose from');
  expect(agreement).toContain('• Milestone 2, 70%: Final logo in SVG and PNG');
});

test('before posting, the review names the offers already on the market that fit, and the request still posts (view 56)', async ({ page }) => {
  await signedInBuyer(page);
  let posted: Record<string, unknown> | null = null;
  let asked: { brief: string; budgetUsdc: number } | null = null;
  await page.route(`${API}/api/jobs`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posted = route.request().postDataJSON();
    return route.fulfill({ json: { jobId: '0xjob', deadlineUnix: 0, txHash: '0x1', explorerUrl: '' } });
  });
  await page.route(`${API}/api/deals/draft`, route => route.fulfill({ json: { draft: { title: 'A logo', parts: [{ pct: 100, what: 'A logo for my bakery.' }], tradeType: 'service', quantity: null, source: 'rules' } } }));
  await page.route(`${API}/api/deals/fits`, async route => {
    asked = route.request().postDataJSON();
    return route.fulfill({ json: { count: 4, offers: [
      { id: 'lst_a', title: 'Bakery logo', askingPriceUsdc: 80 },
      { id: 'lst_b', title: 'Logo', askingPriceUsdc: 40 },
      { id: 'lst_c', title: 'Logo for small shops', askingPriceUsdc: 95 },
    ] } });
  });
  const rf = en.requestFlow;
  await page.goto('/buyer?mode=managed');
  await page.locator('textarea[data-guide="buyer-brief"]').fill('A logo for my bakery.');
  await page.locator('input[data-guide="buyer-budget"]').fill('100');
  await page.getByRole('button', { name: new RegExp(`^${rs.week1}`) }).click();
  const post = page.locator('button[data-guide="buyer-submit"]');
  await post.click();
  expect(asked).toEqual({ brief: 'A logo for my bakery.', budgetUsdc: 100 });
  const fit = page.locator('[data-already-fit]');
  await expect(fit).toContainText(rf.alreadyFitMany.replace('{n}', '4'));
  await expect(fit.getByRole('link')).toHaveCount(3);
  await expect(fit.getByRole('link', { name: /Bakery logo/ })).toHaveAttribute('href', '/listings/lst_a');
  await expect(fit).toContainText(rf.postAnyway);
  await post.click();
  await expect.poll(() => posted).not.toBeNull();
});

test('when no offer fits, the review says nothing about the market', async ({ page }) => {
  await signedInBuyer(page);
  await page.route(`${API}/api/deals/draft`, route => route.fulfill({ status: 503, json: { error: 'down' } }));
  await page.goto('/buyer?mode=managed');
  await page.locator('textarea[data-guide="buyer-brief"]').fill('Year-end accounts for a small agency.');
  await page.locator('input[data-guide="buyer-budget"]').fill('300');
  await page.getByRole('button', { name: new RegExp(`^${rs.week1}`) }).click();
  await page.locator('button[data-guide="buyer-submit"]').click();
  await expect(page.getByText(en.requestFlow.nothingPaid, { exact: true })).toBeVisible();
  await expect(page.locator('[data-already-fit]')).toHaveCount(0);
});

test('when the draft cannot be made, the request is paid at once and still posts', async ({ page }) => {
  await signedInBuyer(page);
  let posted: Record<string, unknown> | null = null;
  await page.route(`${API}/api/jobs`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posted = route.request().postDataJSON();
    return route.fulfill({ json: { jobId: '0xjob', deadlineUnix: 0, txHash: '0x1', explorerUrl: '' } });
  });
  await page.route(`${API}/api/deals/draft`, route => route.fulfill({ status: 503, json: { error: 'down' } }));
  await page.goto('/buyer?mode=managed');
  await page.locator('textarea[data-guide="buyer-brief"]').fill('Year-end accounts for a small agency.');
  await page.locator('input[data-guide="buyer-budget"]').fill('300');
  await page.getByRole('button', { name: new RegExp(`^${rs.week1}`) }).click();
  const post = page.locator('button[data-guide="buyer-submit"]');
  await post.click();
  await expect(page.locator('[data-drafted]')).toHaveCount(0);
  await post.click();
  await expect.poll(() => posted).not.toBeNull();
  expect(posted).toMatchObject({ milestonePcts: [100] });
});

test('one part, a request is paid at once for what it asks, and the button turns to Finding sellers while it posts', async ({ page }, testInfo) => {
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
  await page.route(`${API}/api/deals/draft`, route => route.fulfill({ json: { draft: { title: 'A logo', parts: [{ pct: 100, what: 'A logo for my bakery, warm and simple.' }], tradeType: 'service', quantity: null, source: 'rules' } } }));
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

test('a direct deal names the seller in one box, and what was agreed in words becomes its parts (view 56)', async ({ page }) => {
  await signedInBuyer(page);
  let posted: Record<string, unknown> | null = null;
  await page.route(`${API}/api/deals/direct`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posted = route.request().postDataJSON();
    return route.fulfill({ status: 500, json: { error: 'stop here' } });
  });
  await page.route(`${API}/api/deals/draft`, route => route.fulfill({ json: { draft: { title: 'Product photos', parts: [
    { pct: 40, what: 'Product photos for the first 10 items' },
    { pct: 40, what: 'Product photos for the other 10 items' },
    { pct: 20, what: 'Edited set in one folder, white background, 2000 px wide' },
  ], tradeType: 'service', quantity: null, source: 'model' } } }));
  const dd = en.directDeal;

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
  // No seller deposit (owner, 6 Nov 2026). Parts stay one tap away on work but
  // closed, so the words carry the parts (owner, 8 Nov 2026).
  await expect(page.getByText(en.dealCreation.security, { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-pay-in-parts]')).not.toHaveAttribute('open', /.*/);
  await page.getByLabel(en.editDealModal.deliverLabel, { exact: true }).fill('Product photos: 10 items first, then the other 10, then the edited set in one folder.');
  await page.getByRole('button', { name: en.dealCreation.review, exact: true }).click();
  await expect(page.locator('[data-drafted]')).toHaveText(en.requestFlow.drafted);
  await expect(page.getByRole('region').getByText(/20%: Edited set in one folder, white background, 2000 px wide/)).toBeVisible();
  const send = page.getByRole('button', { name: rs.sendTo.replace('{name}', '0x3333…3333'), exact: true });
  await send.click();
  await expect.poll(() => posted).not.toBeNull();
  expect(posted).toMatchObject({
    sellerAddress: '0x3333333333333333333333333333333333333333',
    dealAmountUsdc: 200,
    deadlineDays: 7,
    firstReleasePct: 40,
    milestonePcts: [40, 40, 20],
  });
  const agreement = String((posted as unknown as { terms: string }).terms);
  expect(agreement).toContain('• Milestone 1, 40% (80 USDC): Product photos for the first 10 items');
  expect(agreement).toContain('• Milestone 3, 20% (40 USDC): Edited set in one folder');
});

const PDF = { name: 'quote.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 sample quote') };

test('a request takes photos or PDFs with one attach button; review lists them and they go with the request (view 56)', async ({ page }) => {
  await signedInBuyer(page);
  let posted: Record<string, unknown> | null = null;
  await page.route(`${API}/api/jobs`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posted = route.request().postDataJSON();
    return route.fulfill({ json: { jobId: '0xjob', deadlineUnix: 0, txHash: '0x1', explorerUrl: '' } });
  });
  await page.route(`${API}/api/deals/draft`, route => route.fulfill({ status: 503, json: { error: 'down' } }));
  const at = attachCopy.en;
  await page.goto('/buyer?mode=managed');
  await page.locator('textarea[data-guide="buyer-brief"]').fill('Shelves for my shop, like the quote attached.');
  await page.locator('input[data-guide="buyer-budget"]').fill('300');
  await page.getByRole('button', { name: new RegExp(`^${rs.week1}`) }).click();
  await expect(page.getByText(at.hintRequest, { exact: true })).toBeVisible();
  await page.locator('[data-attach] input[type="file"]').setInputFiles(PDF);
  await expect(page.locator('[data-attach]').getByText('quote.pdf')).toBeVisible();
  // A file that is neither a photo nor a PDF is refused on the device.
  await page.locator('[data-attach] input[type="file"]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.locator('[data-attach] [role="alert"]')).toHaveText(at.notAllowed);
  const post = page.locator('button[data-guide="buyer-submit"]');
  await post.click();
  await expect(page.getByRole('region').locator('dd').filter({ hasText: 'quote.pdf' }).first()).toBeVisible();
  await post.click();
  await expect.poll(() => posted).not.toBeNull();
  const sent = (posted as unknown as { attachments: Array<{ name: string; dataUrl: string }> }).attachments;
  expect(sent).toHaveLength(1);
  expect(sent[0]!.name).toBe('quote.pdf');
  expect(sent[0]!.dataUrl).toMatch(/^data:application\/pdf;base64,JVBERi0/);
});

test('a direct deal takes the same attach button, and only the two sides are told they see it', async ({ page }) => {
  await signedInBuyer(page);
  let posted: Record<string, unknown> | null = null;
  await page.route(`${API}/api/deals/direct`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posted = route.request().postDataJSON();
    return route.fulfill({ status: 500, json: { error: 'stop here' } });
  });
  await page.route(`${API}/api/deals/draft`, route => route.fulfill({ status: 503, json: { error: 'down' } }));
  await page.goto('/buyer?mode=direct');
  await page.getByRole('button', { name: new RegExp(`^${en.requestFlow.kinds.one}`) }).click();
  await page.getByLabel(en.directDeal.counterparty.oneBoxLabel).fill('0x3333333333333333333333333333333333333333');
  await page.locator('[data-money-input]').first().fill('200');
  await page.getByRole('button', { name: new RegExp(`^${rs.week1}`) }).click();
  await page.getByLabel(en.editDealModal.deliverLabel, { exact: true }).fill('Ten product photos on a white background.');
  await expect(page.getByText(attachCopy.en.hintDeal, { exact: true })).toBeVisible();
  await page.locator('[data-attach] input[type="file"]').setInputFiles(PDF);
  await page.getByRole('button', { name: en.dealCreation.review, exact: true }).click();
  await expect(page.getByRole('region').getByText('quote.pdf')).toBeVisible();
  await page.getByRole('button', { name: rs.sendTo.replace('{name}', '0x3333…3333'), exact: true }).click();
  await expect.poll(() => posted).not.toBeNull();
  expect((posted as unknown as { attachments: Array<{ name: string }> }).attachments.map((a) => a.name)).toEqual(['quote.pdf']);
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
