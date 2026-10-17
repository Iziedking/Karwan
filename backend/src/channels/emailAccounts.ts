import { normalizeEmail } from '../auth/otpStore.js';
import { CHAT_TERMS_VERSION } from './identity.js';
import type { EmailAccounts, JoinKind } from './onboarding.js';
import type { ChatAccount } from './types.js';

/// The email is the account. A proven email from a chat joins the Karwan
/// account that email already has, or, after the terms, creates one with the
/// real email so the website signs the same person in to the same wallet.

interface UserRow {
  email: string;
  address: string;
  circleIdentityWalletId: string;
}

export interface EmailAccountDeps<A extends ChatAccount> {
  now: () => number;
  network: 'testnet' | 'mainnet';
  getUserByEmail: (email: string) => UserRow | null;
  getUserByAddress: (address: string) => UserRow | null;
  isInvited: (email: string) => Promise<boolean>;
  joinWaitlist: (email: string) => Promise<void>;
  /// The wallet reference the website uses for an email, so both make the same one.
  refHash: (email: string) => string;
  provisionIdentity: (refHash: string) => Promise<{ walletId: string; address: string }>;
  createUser: (u: UserRow) => void;
  changeUserEmail: (address: string, email: string) => void;
  isPlaceholder: (email: string) => boolean;
  /// Turns the agents on. Answers success for an account that already has them.
  activate: (address: string) => Promise<void>;
  /// Pairs the chat with the account for alerts.
  link: (address: string, account: A) => Promise<void>;
  /// The chat (by its hashed id) an account is already joined to, if any.
  chatOf: (address: string) => Promise<string | null>;
  /// The email has a website account that signs in with a passkey, which
  /// holds its own keys, so the chat cannot be that account.
  passkeyAccount: (email: string) => Promise<boolean>;
}

export function createEmailAccounts<A extends ChatAccount>(deps: EmailAccountDeps<A>): EmailAccounts<A> {
  async function joinOrCreate(rawEmail: string, account: A): Promise<{ kind: JoinKind; account: A }> {
    const email = normalizeEmail(rawEmail);
    const owner = deps.getUserByEmail(email);

    // A chat that already has its own Karwan wallet keeps it. It can only add
    // an email nobody else uses, never be moved onto another account.
    if (account.address) {
      const mine = deps.getUserByAddress(account.address);
      if (owner && owner.address.toLowerCase() === account.address.toLowerCase()) return { kind: 'joined', account };
      if (owner || !mine || !deps.isPlaceholder(mine.email)) return { kind: 'email_taken', account };
      deps.changeUserEmail(account.address, email);
      return { kind: 'joined', account };
    }

    if (owner) {
      const address = owner.address.toLowerCase();
      // One Telegram per account: a second chat is refused before anything moves.
      const other = await deps.chatOf(address);
      if (other && other !== account.numberHash) return { kind: 'other_chat', account };
      await deps.activate(address);
      const joined = { ...account, address, linkedWebAccount: true, termsVersion: 'web', termsAt: deps.now(), activated: true } as A;
      await deps.link(address, joined);
      return { kind: 'joined', account: joined };
    }

    if (await deps.passkeyAccount(email)) return { kind: 'passkey', account };
    if (deps.network === 'mainnet' && !(await deps.isInvited(email))) {
      await deps.joinWaitlist(email);
      return { kind: 'not_invited', account };
    }
    return { kind: 'new', account };
  }

  /// Nothing exists until the terms are accepted. The user row is written
  /// before activation, so a failed activation is retried on the same wallet
  /// and never makes a second one.
  async function create(rawEmail: string, account: A): Promise<A> {
    const email = normalizeEmail(rawEmail);
    let address = deps.getUserByEmail(email)?.address.toLowerCase() ?? null;
    if (!address) {
      const identity = await deps.provisionIdentity(deps.refHash(email));
      deps.createUser({ email, address: identity.address, circleIdentityWalletId: identity.walletId });
      address = identity.address.toLowerCase();
    }
    await deps.activate(address);
    const created = { ...account, address, termsVersion: CHAT_TERMS_VERSION, termsAt: deps.now(), activated: true } as A;
    await deps.link(address, created);
    return created;
  }

  return { joinOrCreate, create };
}
