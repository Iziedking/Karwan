import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CIRCLE_DISCOVERY_AUTHORITY,
  selectCircleMarketplaceService,
  type CircleDiscoveryResource,
} from './circleMarketplacePolicy.js';

function resource(resourceUrl: string, siwx = false): CircleDiscoveryResource {
  return { resource: resourceUrl, metadata: { method: 'POST', siwx } };
}

test('Circle Discovery remains a service catalogue, not a counterparty directory', () => {
  assert.equal(CIRCLE_DISCOVERY_AUTHORITY.authoritativeForServiceDiscovery, true);
  assert.equal(CIRCLE_DISCOVERY_AUTHORITY.authoritativeForPeopleDirectory, false);
  assert.equal(CIRCLE_DISCOVERY_AUTHORITY.authoritativeForSmeCounterpartyDirectory, false);
  assert.deepEqual(
    selectCircleMarketplaceService({
      useCase: 'counterparty-directory',
      resources: [resource('https://api.exa.ai/search')],
    }),
    { allowed: false, reason: 'COUNTERPARTY_DIRECTORY_OUT_OF_SCOPE' },
  );
});

test('web research selects Exa first and Serper only as the fallback', () => {
  const serper = resource('https://np.orthogonal.com/serper/search');
  const exa = resource('https://api.exa.ai/search');
  const primary = selectCircleMarketplaceService({ useCase: 'web-research', resources: [serper, exa] });
  const fallback = selectCircleMarketplaceService({ useCase: 'web-research', resources: [serper] });
  assert.equal(primary.allowed, true);
  assert.equal(fallback.allowed, true);
  if (!primary.allowed || !fallback.allowed) assert.fail('expected live research services');
  assert.equal(primary.provider, 'Exa');
  assert.equal(fallback.provider, 'Serper');
});

test('business evidence is supplemental and prefers OpenMart before Voygr', () => {
  const selection = selectCircleMarketplaceService({
    useCase: 'business-evidence',
    resources: [
      resource('https://np.orthogonal.com/voygr/v1/business-status'),
      resource('https://np.orthogonal.com/openmart/api/v1/enrich_company'),
    ],
  });
  assert.equal(selection.allowed, true);
  if (selection.allowed) {
    assert.equal(selection.provider, 'OpenMart');
    assert.equal(selection.authority, 'supplemental_only');
  }
});

test('Allium is blocked until subject-chain support is separately verified', () => {
  const allium = resource('https://agents.allium.so/api/v1/developer/wallet/transactions');
  assert.deepEqual(
    selectCircleMarketplaceService({ useCase: 'supported-chain-evidence', resources: [allium] }),
    { allowed: false, reason: 'SUPPORTED_CHAIN_NOT_VERIFIED' },
  );
  const selection = selectCircleMarketplaceService({
    useCase: 'supported-chain-evidence',
    resources: [allium],
    subjectChainSupportedByProvider: true,
  });
  assert.equal(selection.allowed, true);
  if (!selection.allowed) assert.fail('expected supported Allium service');
  assert.equal(selection.provider, 'Allium');
});

test('selection rejects unlisted endpoints and SIWx-gated automation resources', () => {
  assert.deepEqual(
    selectCircleMarketplaceService({
      useCase: 'web-research',
      resources: [resource('https://api.exa.ai/unlisted')],
    }),
    { allowed: false, reason: 'NO_RECOMMENDED_LIVE_RESOURCE' },
  );
  assert.deepEqual(
    selectCircleMarketplaceService({
      useCase: 'web-research',
      resources: [resource('https://api.exa.ai/search', true)],
    }),
    { allowed: false, reason: 'NO_RECOMMENDED_LIVE_RESOURCE' },
  );
});
