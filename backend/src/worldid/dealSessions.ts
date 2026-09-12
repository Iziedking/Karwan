import type { DirectDeal } from '../db/deals.js';
import type { SqlExecutor } from '../db/migrations.js';
import { agreementDigest } from '../deals/agreementDigest.js';
import { createHighSignalVerification, requiresHighSignal, updateHighSignalParty, type VerificationRole } from '../deals/highSignalVerification.js';
import { createWorldIdRpSignature, type WorldIdEnvironment, type WorldIdVerifier } from './idkitProof.js';
import { parseSessionProof } from './sessionProof.js';

type Transaction = <T>(operation: (tx: SqlExecutor) => Promise<T>) => Promise<T>;
export type SessionRequest = ReturnType<typeof createWorldIdRpSignature> & {
  proofMode: 'session'; provider: 'world-id'; appId: string; rpId: string;
  environment: WorldIdEnvironment; sessionId?: string;
};
type Check = Record<string, unknown> & {
  request: SessionRequest; job_id: string; role: VerificationRole; wallet: string;
  agreement_digest: string; response_digest: string | null; completed_at: string | null;
};

export class WorldSessionError extends Error {
  constructor(readonly code: string, message: string, readonly status: 400 | 403 | 409 | 503 = 409) { super(message); }
}

export const worldAgreementKey = (deal: DirectDeal) => `${deal.agreementVersion ?? 1}:${agreementDigest(deal)}`;

function stateFor(deal: DirectDeal) {
  const subject = deal.verificationSubject ?? deal.highSignalVerification?.subject ?? 'seller';
  return deal.highSignalVerification ?? createHighSignalVerification(subject);
}

function assertParty(deal: DirectDeal | undefined, wallet: string, role: VerificationRole) {
  if (!deal || deal[role].toLowerCase() !== wallet) throw new WorldSessionError('forbidden', 'This check belongs to another account.', 403);
  if (deal.verificationPolicy !== 'high_signal' || !requiresHighSignal(stateFor(deal).subject, role)) {
    throw new WorldSessionError('HIGH_SIGNAL_NOT_REQUIRED', 'This deal does not require this check.');
  }
  return deal;
}

export function createWorldDealSessions(input: {
  transaction: Transaction; verifier: WorldIdVerifier; rpId: string; appId: string;
  environment: WorldIdEnvironment; signingKey: string; now?: () => number;
  sign?: () => ReturnType<typeof createWorldIdRpSignature>;
}) {
  const now = input.now ?? Date.now;
  const scope = [input.rpId, input.environment];
  const readDeal = async (tx: SqlExecutor, jobId: string) => {
    const rows = await tx.query<{ data: DirectDeal }>('SELECT data FROM direct_deals WHERE job_id = $1 FOR UPDATE', [jobId]);
    return rows.rows[0]?.data;
  };
  const readCheck = async (tx: SqlExecutor, nonce: string) => (await tx.query<Check>(
    'SELECT * FROM world_id_deal_checks_v1 WHERE rp_id = $1 AND environment = $2 AND nonce = $3', [...scope, nonce],
  )).rows[0];
  const assertContext = (check: Check | undefined, deal: DirectDeal, jobId: string, wallet: string, role: VerificationRole) => {
    if (!check || check.job_id !== jobId || check.wallet !== wallet || check.role !== role
      || check.agreement_digest !== worldAgreementKey(deal)) {
      throw new WorldSessionError('WORLD_ID_REQUEST_REQUIRED', 'The agreement or check changed. Start a fresh World ID check.');
    }
    return check;
  };
  return {
    async request(jobId: string, wallet: string, role: VerificationRole): Promise<SessionRequest> {
      jobId = jobId.toLowerCase(); wallet = wallet.toLowerCase();
      return input.transaction(async (tx) => {
        const deal = assertParty(await readDeal(tx, jobId), wallet, role);
        const digest = worldAgreementKey(deal);
        const session = (await tx.query<{ session_id: string }>(
          'SELECT session_id FROM world_id_sessions_v1 WHERE rp_id = $1 AND environment = $2 AND wallet = $3', [...scope, wallet],
        )).rows[0]?.session_id;
        const pending = (await tx.query<Check>(
          `SELECT * FROM world_id_deal_checks_v1 WHERE rp_id = $1 AND environment = $2
           AND job_id = $3 AND role = $4 AND wallet = $5 AND agreement_digest = $6
           AND expires_at > $7 AND completed_at IS NULL ORDER BY expires_at DESC LIMIT 1`,
          [...scope, jobId, role, wallet, digest, Math.floor(now() / 1000)],
        )).rows[0];
        if (pending && pending.request.sessionId === session) return pending.request;
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
          [...scope, signed.nonce, jobId, role, wallet, digest, signed.expires_at, JSON.stringify(request)],
        );
        return request;
      });
    },

    async verify(jobId: string, wallet: string, role: VerificationRole, result: Record<string, unknown>) {
      jobId = jobId.toLowerCase(); wallet = wallet.toLowerCase();
      if (typeof result.nonce !== 'string') throw new WorldSessionError('WORLD_ID_RESPONSE_INVALID', 'Start a fresh World ID check.', 400);
      const nonce = result.nonce;
      const check = await input.transaction(async (tx) => {
        const deal = assertParty(await readDeal(tx, jobId), wallet, role);
        return assertContext(await readCheck(tx, nonce), deal, jobId, wallet, role);
      });
      let proof: ReturnType<typeof parseSessionProof>;
      try {
        proof = parseSessionProof(result, {
          nonce: check.request.nonce, environment: input.environment,
          sessionId: check.request.sessionId, nowSeconds: Math.floor(Number(check.completed_at ?? now()) / 1000),
        });
      } catch {
        throw new WorldSessionError('WORLD_ID_RESPONSE_INVALID', 'This check could not be confirmed. Start a fresh World ID check.', 400);
      }
      if (!check.completed_at) {
        if (check.request.expires_at <= Math.floor(now() / 1000)) {
          throw new WorldSessionError('WORLD_ID_REQUEST_EXPIRED', 'This check expired. Start a fresh World ID check.');
        }
        // Forward the exact SDK payload. Never reinterpret a local parse as verification.
        // https://docs.world.org/world-id/idkit/integrate, core 4.2.4, 2026-09-12.
        let remote: Awaited<ReturnType<WorldIdVerifier['verify']>>;
        try { remote = await input.verifier.verify({ rpId: input.rpId, result }); }
        catch { throw new WorldSessionError('WORLD_ID_UNAVAILABLE', 'World ID is unavailable. Try again shortly.', 503); }
        if (!remote.ok) throw new WorldSessionError('WORLD_ID_PROOF_REJECTED', 'World ID could not confirm this check. Start a fresh check.', 403);
      }
      return input.transaction(async (tx) => {
        const deal = assertParty(await readDeal(tx, jobId), wallet, role);
        const current = assertContext(await readCheck(tx, nonce), deal, jobId, wallet, role);
        if (current.completed_at && current.response_digest !== proof.responseDigest) {
          throw new WorldSessionError('WORLD_ID_NULLIFIER_REPLAY', 'This check has already been used.');
        }
        if (!current.completed_at) {
          if (current.request.expires_at <= Math.floor(now() / 1000)) throw new WorldSessionError('WORLD_ID_REQUEST_EXPIRED', 'This check expired. Start a fresh check.');
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
            await tx.query(
              `UPDATE world_id_deal_checks_v1 SET replay_key = $4, response_digest = $5, completed_at = $6
               WHERE rp_id = $1 AND environment = $2 AND nonce = $3`,
              [...scope, nonce, proof.replayKey, proof.responseDigest, now()],
            );
          } catch (error) {
            if ((error as { code?: string }).code === '23505') throw new WorldSessionError('WORLD_ID_NULLIFIER_REPLAY', 'This proof has already been used. Start a fresh check.');
            throw error;
          }
        }
        const state = updateHighSignalParty(stateFor(deal), role, {
          status: 'verified', verifiedAt: Number(current.completed_at ?? now()),
          environment: input.environment, verificationLevel: 'selfie-session',
          nullifierDigest: proof.replayKey, agreementKey: current.agreement_digest, pendingNonce: undefined,
        });
        const updated = { ...deal, highSignalVerification: state, updatedAt: now() };
        await tx.query('UPDATE direct_deals SET data = $2::jsonb WHERE job_id = $1', [jobId, JSON.stringify(updated)]);
        return updated;
      });
    },
  };
}
