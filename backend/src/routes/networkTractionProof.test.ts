import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/// GET /api/network/traction-proof: waitlist, survey and team counts with every
/// contact masked, open only while PUBLIC_TRACTION_ENABLED is on.
///
///   npx tsx --test src/routes/networkTractionProof.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-traction-proof-')));
delete process.env.DATABASE_URL;
process.env.PUBLIC_TRACTION_ENABLED = 'true';
process.env.TRACTION_TEAM_ACCOUNTS = '0x1234567890abcdef1234567890abcdef12345678, 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

const { networkRoutes } = await import('./network.js');
const { joinWaitlist } = await import('../db/waitlist.js');
const { saveResearchAnswer } = await import('../db/researchAnswers.js');

const answer = (id: string, contact: string | null) => ({
  id,
  createdAt: Date.now(),
  locale: 'en',
  role: 'both' as const,
  checks: ['vouch' as const],
  otherText: 'my private note',
  trustMost: 'vouch' as const,
  easiestFake: 'reviews' as const,
  share: 'yes' as const,
  payer: 'free' as const,
  contact,
});

test('counts and masked contacts come back, and nothing private leaves', async () => {
  await joinWaitlist('amara.okafor@gmail.com', 'en');
  await joinWaitlist('bola@yahoo.com', 'en');
  await saveResearchAnswer(answer('s1', 'amara.okafor@gmail.com'));
  await saveResearchAnswer(answer('s2', '+234 803 555 0142'));
  await saveResearchAnswer(answer('s3', null));

  const res = await networkRoutes.request(new Request('http://local/traction-proof'));
  assert.equal(res.status, 200);
  const text = await res.text();
  const body = JSON.parse(text);

  assert.equal(body.waitlist.total, 2);
  assert.deepEqual(body.waitlist.contacts, ['a***@gmail.com', 'b***@yahoo.com']);
  assert.equal(body.survey.total, 3);
  assert.equal(body.survey.withContact, 2);
  assert.equal(body.survey.emails, 1);
  assert.equal(body.survey.phones, 1);
  assert.equal(body.team.count, 2);
  assert.deepEqual(body.team.accounts, ['0x1234…5678', '0xabcd…abcd']);
  assert.match(body.note, /Self-reported/);

  for (const secret of ['okafor', 'bola@', '5550142', 'my private note', '567890abcdef']) {
    assert.equal(text.includes(secret), false, `leaked ${secret}`);
  }
});
