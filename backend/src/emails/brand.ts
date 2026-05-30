/// Shared brand chrome for every Karwan transactional email. Auth OTP, deal
/// invites, and anything that ships next pulls from here so a future palette
/// change is one file. Light cream + ink black, mono accent — no lime in
/// email surfaces (lime is the in-product attention color; mail clients render
/// it badly on dark headers).
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
  /// Small caps eyebrow line under the wordmark, e.g. "SIGN-IN CODE" or
  /// "DEAL INVITE". Kept short — 1-3 words reads cleanest in mail clients.
  eyebrow: string;
  /// Subject-line text, for the <title> tag.
  title: string;
  /// Body of the email — already-formatted HTML rendered inside the cream card.
  inner: string;
  /// Optional footer note above the wordmark strip. Defaults to the standard
  /// "didn't request this" line for auth-style flows; pass a custom string for
  /// deal-related mail.
  footerNote?: string;
}

const DEFAULT_FOOTER_NOTE =
  "Didn't request this? Ignore the email. No account changes happen until a code is entered.";

/// Wraps caller-provided inner HTML in the Karwan email shell: dark header
/// band with brand mark + eyebrow, cream card body, footer hr + wordmark.
/// Returns a full <!doctype html> document ready to hand to Resend.
export function brandedEmailHtml({
  eyebrow,
  title,
  inner,
  footerNote = DEFAULT_FOOTER_NOTE,
}: BrandShellOptions): string {
  const logoCell = LOGO_BUFFER
    ? `<img src="cid:${LOGO_CID}" width="36" height="36" alt="Karwan" style="display:block;border-radius:6px;" />`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3efe6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0e0e0e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3efe6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;background:#ffffff;border:1px solid #e6e2d8;border-radius:18px 18px 18px 5px;overflow:hidden;">
          <tr>
            <td style="background:#0e0e0e;padding:24px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  ${
                    LOGO_BUFFER
                      ? `<td style="vertical-align:middle;padding-right:12px;">${logoCell}</td>`
                      : ''
                  }
                  <td style="vertical-align:middle;">
                    <div style="font-size:18px;font-weight:800;letter-spacing:0.04em;color:#ffffff;text-transform:uppercase;line-height:1;">Karwan</div>
                    <div style="margin-top:4px;font-size:10px;letter-spacing:0.18em;color:rgba(255,255,255,0.55);text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;">${escapeHtml(eyebrow)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${inner}

          <tr>
            <td style="padding:24px 28px 24px 28px;">
              <hr style="border:none;border-top:1px solid #e6e2d8;margin:0 0 16px 0;" />
              <p style="margin:0;font-size:12px;line-height:1.5;color:#8a8478;">
                ${escapeHtml(footerNote)}
              </p>
              <p style="margin:14px 0 0 0;font-size:10px;letter-spacing:0.18em;color:#b8b0a0;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;">
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
