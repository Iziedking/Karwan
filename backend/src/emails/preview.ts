/// One-shot preview renderer for the transactional email shell. Run via:
///
///   npx tsx backend/src/emails/preview.ts
///
/// Writes `docs/email-previews/otp.html` and `docs/email-previews/deal-invite.html`
/// using the same brand.ts shell as production. Open in a browser to verify
/// the cream + ink + lime palette in light mode, then toggle the OS to dark
/// mode and refresh to see the cream-on-ink fallback survive.
///
/// The CID logo reference (`cid:karwan-logo`) does NOT resolve in browsers —
/// Resend swaps it in via the attachments array. The preview just shows the
/// wordmark; that's fine for verifying brand handling.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { brandedEmailHtml, escapeHtml } from './brand.js';

const OUT_DIR = resolve(process.cwd(), 'docs/email-previews');
mkdirSync(OUT_DIR, { recursive: true });

const otpInner = (() => {
  const code = '447301';
  return `
          <tr>
            <td style="padding:36px 28px 12px 28px;text-align:center;">
              <div style="font-size:12px;letter-spacing:0.18em;color:#8a8478;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;margin-bottom:14px;">Your code</div>
              <div style="display:inline-block;padding:18px 28px;background:#f6f3ea;border:1px solid #e6e2d8;border-radius:14px 14px 14px 4px;">
                <div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;font-size:36px;font-weight:800;letter-spacing:0.32em;color:#0e0e0e;line-height:1;padding-right:0.32em;">${code}</div>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 28px 8px 28px;text-align:center;">
              <p style="margin:0;font-size:14px;line-height:1.55;color:#3a352c;">
                Enter this code in the sign-in modal to access your Karwan account.
              </p>
              <p style="margin:10px 0 0 0;font-size:13px;line-height:1.55;color:#7a7466;">
                Expires in 10 minutes. Five wrong tries voids it.
              </p>
            </td>
          </tr>
  `;
})();

const otpHtml = brandedEmailHtml({
  eyebrow: 'SIGN-IN CODE',
  title: 'Karwan sign-in code',
  inner: otpInner,
});
const otpPath = resolve(OUT_DIR, 'otp.html');
writeFileSync(otpPath, otpHtml, 'utf8');

const inviteInner = (() => {
  const inviterMasked = '0xb19f…e97a';
  const claimUrl = 'https://karwan.site/invite/4f9c2a8b3e7d1f0c';
  const dealAmountUsdc = '5';
  const expiresLabel = 'Expires in 7 days';
  return `
          <tr>
            <td style="padding:36px 28px 8px 28px;text-align:center;">
              <div style="font-size:12px;letter-spacing:0.18em;color:#8a8478;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;margin-bottom:14px;">Deal invite</div>
              <p style="margin:0 0 22px 0;font-size:15px;line-height:1.55;color:#3a352c;">
                <strong style="color:#0e0e0e;">${escapeHtml(inviterMasked)}</strong>
                opened a Karwan deal with you for
                <strong style="color:#0e0e0e;">${escapeHtml(dealAmountUsdc)} USDC</strong>.
              </p>
              <a href="${escapeHtml(claimUrl)}" style="display:inline-block;padding:14px 28px;background:#0e0e0e;color:#ffffff;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:13px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;text-decoration:none;border-radius:12px 12px 12px 4px;">Review and claim</a>
              <p style="margin:18px 0 0 0;font-size:13px;line-height:1.55;color:#7a7466;">
                ${escapeHtml(expiresLabel)}. Funds are not moved until you accept.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 12px 28px;">
              <div style="margin-top:10px;padding:14px 16px;background:#f6f3ea;border:1px solid #e6e2d8;border-radius:10px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:11px;line-height:1.5;word-break:break-all;color:#3a352c;">
                ${escapeHtml(claimUrl)}
              </div>
            </td>
          </tr>
  `;
})();

const inviteHtml = brandedEmailHtml({
  eyebrow: 'DEAL INVITE',
  title: 'You have a Karwan deal to review',
  inner: inviteInner,
  footerNote:
    "If you weren't expecting this invite, ignore the email. The link binds nothing until you sign in and accept.",
});
const invitePath = resolve(OUT_DIR, 'deal-invite.html');
writeFileSync(invitePath, inviteHtml, 'utf8');

console.log('Wrote previews:');
console.log(`  ${otpPath}`);
console.log(`  ${invitePath}`);
console.log('');
console.log('Open in a browser. Toggle OS dark mode + refresh to see the dark fallback.');
