/// Renders every Karwan email to docs/email-previews/ from the same builders
/// the senders use. Run from the repo root:
///
///   npx tsx backend/src/emails/preview.ts
///
/// Open the files in a browser, narrow the window to phone width, and switch
/// the OS to dark mode to check the dark theme. The same hosted brand mark
/// is used in previews and real mail. This script renders only; it sends nothing.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { otpEmailHtml, verifyEmailHtml } from './codeEmails.js';
import { dealInviteHtml } from './dealInvite.js';
import { dealUpdateHtml } from './dealUpdate.js';
import { dealCancelledHtml } from './dealCancelled.js';
import { contentFor, financierContentFor } from './dealNotifier.js';
import type { KarwanEvent } from '../events.js';
import { dealEventHtml } from './dealEventEmail.js';
import { waitlistJoinedEmail } from './waitlistJoined.js';
import { mainnetAccessEmail } from './mainnetAccess.js';
import { newsletterWelcomeHtml } from './newsletterWelcome.js';
import { recoveryEmail } from './recovery.js';
import { supportTranscriptHtml } from './supportTranscript.js';
import { teamPasswordResetPreviewHtml } from './teamPasswordReset.js';

const OUT_DIR = resolve(process.cwd(), process.env.KARWAN_EMAIL_PREVIEW_DIR || 'docs/email-previews');
mkdirSync(OUT_DIR, { recursive: true });

function write(name: string, html: string) {
  writeFileSync(resolve(OUT_DIR, `${name}.html`), html, 'utf8');
  console.log(`wrote docs/email-previews/${name}.html`);
}

const claimUrl = 'https://karwan.site/invite/4f9c2a8b3e7d1f0c9a2b4c6d8e0f1a3b5c7d9e1f';
const dealUrl = 'https://karwan.site/deals/0x46094ce6ea8b83421db3c59386cb2e52ea518cc7db1612799b93045a0382703a';

write('otp', otpEmailHtml('447301'));
write('confirm-email', verifyEmailHtml('582914'));
write('deal-invite', dealInviteHtml({
  to: 'ada@example.com', claimUrl, dealAmountUsdc: '1200', inviterMasked: '0xb19f…e97a', inviterName: 'Bola Ade · @bola_designs',
  what: 'Brand kit: logo, colours and a one-page guide',
  expiresLabel: 'Expires in 7 days', acceptanceLabel: '24 hours', deliveryLabel: '14 days',
}));
write('deal-invite-existing-account', dealInviteHtml({
  to: 'ada@example.com', claimUrl: dealUrl, dealAmountUsdc: '1200', inviterMasked: '0xb19f…e97a',
  expiresLabel: 'Expires in 7 days', acceptanceLabel: '24 hours', deliveryLabel: '14 days',
  signInWallet: '0x7a21…90cc', signInVia: 'login',
}));
write('deal-updated', dealUpdateHtml({
  to: 'ada@example.com', claimUrl, dealAmountUsdc: '1350', inviterMasked: '0xb19f…e97a',
  changedLabels: ['Amount', 'Delivery window'], acceptanceLabel: '24 hours', deliveryLabel: '21 days',
}));
write('deal-cancelled', dealCancelledHtml({
  to: 'ada@example.com', dealAmountUsdc: '1200', inviterMasked: '0xb19f…e97a', reason: 'We found a supplier closer to home.',
}));
const dealFacts: Array<[string, string]> = [['With', 'Bola Ade · @bola_designs'], ['For', 'Brand kit: logo, colours and a one-page guide']];
write('deal-event-funded', dealEventHtml({
  kicker: 'Deal funded', subject: 'Deal funded (1,200.00 USDC)', heading: 'Payment held in escrow', amount: '1200',
  body: 'The payment is held in escrow and the seller can start the work. Payment follows the agreed review and release rules, including any timed release.', ctaLabel: 'Open the deal', ctaUrl: dealUrl,
  facts: dealFacts,
}));
write('deal-event-dispute', dealEventHtml({
  kicker: 'Dispute', subject: 'A Karwan deal moved to dispute', heading: 'Deal moved to dispute', amount: '1200',
  body: 'The money stays held until the dispute is settled. Add your side on the deal page. Either of you can still agree to cancel for a full refund.', ctaLabel: 'Open the deal', ctaUrl: dealUrl,
  facts: dealFacts,
}));
write('waitlist-joined', waitlistJoinedEmail(42).html);
write('mainnet-access', mainnetAccessEmail().html);
write('newsletter-welcome', newsletterWelcomeHtml());
write('recovery-started', recoveryEmail('started', { releasableAt: Date.UTC(2026, 9, 2, 14, 0), cancelUrl: 'https://karwan.site/recovery/cancel?t=abc123' }).html);
write('recovery-completed', recoveryEmail('completed').html);
write('support-transcript', supportTranscriptHtml({
  id: 'T-4821', status: 'closed', createdAt: Date.UTC(2026, 8, 30, 9, 12),
  messages: [
    { role: 'user', text: 'My top-up says sending for a while. Did it fail?', ts: Date.UTC(2026, 8, 30, 9, 12) },
    { role: 'assistant', text: 'The payment is still awaiting confirmation. Check its status before trying again.', ts: Date.UTC(2026, 8, 30, 9, 12, 20) },
    { role: 'operator', text: 'Confirmed on our side. It landed at 09:14.\nYour balance is up to date now.', ts: Date.UTC(2026, 8, 30, 9, 15) },
  ],
} as Parameters<typeof supportTranscriptHtml>[0]));
write('team-password-reset', teamPasswordResetPreviewHtml({
  to: 'israel@karwan.site', name: 'Israel', expiresLabel: 'This link works for one hour',
  resetUrl: 'https://api.karwan.site/team/reset?token=reset_9b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d_Zx8YwVuTsRqPoNmLkJiH',
}));

// Team invitation. The long invite URL is the interesting part: it is one
// unbreakable string, which is what blows a fixed-width card open on a phone.
{
  const { teamInvitePreviewHtml } = await import('./teamInvite.js');
  write('team-invite', teamInvitePreviewHtml({
    to: 'israel@karwan.site', name: 'Israel', role: 'marketing', expiresLabel: 'This link works for 7 days',
    inviteUrl: 'https://api.karwan.site/team/invite?token=invite_583043c2-c080-46cd-8039-6f18d7f5b32d_8jsIN0yy7amuXRenZiYzoFQcbLa40p_A6xiVW7iw5Og',
  }));
}

// A newsletter issue. Same trap as the invite: the body is injected into the
// card's table, so anything that is not a <tr> gets hoisted out of the card.
{
  const { renderIssue } = await import('../newsletter/render.js');
  const rendered = renderIssue({
    id: 'preview',
    status: 'draft',
    subject: 'A clearer view of your trade record',
    preheader: 'Review your verification, completed deals and public ratings in one place.',
    sections: [
      {
        key: 'shipped',
        heading: 'What we shipped',
        body: '**Your trade record brings the available evidence together.** Review your verification status, deal history and ratings before sharing your record.\n\nSee what appears on your [trade record](https://karwan.site/credit-passport).',
        signalIds: [],
      },
      {
        key: 'ecosystem',
        heading: 'What moved on Arc and Circle',
        body: '- Compare available evidence before choosing a seller\n- Review delivery and payment rules before funding a deal',
        signalIds: [],
      },
    ],
    sources: [
      {
        signalId: 's1',
        title: 'Unified balance covers Solana',
        url: 'https://docs.arc.network/app-kit/unified-balance',
        source: 'Arc docs',
        publishedAt: Date.UTC(2026, 6, 24),
      },
    ],
    signalIds: [],
    from: 0,
    to: 1,
    monthInReview: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  writeFileSync(resolve(OUT_DIR, 'newsletter-issue.html'), rendered.html, 'utf8');
  console.log('wrote docs/email-previews/newsletter-issue.html');
}

// All lifecycle variants use the same content builder as actual notifications.
// Fictional fixtures only. No sender or provider is called.
const eventTypes = [
  "agent.suggestion",
  "offer.request-changed",
  "deal.review.ending",
  "record.setup_needed",
  "deal.extension.requested",
  "deal.dispute.statement",
  "deal.dispute.statement.due",
  "deal.matched",
  "deal.match.approved",
  "listing.matched",
  "request.shortlist",
  "request.world_check",
  "deal.direct.created",
  "deal.seller-approved",
  "deal.direct.declined",
  "deal.direct.edited",
  "offer.created",
  "deal.release.blocked",
  "deal.accepted",
  "deal.delivered",
  "escrow.settled",
  "deal.disputed",
  "deal.dispute.auto_resolved",
  "deal.cancel.proposed",
  "deal.fund.insufficient",
  "deal.deadline.soon",
  "deal.deadline.passed",
  "deal.extension.waiting",
  "deal.delivered.onchain",
  "deal.match.raised",
  "escrow.milestone.released",
  "escrow.refunded",
  "escrow.reclaimed",
  "deal.cancelled",
  "factoring.requested",
  "factoring.funding_needed",
  "factoring.offered",
  "factoring.accepted",
  "factoring.awaiting_financier",
  "factoring.settled",
  "factoring.defaulted",
  "po.funded",
  "po.released",
  "po.repaid",
  "po.defaulted",
  "reputation.tier-up",
  "rating.requested",
  "rating.reminder",
  "rating.revealed"
];
for (const type of eventTypes) for (const role of ['buyer','seller','self','financier'] as const) {
  const event = {type,jobId:'0x'+ 'ab'.repeat(32),actor:'platform',ts:0,payload:{
    buyer:'0x1111111111111111111111111111111111111111',seller:'0x2222222222222222222222222222222222222222',
    buyerUser:'0x1111111111111111111111111111111111111111',sellerUser:'0x2222222222222222222222222222222222222222',
    dealId:'0x'+'ab'.repeat(32),dealAmountUsdc:'120',agreedPriceUsdc:'120',askingPriceUsdc:'120',priceUsdc:'120',
    advance:'90',advanceUsdc:'90',shortfallUsdc:'10',faceValueUsdc:'120',repayUsdc:'95',principalUsdc:'90',
    withTag:'ada',toTier:'STRONG',notify:true,count:2,buyerConfirmed:true,waitingOn:'seller',side:role,
    deadline:Date.UTC(2030,0,20),endsAt:Date.UTC(2030,0,20),dueAt:Date.UTC(2030,0,20),refundAt:Date.UTC(2030,0,21),closesAtMs:Date.UTC(2030,0,20),
    title:'Packaging design for Ada Foods',detail:'off-request',reason:'Please allow time for review.',changedLabels:['Delivery date'],additionalSeconds:86400,discountBps:500,sellerBps:0,
  }} as unknown as KarwanEvent;
  const content=role==='financier' ? financierContentFor(event,'/financier/factoring/preview') : contentFor(event,role,'service');
  if(content) write('event-'+type.replaceAll('.','-')+'-'+role,dealEventHtml({...content, facts:[['With','Ada Foods · @ada'],['For','Packaging design']]}));
}
for (const purpose of ['sign-in','waitlist','recovery','confirm'] as const) write('code-'+purpose,otpEmailHtml('447301',purpose));
for (const kind of ['started','reminder','released','completed','cancelled'] as const) write('recovery-'+kind,recoveryEmail(kind,{releasableAt:Date.UTC(2030,0,20),cancelUrl:'https://karwan.site/recovery/cancel?t=preview'}).html);
