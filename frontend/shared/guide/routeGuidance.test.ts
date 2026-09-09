import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { guidanceKind, GUIDE_COPY, routeGuidance } from './routeGuidance';
import { isNoTourRoute } from './routes';

test('sensitive standalone pages have manual guidance in every locale', () => {
  const paths = ['/profile', '/profile/contact', '/profile/setup', '/profile/wallets', '/profile/agent-funds', '/profile/business', '/profile/business/setup', '/business/verification', '/settings', '/account', '/p2p', '/b2b', '/cashout', '/cashout/example-deal'];
  for (const path of paths) {
    assert.ok(guidanceKind(path), path);
    assert.equal(isNoTourRoute(path), false, path);
    for (const locale of ['en', 'ar', 'fr', 'hi', 'sw'] as const) {
      const tour = routeGuidance(path, locale);
      assert.equal(tour?.steps.length, 2);
      assert.ok(tour?.steps.every(step => step.title && step.body && !step.body.includes('—')));
      assert.ok(GUIDE_COPY[locale].launch);
    }
  }
});

test('marketing, admin, invite and initial onboarding never show coachmarks', () => {
  for (const path of ['/', '/docs', '/how-it-works', '/admin/business', '/invite/abc', '/onboarding', '/terms']) {
    assert.equal(isNoTourRoute(path), true, path);
    assert.equal(routeGuidance(path, 'en'), null, path);
  }
});

test('guidance has no money movement or profile mutation dependency', () => {
  const source = readFileSync('shared/guide/routeGuidance.ts', 'utf8');
  assert.doesNotMatch(source, /\bfetch\(|\bapi\.|localStorage|signTransaction|writeContract/);
});

test('page launcher stays labelled and in flow, and rejects another route registration', () => {
  const source = readFileSync('shared/guide/PageTourButton.tsx', 'utf8');
  assert.match(source, /currentTour\?\.pathname === pathname/);
  assert.match(source, /force: true/);
  assert.match(source, /min-h-11/);
  assert.doesNotMatch(source, /fixed|hidden sm:inline|useFloatingClearance/);
});

test('dynamic page tours refresh their steps instead of capturing mount-time direction', () => {
  const source = readFileSync('shared/guide/PageTour.tsx', 'utf8');
  assert.match(source, /serializedSteps, replayLabel, pathname/);
});
