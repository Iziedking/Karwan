// One-time code emails: sign-in, waitlist, wallet recovery and confirming a
// contact email. Kept out of the routes so the preview script renders exactly
// what is sent.
import { brandedEmailHtml, emailCode, emailHeading, emailNote, emailText } from './brand.js';

export type OtpPurpose = 'sign-in' | 'waitlist' | 'recovery';

/// HTML body for the OTP email. Uses the shared brand shell. Digits sit in a
/// monospace block with a calm letter-spacing, no manual &nbsp; padding,
/// which was making the code read like "1   2   3" instead of "123456".
export const OTP_COPY: Record<OtpPurpose, { word: string; line: string; kicker: string; title: string }> = {
  'sign-in': { word: 'sign-in', kicker: 'Sign in', title: 'Your Karwan sign-in code', line: 'Enter this code where you started signing in.' },
  waitlist: { word: 'waitlist', kicker: 'Waitlist', title: 'Your Karwan waitlist code', line: 'Enter this code to join the Karwan waitlist.' },
  recovery: { word: 'recovery', kicker: 'Wallet recovery', title: 'Your Karwan recovery code', line: 'Use this code to recover your wallet.' },
};

export function otpEmailHtml(code: string, purpose: OtpPurpose = 'sign-in'): string {
  const copy = OTP_COPY[purpose];
  return brandedEmailHtml({
    title: copy.title,
    preheader: `${copy.line} It expires in 10 minutes.`,
    inner:
      emailHeading({ kicker: copy.kicker, title: copy.title }) +
      emailCode(code) +
      emailText(copy.line) +
      emailNote('It expires in 10 minutes and stops working after five wrong tries. Karwan will never ask you for this code by phone or chat.'),
    footerNote: "Didn't ask for this code? Ignore this email. Nothing changes until the code is entered.",
  });
}

export function verifyEmailHtml(code: string): string {
  return brandedEmailHtml({
    title: 'Confirm your Karwan email',
    preheader: 'Enter this code in Karwan to confirm this email. It expires in 10 minutes.',
    inner:
      emailHeading({ kicker: 'Confirm email', title: 'Confirm your Karwan email' }) +
      emailCode(code) +
      emailText('Enter this code in Karwan to use this email for deal updates.') +
      emailNote('It expires in 10 minutes and stops working after five wrong tries.'),
    footerNote: "Didn't add this email to Karwan? Ignore this message. Nothing changes until the code is entered.",
  });
}

