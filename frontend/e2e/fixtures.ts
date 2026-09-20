import type { Page } from '@playwright/test';
import type { DirectDeal } from '../core/api';

/// Fixed deal data for the browser tests. Typed as the real DirectDeal, so a
/// backend shape change breaks typecheck here instead of silently passing.
export const BUYER = '0x1111111111111111111111111111111111111111';
export const SELLER = '0x2222222222222222222222222222222222222222';
export const JOB = `0x${'ab'.repeat(32)}`;
const API = 'http://127.0.0.1:3199';

export const deliveredDeal: DirectDeal = {
  jobId: JOB,
  buyer: BUYER,
  seller: SELLER,
  dealAmountUsdc: '1200',
  firstReleasePct: 50,
  terms: 'Deliver the translated catalogue',
  delivered: true,
  deliveredAt: Date.UTC(2026, 8, 18),
  createdAt: Date.UTC(2026, 8, 10),
  updatedAt: Date.UTC(2026, 8, 18),
  sellerApprovedAt: Date.UTC(2026, 8, 11),
  acceptedAt: Date.UTC(2026, 8, 12),
  agreementVersion: 3,
  agreementDigest: '0xdigest',
  receiptReferences: ['KRW-2026-0918-AB12'],
  onChain: {
    state: 2,
    milestonePcts: [50, 50],
    milestonesReleased: 0,
    dealAmountWei: '1200000000',
    sellerNetWei: '1191000000',
    feeTotalWei: '18000000',
    releasedWei: '0',
  },
  view: {
    stage: 'awaiting-first-release',
    money: { line: 'held' },
    progress: [
      { step: 'agreed', state: 'done', at: Date.UTC(2026, 8, 11) },
      { step: 'funded', state: 'done', at: Date.UTC(2026, 8, 12) },
      { step: 'delivered', state: 'done', at: Date.UTC(2026, 8, 18) },
      { step: 'checked', state: 'current' },
      { step: 'released', state: 'upcoming' },
    ],
    next: { action: 'release', actor: 'you', amountUsdc: '600' },
    automatic: { kind: 'auto-release', at: Date.UTC(2026, 8, 25) },
  },
  counterpartyTrust: {
    role: 'seller',
    name: 'Amina Foods Ltd',
    verifiedBusiness: true,
    verifiedPerson: false,
    facts: { settled: 14, distinctCounterparties: 9, onTime: 13, withDeadline: 14, disputes: 0 },
    memberSince: Date.UTC(2026, 2, 1),
    stakeUsdc: null,
    provenAccounts: ['x'],
    isNew: false,
  },
};

/// Serves the deal page's backend calls from fixtures. Everything else answers
/// with an empty object so no request hangs the page.
export async function serveDeal(page: Page, deal: DirectDeal, viewer: string = BUYER) {
  // The coachmark tour is itself a dialog and would sit over the page, so the
  // deal page is measured without it. Tours have their own tests.
  await page.addInitScript(() => {
    try { localStorage.setItem('karwan:guide:disabled', '1'); } catch { /* private mode */ }
  });
  await page.route(`${API}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/auth/bootstrap') {
      // 'circle' (passkey) because a 'web3' session only counts while a wallet
      // is connected, and these tests drive no wallet.
      return route.fulfill({ json: { user: { address: viewer, method: 'circle', hasPasskey: true }, profile: null } });
    }
    if (path === `/api/deals/direct/${JOB}`) return route.fulfill({ json: { deal } });
    if (path === `/api/deals/direct/${JOB}/movements`) return route.fulfill({ json: { movements: [] } });
    if (path === `/api/chat/${JOB}`) {
      return route.fulfill({ json: { messages: [], writable: true, closedReason: null } });
    }
    if (path.startsWith('/api/client-errors')) return route.fulfill({ status: 204, body: '' });
    // Anything else the shell asks for: an empty list-shaped answer, so no
    // component maps over undefined and no request hangs the page.
    return route.fulfill({ json: { items: [], events: [], movements: [], messages: [] } });
  });
}
