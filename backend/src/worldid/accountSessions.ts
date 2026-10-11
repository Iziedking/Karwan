import type { SqlExecutor } from '../db/migrations.js';
import { WorldSessionError, type SessionRequest } from './dealSessions.js';
import { createWorldIdRpSignature, type WorldIdEnvironment, type WorldIdVerifier } from './idkitProof.js';
import { parseSessionProof } from './sessionProof.js';

type Transaction = <T>(operation: (tx: SqlExecutor) => Promise<T>) => Promise<T>;

/// Why an account proves its World ID session. Enrolment saves the session;
/// every other purpose proves the saved one, so the same person is back.
export type AccountCheckPurpose = 'enrol' | 'add_address' | 'return' | 'unpause';

type Check = Record<string, unknown> & {
  wallet: string;
  purpose: AccountCheckPurpose;
  request: SessionRequest;
  response_digest: string | null;
  completed_at: string | null;
};

/// World ID 4.0 session proofs for one Karwan account, outside any deal. The
/// session is saved once, against the account, in the same table the deal
/// checks use, and replacing it is never self-service.
/// https://docs.world.org/world-id/idkit/session-proofs (read 2026-10-11).
export function createWorldAccountSessions(input: {
  transaction: Transaction;
  verifier: WorldIdVerifier;
  rpId: string;
  appId: string;
  environment: WorldIdEnvironment;
  signingKey: string;
  now?: () => number;
  sign?: () => ReturnType<typeof createWorldIdRpSignature>;
}) {
  const now = input.now ?? Date.now;
  const scope = [input.rpId, input.environment];

  const savedSession = async (tx: SqlExecutor, wallet: string) =>
    (
      await tx.query<{ session_id: string }>(
        'SELECT session_id FROM world_id_sessions_v1 WHERE rp_id = $1 AND environment = $2 AND wallet = $3',
        [...scope, wallet],
      )
    ).rows[0]?.session_id;

  const readCheck = async (tx: SqlExecutor, nonce: string) =>
    (
      await tx.query<Check>(
        'SELECT * FROM world_id_account_checks_v1 WHERE rp_id = $1 AND environment = $2 AND nonce = $3',
        [...scope, nonce],
      )
    ).rows[0];

  const assertOwn = (check: Check | undefined, wallet: string, purpose: AccountCheckPurpose) => {
    if (!check || check.wallet !== wallet || check.purpose !== purpose) {
      throw new WorldSessionError('WORLD_ID_REQUEST_REQUIRED', 'Start a fresh World ID check.');
    }
    return check;
  };

  return {
    async request(wallet: string, purpose: AccountCheckPurpose): Promise<SessionRequest> {
      wallet = wallet.toLowerCase();
      return input.transaction(async (tx) => {
        const session = await savedSession(tx, wallet);
        if (purpose === 'enrol' && session) {
          throw new WorldSessionError('WORLD_ID_SESSION_EXISTS', 'Your World ID is already linked to this account.');
        }
        if (purpose !== 'enrol' && !session) {
          throw new WorldSessionError('WORLD_ID_NO_SESSION', 'Link your World ID with the person check first.');
        }
        const pending = (
          await tx.query<Check>(
            `SELECT * FROM world_id_account_checks_v1 WHERE rp_id = $1 AND environment = $2
             AND wallet = $3 AND purpose = $4 AND expires_at > $5 AND completed_at IS NULL
             ORDER BY expires_at DESC LIMIT 1`,
            [...scope, wallet, purpose, Math.floor(now() / 1000)],
          )
        ).rows[0];
        if (pending && pending.request.sessionId === session) return pending.request;
        // Sessions omit the action in the RP signature (IDKit core 4.2.4).
        const signed = input.sign?.() ?? createWorldIdRpSignature({ signingKeyHex: input.signingKey });
        const request: SessionRequest = {
          ...signed,
          proofMode: 'session',
          provider: 'world-id',
          appId: input.appId,
          rpId: input.rpId,
          environment: input.environment,
          ...(session ? { sessionId: session } : {}),
        };
        await tx.query(
          `INSERT INTO world_id_account_checks_v1 (rp_id, environment, nonce, wallet, purpose, request, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
          [...scope, signed.nonce, wallet, purpose, JSON.stringify(request), signed.expires_at],
        );
        return request;
      });
    },

    async verify(wallet: string, purpose: AccountCheckPurpose, result: Record<string, unknown>): Promise<{ purpose: AccountCheckPurpose }> {
      wallet = wallet.toLowerCase();
      if (typeof result.nonce !== 'string') {
        throw new WorldSessionError('WORLD_ID_RESPONSE_INVALID', 'Start a fresh World ID check.', 400);
      }
      const nonce = result.nonce;
      const check = await input.transaction(async (tx) => assertOwn(await readCheck(tx, nonce), wallet, purpose));
      let proof: ReturnType<typeof parseSessionProof>;
      try {
        proof = parseSessionProof(result, {
          nonce: check.request.nonce,
          environment: input.environment,
          sessionId: check.request.sessionId,
          nowSeconds: Math.floor(Number(check.completed_at ?? now()) / 1000),
        });
      } catch {
        throw new WorldSessionError('WORLD_ID_RESPONSE_INVALID', 'This check could not be confirmed. Start a fresh World ID check.', 400);
      }

      if (!check.completed_at) {
        if (check.request.expires_at <= Math.floor(now() / 1000)) {
          throw new WorldSessionError('WORLD_ID_REQUEST_EXPIRED', 'This check expired. Start a fresh World ID check.');
        }
        // Forward the exact SDK payload; a local parse is never verification.
        let remote: Awaited<ReturnType<WorldIdVerifier['verify']>>;
        try {
          remote = await input.verifier.verify({ rpId: input.rpId, result });
        } catch {
          throw new WorldSessionError('WORLD_ID_UNAVAILABLE', 'World ID is unavailable. Try again shortly.', 503);
        }
        if (!remote.ok) {
          throw new WorldSessionError('WORLD_ID_PROOF_REJECTED', 'World ID could not confirm this check. Start a fresh check.', 403);
        }
      }

      return input.transaction(async (tx) => {
        const current = assertOwn(await readCheck(tx, nonce), wallet, purpose);
        if (current.completed_at) {
          if (current.response_digest !== proof.responseDigest) {
            throw new WorldSessionError('WORLD_ID_NULLIFIER_REPLAY', 'This check has already been used.');
          }
          return { purpose };
        }
        if (purpose === 'enrol') {
          // The unique constraints settle two first proofs at once, and keep one
          // person's session on one account.
          await tx.query(
            `INSERT INTO world_id_sessions_v1 (rp_id, environment, wallet, session_id, created_at)
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
            [...scope, wallet, proof.sessionId, now()],
          );
        }
        if ((await savedSession(tx, wallet)) !== proof.sessionId) {
          throw new WorldSessionError('WORLD_ID_SESSION_MISMATCH', 'Use the World ID linked to this account and start a fresh check.');
        }
        try {
          await tx.query(
            `UPDATE world_id_account_checks_v1 SET replay_key = $4, response_digest = $5, completed_at = $6
             WHERE rp_id = $1 AND environment = $2 AND nonce = $3`,
            [...scope, nonce, proof.replayKey, proof.responseDigest, now()],
          );
        } catch (error) {
          if ((error as { code?: string }).code === '23505') {
            throw new WorldSessionError('WORLD_ID_NULLIFIER_REPLAY', 'This proof has already been used. Start a fresh check.');
          }
          throw error;
        }
        return { purpose };
      });
    },
  };
}

export type WorldAccountSessions = ReturnType<typeof createWorldAccountSessions>;
