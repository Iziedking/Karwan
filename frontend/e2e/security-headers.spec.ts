import { expect, test } from '@playwright/test';

test('every page forbids framing, plugins, a <base> rewrite and posting forms elsewhere', async ({ page }) => {
  for (const path of ['/', '/market', '/start']) {
    const res = await page.goto(path);
    const csp = res?.headers()['content-security-policy'] ?? '';
    for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) {
      expect(csp, `${path}: ${directive}`).toContain(directive);
    }
    expect(res?.headers()['content-security-policy-report-only'], path).toContain("script-src 'self'");
    expect(res?.headers()['x-frame-options'], path).toBe('DENY');
  }
});
