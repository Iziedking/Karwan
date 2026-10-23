import { createEmailCodes, type PendingEmailCode } from '../auth/otpStore.js';
import { readSession } from '../auth/session.js';
import { webauthnRp } from '../auth/webauthnRp.js';
import { ARC, publicClient } from '../chain/client.js';
import { config } from '../config.js';
import { pgEnabled, withPostgresTransaction } from '../db/client.js';
import { durableEphemeralMap } from '../db/ephemeral.js';
import { bumpCounter, getUserByAddress, hasRealPasskey } from '../db/users.js';
import { logger } from '../logger.js';
import type { ConfirmRouteDeps } from '../routes/confirm.js';
import { createRequirePresence } from './check.js';
import { createPresenceService } from './service.js';
import { createMemoryPresenceStore, createPostgresPresenceStore, type PresencePasskey } from './store.js';

export const presenceStore = pgEnabled ? createPostgresPresenceStore(withPostgresTransaction) : createMemoryPresenceStore();

function loginPasskeys(wallet: string): PresencePasskey[] {
  const user = getUserByAddress(wallet);
  if (!user || !hasRealPasskey(user)) return [];
  return user.credentials
    .filter((c) => !!c.publicKey)
    .map((c) => ({
      credentialId: c.credentialId,
      wallet: wallet.toLowerCase(),
      publicKey: c.publicKey,
      counter: c.counter,
      transports: c.transports ?? [],
      createdAt: c.createdAt,
    }));
}

export const presenceService = createPresenceService({
  store: presenceStore,
  now: Date.now,
  chainId: ARC.chainId,
  rp: () => {
    const { id, origin } = webauthnRp();
    return { rpID: id, origin };
  },
  loginPasskeys: async (wallet) => loginPasskeys(wallet),
  bumpLoginPasskey: async (credentialId, counter) => bumpCounter(credentialId, counter),
  // Covers plain wallets and smart accounts (ERC-1271), as sign-in does.
  verifyWalletSignature: (address, message, signature) =>
    publicClient.verifyMessage({ address: address as `0x${string}`, message, signature }),
});

export const requirePresence = createRequirePresence(presenceService);

/// Email codes that set or reset a PIN or passkey, kept apart from sign-in codes.
const confirmEmailCodes = createEmailCodes({
  store: durableEphemeralMap<PendingEmailCode>('otp-confirm'),
  secret: () => config.SESSION_SECRET ?? 'karwan-development-otp-secret-not-for-production',
  send: async (email, code) => {
    try {
      const { sendOtpEmail } = await import('../routes/auth.js');
      return await sendOtpEmail(email, code, 'confirm');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'confirmation code send failed');
      return { delivered: false };
    }
  },
  devCodes: () => process.env.NODE_ENV !== 'production',
});

export const confirmRouteDeps: ConfirmRouteDeps = {
  service: presenceService,
  store: presenceStore,
  now: Date.now,
  session: readSession,
  rp: () => {
    const { id, name, origin } = webauthnRp();
    return { rpID: id, rpName: name, origin };
  },
  loginPasskeys: async (wallet) => loginPasskeys(wallet),
  emailCodes: confirmEmailCodes,
  limit: { windowMs: 10 * 60_000, max: 30 },
};
