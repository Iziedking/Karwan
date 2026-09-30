/// Renders every Karwan email to docs/email-previews/ from the same builders
/// the senders use. Run from the repo root:
///
///   npx tsx backend/src/emails/preview.ts
///
/// Open the files in a browser, narrow the window to phone width, and switch
/// the OS to dark mode to check the dark theme. The logo is a CID attachment
/// in real mail, so previews show a dark square in its place.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { otpEmailHtml, verifyEmailHtml } from './codeEmails.js';
import { dealInviteHtml } from './dealInvite.js';
import { dealUpdateHtml } from './dealUpdate.js';
import { dealCancelledHtml } from './dealCancelled.js';
import { dealEventHtml } from './dealEventEmail.js';
import { waitlistJoinedEmail } from './waitlistJoined.js';
import { mainnetAccessEmail } from './mainnetAccess.js';
import { newsletterWelcomeHtml } from './newsletterWelcome.js';
import { recoveryEmail } from './recovery.js';
import { supportTranscriptHtml } from './supportTranscript.js';
import { teamPasswordResetPreviewHtml } from './teamPasswordReset.js';

const OUT_DIR = resolve(process.cwd(), 'docs/email-previews');
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
  to: 'ada@example.com', claimUrl, dealAmountUsdc: '1200', inviterMasked: '0xb19f…e97a',
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
write('deal-event-funded', dealEventHtml({
  kicker: 'Escrow funded', subject: 'Escrow funded (1200 USDC)', heading: 'Escrow is funded', amount: '1200',
  body: 'The escrow is funded and the seller can start the work.', ctaLabel: 'Open the deal', ctaUrl: dealUrl,
}));
write('deal-event-dispute', dealEventHtml({
  kicker: 'Dispute', subject: 'A Karwan deal moved to dispute', heading: 'Deal moved to dispute',
  body: 'This deal is now in dispute. Either party can still propose a mutual cancel for a full refund.', ctaLabel: 'Open the deal', ctaUrl: dealUrl,
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
    { role: 'assistant', text: 'It has not failed. The network is still confirming it, and nothing is lost.', ts: Date.UTC(2026, 8, 30, 9, 12, 20) },
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
    subject: 'A PO financier reclaimed the principal while the advance stayed locked',
    preheader: 'We fixed the defect. Collateral now grades by reputation. Factoring is opt-in.',
    sections: [
      {
        key: 'shipped',
        heading: 'What we shipped',
        body: '**The old PO rail held a fatal design flaw.** At fund time the financier owned the deal\u2019s receivable, while the supplier\u2019s advance sat in contract custody, released only when proof of delivery hit the registry.\n\nHow much collateral a supplier posts now comes from their [reputation tier](https://karwan.site/credit-passport), not the financier guessing.',
        signalIds: [],
      },
      {
        key: 'ecosystem',
        heading: 'What moved on Arc and Circle',
        body: '- Gateway now covers Solana, which widens the pool we already route through\n- A second item, to check list rendering inside the card',
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
