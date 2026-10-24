import { randomBytes } from 'node:crypto';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import type { SessionPayload } from '../auth/session.js';
import { actionDigest, actionText, type PresenceAction } from './action.js';
import { PIN_MAX_FAILURES, afterPinFailure, afterPinSuccess, normalizePin, pinGate, verifyPinHash } from './pin.js';
import type { PresenceChallenge, PresenceMethod, PresencePasskey, PresenceStore } from './store.js';

export type { PresenceMethod } from './store.js';

export const CHALLENGE_TTL_MS = 5 * 60_000;
/// How often asking for a confirmation also cleans out spent and expired ones.
const PURGE_EVERY_MS = 10 * 60_000;
export const CONFIRM_HEADER = 'x-karwan-confirm';
/// A chat's one-time page may set the first PIN or passkey this soon after it opened.
export const OPEN_LINK_ENROL_SECS = 10 * 60;

export interface ConfirmRequired {
  code: 'CONFIRM_REQUIRED';
  challengeId: string;
  action: PresenceAction;
  text: string;
  methods: PresenceMethod[];
  pinSet: boolean;
  pinLockedUntil: number | null;
  passkeys: number;
  /// How to set up a first PIN or passkey; null once one exists, and for wallets.
  enrol: 'email_code' | 'open_link' | 'add_email' | null;
}

export type ConfirmResult =
  | { ok: true; grant: string }
  | { ok: false; code: 'WRONG_PIN'; left: number }
  | { ok: false; code: 'PIN_LOCKED'; until: number }
  | { ok: false; code: 'NO_PIN' | 'CHALLENGE_EXPIRED' | 'CHALLENGE_NOT_YOURS' | 'PASSKEY_FAILED' | 'WALLET_SIGNATURE_FAILED' | 'METHOD_NOT_ALLOWED' };

export interface PresenceDeps {
  store: PresenceStore;
  now: () => number;
  chainId: number;
  rp: () => { rpID: string; origin: string[] };
  /// The account's sign-in passkeys, which also confirm.
  loginPasskeys: (wallet: string) => Promise<PresencePasskey[]>;
  bumpLoginPasskey: (credentialId: string, counter: number) => Promise<void>;
  verifyWalletSignature: (address: string, message: string, signature: `0x${string}`) => Promise<boolean>;
}

export type PresenceService = ReturnType<typeof createPresenceService>;

const newId = () => randomBytes(32).toString('base64url');

export function freshOpenLink(session: SessionPayload, nowMs: number): boolean {
  return session.via === 'open_link' && session.iat !== undefined && nowMs / 1000 - session.iat <= OPEN_LINK_ENROL_SECS;
}

export function createPresenceService(deps: PresenceDeps) {
  /// What a wallet signs: the action, and the challenge's own nonce, so one
  /// signature confirms one request and can never be replayed for another.
  const signedText = (action: PresenceAction, nonce: string) => `${actionText(action, deps.chainId)}\nNonce: ${nonce}`;

  const methodsFor = (session: SessionPayload): PresenceMethod[] => (session.method === 'web3' ? ['wallet'] : ['passkey', 'pin']);

  const allPasskeys = async (wallet: string) => {
    const [own, login] = await Promise.all([deps.store.passkeys(wallet), deps.loginPasskeys(wallet)]);
    return { own, login };
  };

  let purgedAt = 0;

  async function challengeFor(session: SessionPayload, action: PresenceAction): Promise<ConfirmRequired> {
    if (action.wallet !== session.address.toLowerCase()) throw new Error('confirmation asked for an account that is not the signed-in account');
    const now = deps.now();
    if (now - purgedAt >= PURGE_EVERY_MS) {
      purgedAt = now;
      await deps.store.purgeExpired(now).catch(() => 0);
    }
    const id = newId();
    const nonce = newId();
    await deps.store.createChallenge({
      id,
      wallet: action.wallet,
      digest: actionDigest(action, deps.chainId),
      action,
      webauthnChallenge: nonce,
      createdAt: now,
      expiresAt: now + CHALLENGE_TTL_MS,
      confirmedAt: null,
      method: null,
      usedAt: null,
    });
    const methods = methodsFor(session);
    const pin = methods.includes('pin') ? await deps.store.pin(action.wallet) : null;
    const { own, login } = methods.includes('passkey') ? await allPasskeys(action.wallet) : { own: [], login: [] };
    const passkeys = own.length + login.length;
    const lock = pin ? pinGate(pin, now) : { ok: true as const };
    const enrol =
      session.method === 'web3' || pin || passkeys > 0
        ? null
        : session.email
          ? 'email_code'
          : freshOpenLink(session, now)
            ? 'open_link'
            : 'add_email';
    return {
      code: 'CONFIRM_REQUIRED',
      challengeId: id,
      action,
      text: signedText(action, nonce),
      methods,
      pinSet: pin !== null,
      pinLockedUntil: lock.ok ? null : lock.until,
      passkeys,
      enrol,
    };
  }

  /// The challenge, if it is still open and belongs to this session's account.
  async function open(
    session: SessionPayload,
    challengeId: string,
    method: PresenceMethod,
  ): Promise<{ error: 'CHALLENGE_EXPIRED' | 'CHALLENGE_NOT_YOURS' | 'METHOD_NOT_ALLOWED' } | { row: PresenceChallenge }> {
    const row = await deps.store.challenge(challengeId);
    if (!row) return { error: 'CHALLENGE_EXPIRED' };
    if (row.wallet !== session.address.toLowerCase()) return { error: 'CHALLENGE_NOT_YOURS' };
    if (!methodsFor(session).includes(method)) return { error: 'METHOD_NOT_ALLOWED' };
    if (row.confirmedAt !== null || deps.now() > row.expiresAt) return { error: 'CHALLENGE_EXPIRED' };
    return { row };
  }

  async function grant(challengeId: string, method: PresenceMethod): Promise<ConfirmResult> {
    return (await deps.store.confirm(challengeId, method, deps.now()))
      ? { ok: true, grant: challengeId }
      : { ok: false, code: 'CHALLENGE_EXPIRED' };
  }

  async function confirmPin(session: SessionPayload, challengeId: string, raw: string): Promise<ConfirmResult> {
    const opened = await open(session, challengeId, 'pin');
    if ('error' in opened) return { ok: false, code: opened.error };
    const wallet = opened.row.wallet;
    return deps.store.withPinLock(wallet, async (): Promise<ConfirmResult> => {
      const state = await deps.store.pin(wallet);
      if (!state) return { ok: false, code: 'NO_PIN' };
      const now = deps.now();
      const gate = pinGate(state, now);
      if (!gate.ok) return { ok: false, code: 'PIN_LOCKED', until: gate.until };
      const pin = normalizePin(raw);
      if (pin && (await verifyPinHash(pin, state.hash))) {
        await deps.store.savePin(wallet, afterPinSuccess(state));
        return grant(challengeId, 'pin');
      }
      const next = afterPinFailure(state, now);
      await deps.store.savePin(wallet, next);
      const locked = pinGate(next, now);
      return locked.ok ? { ok: false, code: 'WRONG_PIN', left: PIN_MAX_FAILURES - next.failures } : { ok: false, code: 'PIN_LOCKED', until: locked.until };
    });
  }

  async function passkeyOptions(session: SessionPayload, challengeId: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const opened = await open(session, challengeId, 'passkey');
    if ('error' in opened) throw new Error(opened.error);
    const { own, login } = await allPasskeys(opened.row.wallet);
    return generateAuthenticationOptions({
      rpID: deps.rp().rpID,
      userVerification: 'required',
      challenge: Buffer.from(opened.row.webauthnChallenge, 'base64url'),
      allowCredentials: [...own, ...login].map((p) => ({ id: p.credentialId, transports: p.transports as AuthenticatorTransportFuture[] })),
    });
  }

  async function confirmPasskey(session: SessionPayload, challengeId: string, response: AuthenticationResponseJSON): Promise<ConfirmResult> {
    const opened = await open(session, challengeId, 'passkey');
    if ('error' in opened) return { ok: false, code: opened.error };
    const { own, login } = await allPasskeys(opened.row.wallet);
    const ownKey = own.find((p) => p.credentialId === response?.id);
    const key = ownKey ?? login.find((p) => p.credentialId === response?.id);
    if (!key) return { ok: false, code: 'PASSKEY_FAILED' };
    const { rpID, origin } = deps.rp();
    try {
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: opened.row.webauthnChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: { id: key.credentialId, publicKey: new Uint8Array(Buffer.from(key.publicKey, 'base64url')), counter: key.counter },
      });
      if (!verification.verified) return { ok: false, code: 'PASSKEY_FAILED' };
      const counter = verification.authenticationInfo.newCounter;
      await (ownKey ? deps.store.bumpPasskey(key.credentialId, counter) : deps.bumpLoginPasskey(key.credentialId, counter));
    } catch {
      return { ok: false, code: 'PASSKEY_FAILED' };
    }
    return grant(challengeId, 'passkey');
  }

  async function confirmWallet(session: SessionPayload, challengeId: string, signature: `0x${string}`): Promise<ConfirmResult> {
    const opened = await open(session, challengeId, 'wallet');
    if ('error' in opened) return { ok: false, code: opened.error };
    const message = signedText(opened.row.action, opened.row.webauthnChallenge);
    const valid = await deps.verifyWalletSignature(opened.row.wallet, message, signature).catch(() => false);
    return valid ? grant(challengeId, 'wallet') : { ok: false, code: 'WALLET_SIGNATURE_FAILED' };
  }

  /// The one check every channel calls before one of the confirmed actions.
  async function confirmPresence(input: {
    account: SessionPayload;
    action: PresenceAction;
    proof: string | null;
  }): Promise<{ ok: true } | { ok: false; required: ConfirmRequired }> {
    const { account, action, proof } = input;
    // A web3 account signs its own record setup in the browser; those signatures are its presence.
    if (action.kind === 'record_setup' && account.method === 'web3') return { ok: true };
    if (proof) {
      const spent = await deps.store.consume(proof, account.address, actionDigest(action, deps.chainId), deps.now());
      if (spent === 'ok') return { ok: true };
    }
    return { ok: false, required: await challengeFor(account, action) };
  }

  return { methodsFor, challengeFor, confirmPin, passkeyOptions, confirmPasskey, confirmWallet, confirmPresence };
}
