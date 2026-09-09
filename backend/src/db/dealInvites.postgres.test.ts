import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres serializes invite claims and rolls back deal binding atomically',
  { skip: !testDatabaseUrl },
  async () => {
    const admin = new pg.Pool({ connectionString: testDatabaseUrl, max: 2 });
    const schema = `karwan_invites_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_invites_[a-f0-9]{32}$/);
    await admin.query(`CREATE SCHEMA "${schema}"`);

    const scopedUrl = new URL(testDatabaseUrl!);
    scopedUrl.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = scopedUrl.toString();

    const client = await import('./client.js');
    const deals = await import('./deals.js');
    const invites = await import('./dealInvites.js');
    const pendingAddress = '0x0000000000000000000000000000000000000000';
    const buyer = '0x1111111111111111111111111111111111111111';
    const claimantA = '0x2222222222222222222222222222222222222222';
    const claimantB = '0x3333333333333333333333333333333333333333';

    try {
      await client.ensureSchema();

      const jobId = randomUUID();
      const token = randomUUID().replaceAll('-', '');
      await deals.createDeal({
        jobId,
        buyer,
        seller: pendingAddress,
        dealAmountUsdc: '100',
        firstReleasePct: 50,
        terms: 'Ship the accepted revision.',
        origin: 'direct',
      });
      await invites.createInvite({
        token,
        jobId,
        role: 'seller',
        email: 'seller@example.com',
        expiresAt: Date.now() + 60_000,
      });

      const claims = await Promise.all([
        invites.reserveInviteClaim(token, claimantA),
        invites.reserveInviteClaim(token, claimantB),
      ]);
      assert.equal(claims.filter((claim) => claim.ok).length, 1);
      assert.equal(claims.filter((claim) => !claim.ok && claim.code === 'IN_PROGRESS').length, 1);
      const winner = claims[0]!.ok ? claimantA : claimantB;

      const bound = await invites.bindInviteClaimToDeal({
        token,
        address: winner,
        pendingAddress,
        patch: { seller: winner, pendingCounterparty: undefined },
      });
      assert.equal(bound?.deal.seller, winner);
      assert.equal((await deals.getDeal(jobId))?.seller, winner);
      assert.equal((await invites.getInvite(token))?.usedByAddress, winner);

      const rollbackJobId = randomUUID();
      const rollbackToken = `rollback${randomUUID().replaceAll('-', '')}`;
      await deals.createDeal({
        jobId: rollbackJobId,
        buyer,
        seller: pendingAddress,
        dealAmountUsdc: '50',
        firstReleasePct: 50,
        terms: 'Keep both rows consistent.',
        origin: 'direct',
      });
      await invites.createInvite({
        token: rollbackToken,
        jobId: rollbackJobId,
        role: 'seller',
        email: 'rollback@example.com',
        expiresAt: Date.now() + 60_000,
      });
      assert.equal((await invites.reserveInviteClaim(rollbackToken, claimantA)).ok, true);
      await client.postgresExecutor().query(`
        CREATE FUNCTION reject_completed_invite() RETURNS trigger AS $$
        BEGIN
          IF NEW.token LIKE 'rollback%' AND NEW.used_at IS NOT NULL THEN
            RAISE EXCEPTION 'forced invite completion failure';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER reject_completed_invite
          BEFORE UPDATE ON deal_invites_v1
          FOR EACH ROW EXECUTE FUNCTION reject_completed_invite();
      `);

      await assert.rejects(
        invites.bindInviteClaimToDeal({
          token: rollbackToken,
          address: claimantA,
          pendingAddress,
          patch: { seller: claimantA, pendingCounterparty: undefined },
        }),
        /forced invite completion failure/,
      );
      assert.equal((await deals.getDeal(rollbackJobId))?.seller, pendingAddress);
      assert.equal((await invites.getInvite(rollbackToken))?.usedAt, undefined);
    } finally {
      await client.closePostgresPool();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  },
);
