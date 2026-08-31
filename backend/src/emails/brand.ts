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
/// The shell deliberately mirrors the product rather than behaving like a
/// marketing poster: warm Karwan canvas, quiet paper card, one green signal,
/// and a compact left-aligned header that leaves the message in charge.
export function brandedEmailHtml({
  eyebrow,
  title,
  inner,
  footerNote = DEFAULT_FOOTER_NOTE,
}: BrandShellOptions): string {
  const logoBlock = LOGO_BUFFER
    ? `
              <tr>
                <td style="padding:28px 32px 12px 32px;">
                  <img src="cid:${LOGO_CID}" width="44" height="44" alt="Karwan"
                    style="display:block;border-radius:10px;border:1px solid #deded8;" />
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
  /* Lock Karwan's warm canvas + quiet paper card against auto-invert. */
  .k-canvas { background: #f4f4f1 !important; }
  .k-card { background: #fcfcfa !important; }
  .k-ink { color: #0a0a0b !important; }
  .k-sub { color: #343436 !important; }
  .k-muted { color: #747477 !important; }
  .k-lime { color: #afc95b !important; }
  /* Dark-mode fallback for clients that ignore color-scheme. Cream-on-ink
     keeps the brand legible instead of an inverted mess. */
  @media (prefers-color-scheme: dark) {
    .k-canvas { background: #0a0a0b !important; }
    .k-card { background: #111113 !important; }
    .k-ink, .k-sub { color: #f4f4f1 !important; }
    .k-muted { color: #a3a3a6 !important; }
    .k-divider { border-color: rgba(244,244,241,0.16) !important; }
  }
  @media only screen and (max-width: 620px) {
    .k-shell { padding: 16px 10px !important; }
    .k-header, .k-body, .k-footer { padding-left: 22px !important; padding-right: 22px !important; }
  }
</style>
</head>
<body class="k-canvas" style="margin:0;padding:0;background:#f4f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0a0b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="k-canvas k-shell" style="background:#f4f4f1;padding:28px 14px;">
    <tr>
      <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="k-card" style="max-width:600px;width:100%;background:#fcfcfa;border:1px solid #deded8;border-radius:14px;overflow:hidden;">
          ${logoBlock}
          <tr>
            <td class="k-header" style="padding:${LOGO_BUFFER ? '0' : '28px'} 32px 16px 32px;text-align:left;">
              <div class="k-ink" style="font-size:22px;font-weight:800;letter-spacing:0.035em;color:#0a0a0b;text-transform:uppercase;line-height:1;">KARWAN<span class="k-lime" style="color:#afc95b;">.</span></div>
              <div class="k-muted" style="margin-top:8px;font-size:10px;letter-spacing:0.18em;color:#747477;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;">${escapeHtml(eyebrow)}</div>
            </td>
          </tr>
          <tr>
            <td class="k-header" style="padding:0 32px 4px 32px;line-height:0;font-size:0;text-align:left;">
              <div style="display:inline-block;width:46px;height:3px;background:#afc95b;line-height:0;font-size:0;">&nbsp;</div>
            </td>
          </tr>

          ${inner}

          <tr>
            <td class="k-footer" style="padding:26px 32px 28px 32px;">
              <hr class="k-divider" style="border:none;border-top:1px solid #deded8;margin:0 0 16px 0;" />
              <p class="k-muted" style="margin:0;font-size:12px;line-height:1.55;color:#747477;">
                ${escapeHtml(footerNote)}
              </p>
              <p class="k-muted" style="margin:10px 0 0 0;font-size:12px;line-height:1.55;color:#747477;">
                Questions? Contact us at
                <a href="mailto:support@karwan.site" class="k-ink" style="color:#0a0a0b;text-decoration:underline;">support@karwan.site</a>.
              </p>
              <p class="k-muted" style="margin:14px 0 0 0;font-size:10px;letter-spacing:0.16em;color:#9a9a9d;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;">
                Karwan&nbsp;&middot;&nbsp;Trade settlement
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
