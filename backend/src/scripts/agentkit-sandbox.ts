/**
 * Local D2 proof only. The provider below is a fixture and never claims to be
 * World AgentBook. It exercises the same verifier, nonce, and allowance seams
 * without credentials, network access, wallet signing, or financial writes.
 */
import {
  AGENTKIT_DOMAIN,
  createAgentKitVerifier,
  unavailableAgentKitVerifier,
} from '../agentkit/agentKitVerification.js';
import {
  InMemoryResearchAllowanceStore,
  ResearchAllowanceReplayError,
} from '../evidence/researchAllowance.js';

const SECRET = 'd2-local-simulation-secret-with-32-bytes';
const HUMAN_SUBJECT = 'local-fixture-human';
const AGENTS = [
  '0x1111111111111111111111111111111111111111',
  '0x2222222222222222222222222222222222222222',
] as const;

function request(agentAddress: string, nonce: string) {
  return {
    agentAddress,
    domain: AGENTKIT_DOMAIN,
    nonce,
    issuedAt: 1_000,
    expiresAt: 10_000,
    signature: '0xlocal-fixture-proof',
    proof: { executionMode: 'simulated' },
  };
}

const verifier = createAgentKitVerifier({
  humanKeySecret: SECRET,
  now: () => 2_000,
  provider: {
    async verify(input) {
      return {
        status: 'verified' as const,
        result: {
          verified: true,
          agentAddress: input.agentAddress,
          humanSubject: HUMAN_SUBJECT,
          checkedAt: 2_000,
          expiresAt: input.expiresAt,
        },
      };
    },
  },
});

const store = new InMemoryResearchAllowanceStore();
const usage: Array<{ agentAddress: string; used: number; remaining: number }> = [];
for (const [index, agentAddress] of AGENTS.entries()) {
  const identity = await verifier.verify(request(agentAddress, `local-${index}`));
  if (identity.status !== 'verified') throw new Error(identity.message);
  const result = await store.consume({
    humanKeyDigest: identity.humanKeyDigest,
    agentAddress: identity.agentAddress,
    domain: AGENTKIT_DOMAIN,
    nonce: `local-${index}`,
    nonceExpiresAt: 10_000,
    now: 2_000 + index,
  });
  usage.push({ agentAddress, used: result.snapshot.used, remaining: result.snapshot.remaining });
}

let replay = 'not-tested';
const first = await verifier.verify(request(AGENTS[0], 'local-0'));
if (first.status === 'verified') {
  try {
    await store.consume({
      humanKeyDigest: first.humanKeyDigest,
      agentAddress: first.agentAddress,
      domain: AGENTKIT_DOMAIN,
      nonce: 'local-0',
      nonceExpiresAt: 10_000,
      now: 2_003,
    });
  } catch (error) {
    replay = error instanceof ResearchAllowanceReplayError ? 'refused' : 'unexpected-error';
  }
}

const outage = await unavailableAgentKitVerifier('fixture outage').verify(request(AGENTS[0], 'outage-1'));
process.stdout.write(`${JSON.stringify({
  executionMode: 'simulated',
  provider: 'fixture-not-world',
  boundAgents: AGENTS.length,
  usage,
  replay,
  outage: outage.status,
  allowanceUsedAfterReplay: (await store.get({ humanKeyDigest: first.status === 'verified' ? first.humanKeyDigest : '0'.repeat(64), now: 2_003 }))?.used ?? null,
})}\n`);
