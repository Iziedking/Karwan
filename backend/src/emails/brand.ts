// Shared shell for Karwan transactional email. OTP, deal invites, and
// anything that ships next renders inside this so a palette change stays
// in one file.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadLogoBuffer(): Buffer | null {
  const candidates = [
    resolve(process.cwd(), 'docs/bot-assets/karwan-bot-pic.png'),
    resolve(process.cwd(), '../docs/bot-assets/karwan-bot-pic.png'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return readFileSync(p);
      } catch {
        // try next candidate
      }
    }
  }
  return null;
}

export const LOGO_BUFFER = loadLogoBuffer();
export const LOGO_CID = 'karwan-logo';

export interface BrandShellOptions {
  /// Small-caps eyebrow under the wordmark, e.g. "SIGN-IN CODE", "DEAL INVITE".
  eyebrow: string;
  /// Subject-line text used for the document title.
  title: string;
  /// Pre-formatted HTML rendered inside the card body.
  inner: string;
  /// Override the default "didn't request this" footer note.
  footerNote?: string;
}

const DEFAULT_FOOTER_NOTE =
  "Didn't request this? Ignore the email. No account changes happen until a code is entered.";

/// Wraps caller HTML in the Karwan email shell. Returns a full document.
///
/// Redesigned 2026-06-08: the logo now sits prominently in the body of the
/// white card (centered, 56px, on the cream-tinted ink surface) instead of
/// being buried in a thin dark header band where most clients shrank it.
/// The wordmark + eyebrow tag follow underneath, then the lime accent rule,
/// then the inner payload. Cleaner, more typical of modern transactional
/// email (Stripe, Linear, Resend's own samples), and gives the brand mark
/// the real estate it deserves.
export function brandedEmailHtml({
  eyebrow,
  title,
  inner,
  footerNote = DEFAULT_FOOTER_NOTE,
}: BrandShellOptions): string {
  const logoBlock = LOGO_BUFFER
    ? `
              <tr>
                <td align="center" style="padding:36px 28px 18px 28px;">
                  <img src="cid:${LOGO_CID}" width="56" height="56" alt="Karwan"
                    style="display:block;border-radius:12px;border:1px solid #e6e2d8;" />
                </td>
              </tr>`
    : '';
  // Gmail and Apple Mail auto-invert "light" emails under dark mode and kill
  // the brand colors. The color-scheme meta + !important fills below opt out
  // for clients that respect them; the @media dark fallback covers the rest.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light only; supported-color-schemes: light; }
  body, table, td, div, p, a, span { color-scheme: light only !important; }
  /* Lock the cream canvas + ink card against Gmail's auto-invert. */
  .k-canvas { background: #f3efe6 !important; }
  .k-card { background: #ffffff !important; }
  .k-ink { color: #0e0e0e !important; }
  .k-sub { color: #3a352c !important; }
  .k-muted { color: #8a8478 !important; }
  .k-lime { color: #afc95b !important; }
  /* Dark-mode fallback for clients that ignore color-scheme. Cream-on-ink
     keeps the brand legible instead of an inverted mess. */
  @media (prefers-color-scheme: dark) {
    .k-canvas { background: #1c1a16 !important; }
    .k-card { background: #1c1a16 !important; }
    .k-ink, .k-sub { color: #f3efe6 !important; }
    .k-muted { color: #b8b0a0 !important; }
    .k-divider { border-color: rgba(243,239,230,0.16) !important; }
  }
</style>
</head>
<body class="k-canvas" style="margin:0;padding:0;background:#f3efe6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0e0e0e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="k-canvas" style="background:#f3efe6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" class="k-card" style="max-width:520px;width:100%;background:#ffffff;border:1px solid #e6e2d8;border-radius:18px 18px 18px 5px;overflow:hidden;">
          ${logoBlock}
          <!-- Wordmark + eyebrow centered in the body, above the lime rule.
               The brand reads from the body of the email, not from a header
               strip clients tend to shrink or strip out. -->
          <tr>
            <td align="center" style="padding:${LOGO_BUFFER ? '0' : '36px'} 28px 18px 28px;">
              <div class="k-ink" style="font-size:24px;font-weight:800;letter-spacing:0.02em;color:#0e0e0e;text-transform:uppercase;line-height:1;">Karwan<span class="k-lime" style="color:#afc95b;">.</span></div>
              <div class="k-muted" style="margin-top:8px;font-size:10px;letter-spacing:0.20em;color:#8a8478;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;">${escapeHtml(eyebrow)}</div>
            </td>
          </tr>
          <!-- Lime accent rule. Slim, centred, the signature brand cue. -->
          <tr>
            <td align="center" style="padding:4px 28px 8px 28px;line-height:0;font-size:0;">
              <div style="display:inline-block;width:48px;height:3px;background:#afc95b;line-height:0;font-size:0;">&nbsp;</div>
            </td>
          </tr>

          ${inner}

          <tr>
            <td style="padding:28px 28px 26px 28px;">
              <hr class="k-divider" style="border:none;border-top:1px solid #e6e2d8;margin:0 0 16px 0;" />
              <p class="k-muted" style="margin:0;font-size:12px;line-height:1.5;color:#8a8478;">
                ${escapeHtml(footerNote)}
              </p>
              <p class="k-muted" style="margin:10px 0 0 0;font-size:12px;line-height:1.5;color:#8a8478;">
                Questions? Contact us at
                <a href="mailto:support@karwan.site" style="color:#0e0e0e;text-decoration:underline;">support@karwan.site</a>.
              </p>
              <p class="k-muted" style="margin:14px 0 0 0;font-size:10px;letter-spacing:0.18em;color:#b8b0a0;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;">
                Karwan&nbsp;&middot;&nbsp;Agentic settlement on Arc
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export { escapeHtml };
