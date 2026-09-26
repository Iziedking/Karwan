/// The short sign-up: a tag, a verified email or a wallet, and an account kind.
/// Everything else (what they trade, budgets, agents) belongs to workspace
/// setup, so the profile starts from a neutral buyer default.

import type { UserProfile } from '../db/profiles.js';
import { checkKarwanTag } from './karwanTag.js';

export interface SignupInput {
  tag: string;
  accountKind: 'person' | 'business';
  network: 'testnet' | 'mainnet';
  hasProfile: boolean;
  tagAvailable: boolean;
  /// Mainnet only: the session's email is on the invite list.
  invited: boolean;
}

export type SignupRefusal = { status: 400 | 403 | 409; code: string };

export function signupRefusal(input: SignupInput): SignupRefusal | null {
  const check = checkKarwanTag(input.tag);
  if (!check.ok) return { status: 400, code: check.reason };
  if (input.hasProfile) return { status: 409, code: 'account_exists' };
  if (input.accountKind === 'business' && input.network === 'mainnet') {
    return { status: 403, code: 'business_unavailable' };
  }
  if (input.network === 'mainnet' && !input.invited) return { status: 403, code: 'not_invited' };
  if (!input.tagAvailable) return { status: 409, code: 'tag_taken' };
  return null;
}

export function newAccountProfile(
  address: string,
  tag: string,
  accountKind: 'person' | 'business',
): Omit<UserProfile, 'createdAt' | 'updatedAt'> {
  return {
    address: address.toLowerCase(),
    handle: tag,
    displayName: tag,
    accountKind,
    role: 'buyer',
    buyer: {
      maxBudgetUsdc: 1000,
      minDeadlineDays: 1,
      maxDeadlineDays: 30,
      bidCollectionSeconds: 45,
      milestonePcts: [100],
    },
  };
}
