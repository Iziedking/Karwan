import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const THEME_AWARE_WORKSPACES = [
  './components/SettlementRecord.tsx',
  '../../app/b2b/page.tsx',
  '../../app/p2p/page.tsx',
  '../../app/settings/page.tsx',
  '../../app/business/verification/page.tsx',
  '../../app/onboarding/page.tsx',
  '../../app/profile/page.tsx',
  '../../app/cashout/[jobId]/page.tsx',
  '../feedback/components/FeedbackForm.tsx',
  '../home/components/BusinessHome.tsx',
  '../jobs/components/JobPageClient.tsx',
  '../listings/components/ListingDetail.tsx',
  '../partners/components/PartnersBrowse.tsx',
] as const;

test('theme-aware workspaces do not use translucent white utilities', () => {
  for (const relativePath of THEME_AWARE_WORKSPACES) {
    const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

    assert.doesNotMatch(
      source,
      /(?:text|border|bg)-white\//,
      `${relativePath} must use --lp-workspace-* tokens instead of translucent white utilities`,
    );
  }
});

test('settlement records inherit the active workspace theme', () => {
  const source = readFileSync(
    fileURLToPath(new URL('./components/SettlementRecord.tsx', import.meta.url)),
    'utf8',
  );

  assert.doesNotMatch(source, /(?:text|border|bg)-white(?:\/|\b)/);
  for (const token of [
    '--lp-workspace-ink',
    '--lp-workspace-muted',
    '--lp-workspace-border',
    '--lp-workspace-raised',
  ]) {
    assert.match(source, new RegExp(token));
  }
});
