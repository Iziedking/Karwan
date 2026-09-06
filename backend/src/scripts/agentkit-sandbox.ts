/**
 * Local proof only. The provider is a fixture and never claims to be World
 * AgentBook. It exercises verification, report reservation, delivery, retry,
 * release, and shared-human accounting without credentials or financial writes.
 */
import { createAgentKitVerifier, unavailableAgentKitVerifier } from '../agentkit/agentKitVerification.js';
import { InMemoryResearchAllowanceStore, ResearchAllowanceReplayError } from '../evidence/researchAllowance.js';
import { deliverComplimentaryResearchReport } from '../evidence/researchReportDelivery.js';

const SECRET = 'd2-local-simulation-secret-with-32-bytes';
const HUMAN_SUBJECT = 'local-fixture-human';
const AGENTS = [
  '0x1111111111111111111111111111111111111111',
  '0x2222222222222222222222222222222222222222',
] as const;

const FIXTURE_RESOURCE = 'https://fixture.karwan.test/api/research/agentkit/verify';

function request(agentAddress: string, nonce: string) {
  return { header: `${agentAddress}:${nonce}`, resourceUri: FIXTURE_RESOURCE };
}

const verifier = createAgentKitVerifier({
  humanKeySecret: SECRET,
  now: () => 2_000,
  provider: {
    async verify(input) {
      const [agentAddress, nonce] = input.header.split(':');
      if (!agentAddress || !nonce) return { status: 'rejected' as const, message: 'fixture header malformed' };
      return { status: 'verified' as const, result: { verified: true, agentAddress, humanSubject: HUMAN_SUBJECT, checkedAt: 2_000, expiresAt: 10_000, domain: 'fixture.karwan.test', nonce } };
    },
  },
});

const store = new InMemoryResearchAllowanceStore();
let humanKeyDigest = '';
for (const [index, agentAddress] of AGENTS.entries()) {
  const identity = await verifier.verify(request(agentAddress, `verify-${index}`));
  if (identity.status !== 'verified') throw new Error(identity.message);
  humanKeyDigest = identity.humanKeyDigest;
  await store.verifyBinding({ ...identity, nonceExpiresAt: identity.expiresAt, now: 2_000 + index });
}

let replay = 'not-tested';
const first = await verifier.verify(request(AGENTS[0], 'verify-0'));
if (first.status === 'verified') {
  try {
    await store.verifyBinding({ ...first, nonceExpiresAt: first.expiresAt, now: 2_003 });
  } catch (error) {
    replay = error instanceof ResearchAllowanceReplayError ? 'refused' : 'unexpected-error';
  }
}

let providerFailure = 'not-tested';
try {
  await deliverComplimentaryResearchReport({
    store,
    agentAddress: AGENTS[0],
    requestId: 'failed-request',
    resourceId: 'deal:failed:counterparty',
    now: () => 3_000,
    deliver: async () => { throw new Error('fixture provider unavailable'); },
  });
} catch {
  providerFailure = 'released';
}

let deliveries = 0;
const firstDelivery = await deliverComplimentaryResearchReport({
  store,
  agentAddress: AGENTS[0],
  requestId: 'report-request-1',
  resourceId: 'deal:shared:counterparty',
  now: () => 4_000,
  deliver: async () => { deliveries += 1; return { report: 'fixture-result' }; },
});
const retryDelivery = await deliverComplimentaryResearchReport({
  store,
  agentAddress: AGENTS[1],
  requestId: 'report-request-2',
  resourceId: 'deal:shared:counterparty',
  now: () => 4_100,
  deliver: async () => { deliveries += 1; return { report: 'should-not-run' }; },
});
const outage = await unavailableAgentKitVerifier('fixture outage').verify(request(AGENTS[0], 'outage-1'));

process.stdout.write(`${JSON.stringify({
  executionMode: 'simulated',
  provider: 'fixture-not-world',
  boundAgents: AGENTS.length,
  verificationAllowanceUsed: 0,
  replay,
  providerFailure,
  deliveryCount: deliveries,
  firstDeliveryReused: firstDelivery.reused,
  retryReused: retryDelivery.reused,
  resultIdentityStable: firstDelivery.resultId === retryDelivery.resultId,
  outage: outage.status,
  allowance: await store.get({ humanKeyDigest, now: 4_100 }),
})}\n`);
