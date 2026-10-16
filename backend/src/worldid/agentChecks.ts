import type { SqlExecutor } from '../db/migrations.js';
import { getHold, putHold } from '../db/agentWorldChecks.js';
import type { AgentWorldHold } from '../trust/agentWorldCheck.js';
import type { Role } from '../trust/riskEngine.js';
import { createWorldIdRpSignature, type WorldIdEnvironment, type WorldIdVerifier } from './idkitProof.js';
import { parseSessionProof } from './sessionProof.js';
import { WorldSessionError, type SessionRequest } from './dealSessions.js';

type Transaction = <T>(operation: (tx: SqlExecutor) => Promise<T>) => Promise<T>;
type Check = Record<string, unknown> & {
  request: SessionRequest; job_id: string; role: Role; wallet: string;
  agreement_digest: string; response_digest: string | null; completed_at: string | null;
};

/// Which side of the hold this account is, when it still has a check to do.
export function roleIn(hold: AgentWorldHold | null, wallet: string): Role | null {
  if (!hold) return null;
  const me = wallet.toLowerCase();
  if (hold.buyer && hold.buyerUser === me) return 'buyer';
  if (hold.seller && hold.sellerUser === me) return 'seller';
  return null;
}

/// The World ID session check on an agent deal: the same selfie session proof
/// as a direct deal, bound to the request, the chosen seller and the price.
/// A pass is written to the request's hold; the shared session binding keeps
/// one World ID to one account.
export function createWorldAgentChecks(input: {
  transaction: Transaction; verifier: WorldIdVerifier; rpId: string; appId: string;
  environment: WorldIdEnvironment; signingKey: string; now?: () => number;
  sign?: () => ReturnType<typeof createWorldIdRpSignature>;
}) {
  const now = input.now ?? Date.now;
  const scope = [input.rpId, input.environment];
  const party = async (tx: SqlExecutor, jobId: string, wallet: string) => {
    const hold = await getHold(jobId, tx);
    const role = roleIn(hold, wallet);
    if (!hold || !role) throw new WorldSessionError('forbidden', 'This check belongs to another account.', 403);
    if (hold[role] === 'verified') throw new WorldSessionError('WORLD_ID_ALREADY_DONE', 'This check is already done.');
    return { hold, role };
  };
  const readCheck = async (tx: SqlExecutor, nonce: string) => (await tx.query<Check>(
    'SELECT * FROM world_id_deal_checks_v1 WHERE rp_id = $1 AND environment = $2 AND nonce = $3', [...scope, nonce],
  )).rows[0];
  const assertContext = (check: Check | undefined, hold: AgentWorldHold, wallet: string, role: Role) => {
    if (!check || check.job_id !== hold.jobId || check.wallet !== wallet || check.role !== role || check.agreement_digest !== hold.key) {
      throw new WorldSessionError('WORLD_ID_REQUEST_REQUIRED', 'The offer or check changed. Start a fresh World ID check.');
    }
    return check;
  };

  return {
    async request(jobId: string, wallet: string): Promise<{ role: Role; request: SessionRequest }> {
      jobId = jobId.toLowerCase(); wallet = wallet.toLowerCase();
      return input.transaction(async (tx) => {
        const { hold, role } = await party(tx, jobId, wallet);
        const session = (await tx.query<{ session_id: string }>(
          'SELECT session_id FROM world_id_sessions_v1 WHERE rp_id = $1 AND environment = $2 AND wallet = $3', [...scope, wallet],
        )).rows[0]?.session_id;
        const pending = (await tx.query<Check>(
          `SELECT * FROM world_id_deal_checks_v1 WHERE rp_id = $1 AND environment = $2
           AND job_id = $3 AND role = $4 AND wallet = $5 AND agreement_digest = $6
           AND expires_at > $7 AND completed_at IS NULL ORDER BY expires_at DESC LIMIT 1`,
          [...scope, jobId, role, wallet, hold.key, Math.floor(now() / 1000)],
        )).rows[0];
        if (pending && pending.request.sessionId === session) return { role, request: pending.request };
        // Sessions omit the action in the RP signature (IDKit core 4.2.4).
        const signed = input.sign?.() ?? createWorldIdRpSignature({ signingKeyHex: input.signingKey });
        const request: SessionRequest = {
          ...signed, proofMode: 'session', provider: 'world-id', appId: input.appId,
          rpId: input.rpId, environment: input.environment, ...(session ? { sessionId: session } : {}),
        };
        await tx.query(
          `INSERT INTO world_id_deal_checks_v1
           (rp_id, environment, nonce, job_id, role, wallet, agreement_digest, expires_at, request)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
          [...scope, signed.nonce, jobId, role, wallet, hold.key, signed.expires_at, JSON.stringify(request)],
        );
        return { role, request };
      });
    },

    async verify(jobId: string, wallet: string, result: Record<string, unknown>): Promise<{ role: Role; hold: AgentWorldHold }> {
      jobId = jobId.toLowerCase(); wallet = wallet.toLowerCase();
      if (typeof result.nonce !== 'string') throw new WorldSessionError('WORLD_ID_RESPONSE_INVALID', 'Start a fresh World ID check.', 400);
      const nonce = result.nonce;
      const check = await input.transaction(async (tx) => {
        const { hold, role } = await party(tx, jobId, wallet);
        return assertContext(await readCheck(tx, nonce), hold, wallet, role);
      });
      let proof: ReturnType<typeof parseSessionProof>;
      try {
        proof = parseSessionProof(result, {
          nonce: check.request.nonce, environment: input.environment,
          sessionId: check.request.sessionId, nowSeconds: Math.floor(now() / 1000),
        });
      } catch {
        throw new WorldSessionError('WORLD_ID_RESPONSE_INVALID', 'This check could not be confirmed. Start a fresh World ID check.', 400);
      }
      if (check.completed_at) throw new WorldSessionError('WORLD_ID_NULLIFIER_REPLAY', 'This check has already been used.');
      if (check.request.expires_at <= Math.floor(now() / 1000)) {
        throw new WorldSessionError('WORLD_ID_REQUEST_EXPIRED', 'This check expired. Start a fresh World ID check.');
      }
      // Forward the exact SDK payload; a local parse is never a verification.
      let remote: Awaited<ReturnType<WorldIdVerifier['verify']>>;
      try { remote = await input.verifier.verify({ rpId: input.rpId, result }); }
      catch { throw new WorldSessionError('WORLD_ID_UNAVAILABLE', 'World ID is unavailable. Try again shortly.', 503); }
      if (!remote.ok) throw new WorldSessionError('WORLD_ID_PROOF_REJECTED', 'World ID could not confirm this check. Start a fresh check.', 403);
      return input.transaction(async (tx) => {
        const { hold, role } = await party(tx, jobId, wallet);
        assertContext(await readCheck(tx, nonce), hold, wallet, role);
        // Unique constraints also serialize two first-time proofs for one wallet.
        await tx.query(
          `INSERT INTO world_id_sessions_v1 (rp_id, environment, wallet, session_id, created_at)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, [...scope, wallet, proof.sessionId, now()],
        );
        const binding = (await tx.query<{ session_id: string }>(
          'SELECT session_id FROM world_id_sessions_v1 WHERE rp_id = $1 AND environment = $2 AND wallet = $3', [...scope, wallet],
        )).rows[0];
        if (binding?.session_id !== proof.sessionId) throw new WorldSessionError('WORLD_ID_SESSION_MISMATCH', 'Use the World ID linked to this account and start a fresh check.');
        try {
          const done = await tx.query(
            `UPDATE world_id_deal_checks_v1 SET replay_key = $4, response_digest = $5, completed_at = $6
             WHERE rp_id = $1 AND environment = $2 AND nonce = $3 AND completed_at IS NULL RETURNING nonce`,
            [...scope, nonce, proof.replayKey, proof.responseDigest, now()],
          );
          if (done.rows.length === 0) throw new WorldSessionError('WORLD_ID_NULLIFIER_REPLAY', 'This check has already been used.');
        } catch (error) {
          if ((error as { code?: string }).code === '23505') throw new WorldSessionError('WORLD_ID_NULLIFIER_REPLAY', 'This proof has already been used. Start a fresh check.');
          throw error;
        }
        const updated: AgentWorldHold = { ...hold, [role]: 'verified', updatedAt: now() };
        await putHold(updated, tx);
        return { role, hold: updated };
      });
    },
  };
}
