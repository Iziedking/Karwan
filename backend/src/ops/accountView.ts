import type { UserProfile } from '../db/profiles.js';
import type { MoneyMovement } from '../money/model.js';
import type { CaseKind, CaseState } from '../support/caseRules.js';
import type { DeskDealRow } from './deskDeals.js';
import { deskMoveRow, type DeskMoveRow } from './deskMoves.js';

/// Accounts on the desk (view 79). Both shapes are named allowlists: never an
/// email address, tax id, wallet or provider id, summary or case subject.

export type AccountStatus = 'money_stuck' | 'active' | 'setting_up' | 'paused';

type ProfileFacts = Pick<UserProfile, 'address' | 'displayName' | 'handle' | 'createdAt' | 'emailVerified' | 'xUserId' | 'location' | 'settings' | 'accountType' | 'business'>;

export interface AccountFacts {
  now: number;
  profile: ProfileFacts;
  signIn: 'email' | 'wallet';
  telegramLinked: boolean;
  /// Null when the chain could not be read; never shown as zero.
  balance: { totalUsdc: number; agentsUsdc: number } | null;
  deals: DeskDealRow[];
  moves: MoneyMovement[];
  cases: Array<{ ref: string; kind: CaseKind; state: CaseState; updatedAt: number; subject?: string }>;
  paused: { at: number; by: string } | null;
  handleOf: (address: string) => string | null;
}

export interface AccountView {
  address: string;
  name: string;
  handle: string | null;
  country: string | null;
  joinedAt: number;
  signIn: 'email' | 'wallet';
  telegramLinked: boolean;
  status: AccountStatus;
  accountType: 'person' | 'business';
  /// How far a business check went: none, submitted, verified or rejected.
  business: string;
  money: { balanceUsdc: string | null; heldUsdc: string; agentsUsdc: string | null; stuckUsdc: string; currency: string | null };
  record: { dealsDone: number; onTime: number; disputes: number; checked: string[]; agent: string | null };
  moves: DeskMoveRow[];
  deals: Array<{ jobId: string; title: string; with: string; amountUsdc: string; stage: string; side: 'buyer' | 'seller' }>;
  cases: Array<{ ref: string; kind: CaseKind; state: CaseState; lastAt: number }>;
  paused: { at: number; by: string } | null;
}

export interface AccountRow {
  address: string;
  name: string;
  handle: string | null;
  joinedAt: number;
  country: string | null;
  deals: number;
  disputes: number;
  status: AccountStatus;
}

const HELD = new Set(['accepted', 'delivered', 'disputed']);
const micros = (usdc: string | number) => Math.round(Number(usdc) * 1_000_000);
const usdcOf = (m: number) => String(m / 1_000_000);
const plain = (n: number) => usdcOf(micros(n));
const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

function statusOf(paused: boolean, stuck: boolean, setUp: boolean): AccountStatus {
  if (paused) return 'paused';
  if (stuck) return 'money_stuck';
  return setUp ? 'active' : 'setting_up';
}

export function accountRow(f: { profile: ProfileFacts; deals: number; disputes: number; stuck: boolean; pausedAt: number | null }): AccountRow {
  return {
    address: f.profile.address,
    name: f.profile.displayName,
    handle: f.profile.handle ?? null,
    joinedAt: f.profile.createdAt,
    country: f.profile.location?.country ?? null,
    deals: f.deals,
    disputes: f.disputes,
    status: statusOf(f.pausedAt !== null, f.stuck, f.profile.settings?.setupDoneAt !== undefined),
  };
}

export function accountView(f: AccountFacts): AccountView {
  const me = f.profile.address.toLowerCase();
  const moves = f.moves
    .map((m) => deskMoveRow(m, f.now, f.handleOf))
    .sort((a, b) => Number(b.status === 'stuck') - Number(a.status === 'stuck') || b.since - a.since);
  const stuck = moves.filter((m) => m.status === 'stuck').reduce((sum, m) => sum + micros(m.amountUsdc), 0);
  const held = f.deals.filter((d) => d.buyer.toLowerCase() === me && HELD.has(d.stage)).reduce((sum, d) => sum + micros(d.amountUsdc), 0);
  const done = f.deals.filter((d) => d.stage === 'settled');
  const onTime = done.filter((d) => !d.deadlineUnix || (d.deliveredAt ?? 0) <= d.deadlineUnix * 1000).length;
  const checked = [...(f.profile.emailVerified ? ['Email'] : []), ...(f.profile.xUserId ? ['X'] : [])];
  return {
    address: f.profile.address,
    name: f.profile.displayName,
    handle: f.profile.handle ?? null,
    country: f.profile.location?.country ?? null,
    joinedAt: f.profile.createdAt,
    signIn: f.signIn,
    telegramLinked: f.telegramLinked,
    status: statusOf(f.paused !== null, stuck > 0, f.profile.settings?.setupDoneAt !== undefined),
    accountType: f.profile.accountType ?? 'person',
    business: f.profile.business?.status ?? 'none',
    money: {
      balanceUsdc: f.balance ? plain(f.balance.totalUsdc) : null,
      heldUsdc: usdcOf(held),
      agentsUsdc: f.balance ? plain(f.balance.agentsUsdc) : null,
      stuckUsdc: usdcOf(stuck),
      currency: f.profile.settings?.displayCurrency ?? null,
    },
    record: { dealsDone: done.length, onTime, disputes: f.deals.filter((d) => d.disputed).length, checked, agent: null },
    moves,
    deals: f.deals.map((d) => {
      const buyer = d.buyer.toLowerCase() === me;
      const tag = buyer ? d.sellerTag : d.buyerTag;
      return { jobId: d.jobId, title: d.title, with: tag ? `@${tag}` : short(buyer ? d.seller : d.buyer), amountUsdc: d.amountUsdc, stage: d.stage, side: buyer ? 'buyer' : 'seller' };
    }),
    cases: f.cases.map((c) => ({ ref: c.ref, kind: c.kind, state: c.state, lastAt: c.updatedAt })),
    paused: f.paused,
  };
}
