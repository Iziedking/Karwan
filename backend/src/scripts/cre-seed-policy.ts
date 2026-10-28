import { readFileSync } from 'node:fs';
import { postgresExecutor } from '../db/client.js';
import { fingerprint } from '../cre/shared/canonical.js';
import { parsePolicy } from '../cre/shared/policy.js';
import { createSqlCreStore } from '../cre/store.js';

/// Stores an agreed acceptance policy so the CRE workflows can fetch it by
/// the fingerprint a deal carries on Arc as checkPolicy. Refuses to write
/// unless the policy's fingerprint is the one named, so a wrong file never
/// lands under a deal's hash.
///
///   node dist/scripts/cre-seed-policy.js <expected-fingerprint> < policy.json
///
/// The input is a policy, or a file with the policy under "policy" (as
/// cre/karwan-check/fixtures/scenario.json has it).

const expected = (process.argv[2] ?? '').toLowerCase();
if (!/^0x[0-9a-f]{64}$/.test(expected)) {
  console.error('usage: cre-seed-policy.js <expected-fingerprint> < policy.json');
  process.exit(2);
}

const raw = JSON.parse(readFileSync(0, 'utf8')) as { policy?: unknown };
// Validated, but stored as written: its fingerprint is what the deal names.
const policy = raw.policy ?? raw;
parsePolicy(policy, { partialAllowed: true });
const hash = fingerprint(policy).toLowerCase();
if (hash !== expected) {
  console.error(`fingerprint ${hash} is not ${expected}; nothing written`);
  process.exit(1);
}
const store = createSqlCreStore(postgresExecutor());
await store.putDocument('policy', policy);
const stored = await store.getDocument(hash);
console.log(`policy ${hash} stored (${stored ? 'read back' : 'NOT read back'})`);
process.exit(stored ? 0 : 1);
