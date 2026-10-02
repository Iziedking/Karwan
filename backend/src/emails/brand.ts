// Shared shell and building blocks for Karwan email. Every email is the shell
// plus a stack of blocks, so the look lives in this one file.
//
// The rules are the product's: sentence case, the amount is the loudest line,
// one lime action, hairlines instead of boxes, plain words, no addresses in the
// body. Markup is table-based with inline styles so Gmail, Outlook and Apple
// Mail render it the same; the classes only carry the dark theme.

/// The mark now loads from the website (see MARK_URL), so no email carries an
/// inline attachment. Kept null so the senders' attachment branch stays off.
export const LOGO_BUFFER: Buffer | null = null;
export const LOGO_CID = 'karwan-logo';

const C = {
  canvas: '#f4f4f1',
  card: '#ffffff',
  ink: '#0a0a0b',
  sub: '#45454a',
  muted: '#6e6e73',
  line: '#e4e4de',
  tint: '#f4f4f1',
  accent: '#afc95b',
  accentInk: '#0a0a0b',
  warning: '#8a5a00',
} as const;

const SITE = (process.env.FRONTEND_BASE_URL?.trim() || 'https://karwan.site').replace(/\/$/, '');
const MARK_URL = `${SITE}/brand/karwan-mark-lime.png`;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const PAD = '28px';

export interface BrandShellOptions {
  /// Document title, usually the subject.
  title: string;
  /// Blocks from this file, in order.
  inner: string;
  /// One or two sentences on why this email arrived and what to do if it is
  /// unexpected.
  footerNote?: string;
  /// Hidden inbox preview line. Defaults to nothing, which lets clients show
  /// the first line of the body.
  preheader?: string;
}

const DEFAULT_FOOTER_NOTE = "Didn't expect this email? You can ignore it. Nothing changes on your account.";

export function brandedEmailHtml({ title, inner, footerNote = DEFAULT_FOOTER_NOTE, preheader }: BrandShellOptions): string {
  // Loaded from the website: every client can fetch it, and it does not depend
  // on a file being present on the server that sends the mail.
  const mark = `<img src="${MARK_URL}" width="28" height="28" alt="Karwan" style="display:block;border:0;border-radius:8px;" />`;
  const hidden = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  a { color: ${C.ink}; }
  @media (prefers-color-scheme: dark) {
    .k-canvas { background: #0b0f14 !important; }
    .k-card { background: #131a22 !important; border-color: #26303b !important; }
    .k-ink { color: #f4f4f1 !important; }
    .k-sub { color: #c4c7cc !important; }
    .k-muted { color: #8b9096 !important; }
    .k-line { border-color: #26303b !important; }
    .k-tint { background: #1b232d !important; }
    .k-link { color: #f4f4f1 !important; }
  }
  [data-ogsc] .k-ink, [data-ogsc] .k-link { color: #f4f4f1 !important; }
  [data-ogsc] .k-sub { color: #c4c7cc !important; }
  [data-ogsc] .k-muted { color: #8b9096 !important; }
  [data-ogsb] .k-canvas { background: #0b0f14 !important; }
  [data-ogsb] .k-card { background: #131a22 !important; }
  [data-ogsb] .k-tint { background: #1b232d !important; }
  @media only screen and (max-width: 620px) {
    .k-shell { padding: 12px 8px !important; }
    .k-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .k-amount { font-size: 34px !important; }
  }
</style>
</head>
<body class="k-canvas" style="margin:0;padding:0;background:${C.canvas};font-family:${FONT};color:${C.ink};-webkit-text-size-adjust:100%;">
  ${hidden}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="k-canvas k-shell" style="background:${C.canvas};padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="k-card" style="max-width:600px;width:100%;background:${C.card};border:1px solid ${C.line};border-radius:16px;">
          <tr>
            <td class="k-pad" style="padding:24px ${PAD} 0 ${PAD};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">${mark}</td>
                  <td class="k-ink" style="vertical-align:middle;padding-left:10px;font-size:16px;font-weight:600;letter-spacing:-0.01em;color:${C.ink};">Karwan</td>
                </tr>
              </table>
            </td>
          </tr>
${inner}
          <tr>
            <td class="k-pad" style="padding:28px ${PAD} 24px ${PAD};">
              <div class="k-line" style="border-top:1px solid ${C.line};padding-top:18px;">
                <p class="k-muted" style="margin:0;font-size:12px;line-height:1.6;color:${C.muted};">${escapeHtml(footerNote)}</p>
                <p class="k-muted" style="margin:8px 0 0 0;font-size:12px;line-height:1.6;color:${C.muted};">Karwan &middot; One reputation for the internet &middot; <a href="mailto:support@karwan.site" class="k-link" style="color:${C.sub};">support@karwan.site</a></p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function row(content: string, top = 0, bottom = 0): string {
  return `          <tr>
            <td class="k-pad" style="padding:${top}px ${PAD} ${bottom}px ${PAD};">${content}</td>
          </tr>
`;
}

/// The opening of every email: a quiet kicker and the headline.
export function emailHeading({ kicker, title }: { kicker?: string; title: string }): string {
  const kick = kicker
    ? `<p class="k-muted" style="margin:0 0 8px 0;font-size:13px;line-height:1.4;color:${C.muted};">${escapeHtml(kicker)}</p>`
    : '';
  return row(
    `${kick}<h1 class="k-ink" style="margin:0;font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;color:${C.ink};">${escapeHtml(title)}</h1>`,
    28,
  );
}

/// The amount, when money is the point of the email. Always with its currency.
export function emailAmount(amount: string, unit = 'USDC'): string {
  return row(
    `<p class="k-ink k-amount" style="margin:0;font-size:40px;line-height:1.05;font-weight:600;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;color:${C.ink};">${escapeHtml(amount)}<span class="k-muted" style="font-size:17px;font-weight:500;letter-spacing:0;color:${C.muted};">&nbsp;${escapeHtml(unit)}</span></p>`,
    22,
  );
}

/// Body copy. Plain strings are escaped; use emailRich for a sentence that
/// needs a bold name or amount.
export function emailText(...paragraphs: string[]): string {
  return emailRich(...paragraphs.map(escapeHtml));
}

/// Body copy that is already safe HTML (built with escapeHtml and emailStrong).
export function emailRich(...paragraphs: string[]): string {
  return paragraphs
    .map((p, i) => row(`<p class="k-sub" style="margin:0;font-size:15px;line-height:1.6;color:${C.sub};">${p}</p>`, i === 0 ? 14 : 10))
    .join('');
}

export function emailStrong(text: string): string {
  return `<strong class="k-ink" style="font-weight:600;color:${C.ink};">${escapeHtml(text)}</strong>`;
}

/// Key facts as label and value, separated by hairlines.
export function emailFacts(facts: Array<[label: string, value: string]>): string {
  const rows = facts
    .map(
      ([label, value]) => `<tr>
                  <td class="k-muted k-line" style="padding:12px 0;border-bottom:1px solid ${C.line};font-size:14px;color:${C.muted};">${escapeHtml(label)}</td>
                  <td class="k-ink k-line" align="right" style="padding:12px 0;border-bottom:1px solid ${C.line};font-size:14px;text-align:right;font-variant-numeric:tabular-nums;color:${C.ink};">${escapeHtml(value)}</td>
                </tr>`,
    )
    .join('');
  return row(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="k-line" style="border-top:1px solid ${C.line};">${rows}</table>`,
    22,
  );
}

/// The one action. A lime pill that says what happens.
export function emailButton(label: string, url: string): string {
  return row(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:999px;background:${C.accent};"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:${C.accent};color:${C.accentInk};font-family:${FONT};font-size:15px;font-weight:600;line-height:1;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`,
    26,
  );
}

/// A quiet secondary link under the action, such as "Proof on Arc".
export function emailLink(label: string, url: string): string {
  return row(
    `<a href="${escapeHtml(url)}" class="k-link" style="font-size:14px;color:${C.ink};text-decoration:underline;">${escapeHtml(label)}</a>`,
    14,
  );
}

/// Small print that belongs to this message, not the footer.
export function emailNote(text: string): string {
  return row(`<p class="k-muted" style="margin:0;font-size:13px;line-height:1.55;color:${C.muted};">${escapeHtml(text)}</p>`, 14);
}

/// A tinted panel for the one thing the reader must not miss: which account to
/// use, a security warning. Takes safe HTML.
export function emailPanel(html: string, tone: 'plain' | 'warning' = 'plain'): string {
  const color = tone === 'warning' ? C.warning : C.sub;
  return row(
    `<div class="k-tint${tone === 'plain' ? ' k-sub' : ''}" style="background:${C.tint};border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.55;color:${color};">${html}</div>`,
    18,
  );
}

/// Free text someone wrote, line breaks kept: a support reply, a quoted ask.
export function emailQuote(text: string): string {
  return row(
    `<p class="k-ink" style="margin:0;font-size:15px;line-height:1.6;white-space:pre-wrap;color:${C.ink};">${escapeHtml(text)}</p>`,
    14,
  );
}

/// A conversation, oldest first, one message per hairline-separated entry.
export function emailThread(messages: Array<{ who: string; when: string; text: string }>): string {
  const rows = messages
    .map(
      (m) => `<tr>
                  <td class="k-line" style="padding:12px 0;border-bottom:1px solid ${C.line};">
                    <p class="k-muted" style="margin:0 0 4px 0;font-size:12px;color:${C.muted};">${escapeHtml(m.who)} &middot; ${escapeHtml(m.when)}</p>
                    <p class="k-ink" style="margin:0;font-size:14px;line-height:1.55;white-space:pre-wrap;color:${C.ink};">${escapeHtml(m.text)}</p>
                  </td>
                </tr>`,
    )
    .join('');
  return row(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="k-line" style="border-top:1px solid ${C.line};">${rows}</table>`,
    18,
  );
}

/// A one-time code, large and spaced for reading aloud.
export function emailCode(code: string): string {
  return row(
    `<div class="k-tint k-ink" style="display:inline-block;background:${C.tint};border-radius:12px;padding:16px 22px;font-size:34px;line-height:1;font-weight:600;letter-spacing:0.24em;font-variant-numeric:tabular-nums;color:${C.ink};">${escapeHtml(code)}</div>`,
    22,
  );
}

/// The raw link for readers whose client blocks the button.
/// Long URLs have no spaces, so `word-break` sits on the cell itself: on an
/// inline span it is widely ignored and the link widens the card off a phone.
export function emailUrlFallback(url: string, label = 'If the button does not work, paste this link into your browser:'): string {
  return `          <tr>
            <td class="k-pad k-muted" style="padding:18px ${PAD} 0 ${PAD};font-size:12px;line-height:1.55;color:${C.muted};word-break:break-all;">${escapeHtml(label)}<br />${escapeHtml(url)}</td>
          </tr>
`;
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
