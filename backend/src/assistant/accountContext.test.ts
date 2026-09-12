import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserProfile } from '../db/profiles.js';
import type { DirectDeal } from '../db/deals.js';
import { workspaceContext, dealProtectionContext } from './accountContext.js';

test('workspace projection is owner scoped and excludes business documents', () => {
  const profile = { address: '0xABC', business: { status: 'submitted', documentHash: 'secret' },
    workspaces: [
      { id: 'owned', ownerAddress: '0xabc', kind: 'business', name: 'Shop', business: { verificationStatus: 'not_started', company: { registrationId: 'private' } } },
      { id: 'foreign', ownerAddress: '0xdef', name: 'Hidden' },
    ],
  } as unknown as UserProfile;
  const before = JSON.stringify(profile);
  const result = workspaceContext(profile, '0xabc');
  assert.equal(result.workspaces?.length, 1);
  assert.equal(result.workspaces?.[0]?.verificationStatus, 'not_started');
  assert.equal(result.businessReviewStatus, 'submitted');
  assert.doesNotMatch(JSON.stringify(result), /secret|registrationId|Hidden/);
  assert.deepEqual(workspaceContext(profile, '0xdef'), { profile: null });
  assert.equal(JSON.stringify(profile), before);
});

test('deal projection refuses non-parties and does not expose World proof or invite secrets', () => {
  const deal = { buyer: '0xabc', seller: '0xdef', jobId: 'job', updatedAt: 123,
    highSignalVerification: { buyer: { status: 'verified', pendingNonce: 'secret', nullifierDigest: 'private', environment: 'staging' } },
    pendingCounterparty: { inviteToken: 'private-token' },
    creEvidenceReceipt: { termsVersion: 2, evidenceRevision: 1, expiresAt: 1, boundAt: 2, reportId: 'private-report' },
  } as unknown as DirectDeal;
  assert.ok('error' in dealProtectionContext(deal, '0x999'));
  const result = dealProtectionContext(deal, '0xABC', 100);
  assert.ok(!('error' in result));
  assert.equal(result.source, 'stored_deal_snapshot');
  assert.equal(result.world.buyer?.recordedStatus, 'verified');
  assert.match(result.note, /not a fresh verification/);
  assert.doesNotMatch(JSON.stringify(result), /secret|private-token|private-report|nullifierDigest/);
});
