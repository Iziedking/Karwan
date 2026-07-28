/// The server-rendered shell for the team-facing pages.
///
/// These pages are served from the backend rather than the Next.js frontend on
/// purpose. The OAuth login and the portal both need a session cookie set by
/// this origin, and putting them on the Vercel frontend would mean the login,
/// the cookie and the token endpoint sit on three different hosts with the
/// browser's third-party cookie rules in the middle. One origin, no ceremony.
///
/// Plain HTML and inline CSS: these are three pages behind a password, not an
/// application, and a build step for them would be a build step to maintain.

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch,
  );
}

const STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; background:#0A0A0B; color:#F4F4F1;
    font:15px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  .wrap { max-width:760px; margin:0 auto; padding:48px 20px 96px; }
  .center { min-height:100vh; display:grid; place-items:center; padding:20px; }
  .card { width:min(440px,100%); padding:32px; border:1px solid rgba(255,255,255,.10);
    border-radius:16px; background:#161616; }
  h1 { margin:0 0 6px; font-size:22px; font-weight:800; letter-spacing:-.3px; }
  h2 { margin:36px 0 10px; font-size:15px; font-weight:800; }
  p { margin:0 0 16px; color:rgba(244,244,241,.62); font-size:14px; }
  .eyebrow { font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
    letter-spacing:.18em; text-transform:uppercase; color:rgba(244,244,241,.38);
    margin:0 0 10px; }
  label { display:block; margin:0 0 14px; }
  span.l { display:block; margin-bottom:6px; font:600 10px/1 ui-monospace,Menlo,monospace;
    letter-spacing:.12em; text-transform:uppercase; color:rgba(244,244,241,.45); }
  input { width:100%; padding:11px 12px; border-radius:9px;
    border:1px solid rgba(255,255,255,.15); background:#0E0E0E; color:#F4F4F1; font-size:15px; }
  input:focus { outline:none; border-color:rgba(255,255,255,.45); }
  button { padding:12px 18px; border:0; border-radius:9px; background:#AFC95B;
    color:#0E0E0E; font:700 13px/1 ui-sans-serif,system-ui,sans-serif;
    letter-spacing:.05em; text-transform:uppercase; cursor:pointer; }
  button.wide { width:100%; }
  button.quiet { background:transparent; color:rgba(244,244,241,.5);
    border:1px solid rgba(255,255,255,.15); }
  .err { margin:0 0 16px; padding:10px 12px; border-radius:9px; font-size:13px;
    color:#e0794f; border:1px solid rgba(224,121,79,.3); background:rgba(224,121,79,.08); }
  .ok { margin:0 0 16px; padding:10px 12px; border-radius:9px; font-size:13px;
    color:#AFC95B; border:1px solid rgba(175,201,91,.3); background:rgba(175,201,91,.08); }
  .who { display:flex; gap:10px; align-items:center; flex-wrap:wrap;
    padding:14px 16px; border-radius:12px; background:#161616;
    border:1px solid rgba(255,255,255,.10); margin:0 0 28px; font-size:14px; }
  .tag { font:700 9px/1 ui-monospace,Menlo,monospace; letter-spacing:.14em;
    text-transform:uppercase; padding:5px 8px; border-radius:6px;
    border:1px solid rgba(255,255,255,.15); color:rgba(244,244,241,.55); }
  pre { margin:0; padding:14px 16px; border-radius:11px; background:#0E0E0E;
    border:1px solid rgba(255,255,255,.10); overflow-x:auto;
    font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace; color:#F4F4F1; }
  .copy { position:relative; margin:0 0 8px; }
  .copy pre { padding-right:88px; }
  .copy button { position:absolute; top:8px; right:8px; padding:7px 10px;
    background:rgba(255,255,255,.08); color:rgba(244,244,241,.75);
    border:1px solid rgba(255,255,255,.14); font-size:10px; letter-spacing:.1em; }
  .copy button:hover { background:rgba(255,255,255,.14); color:#F4F4F1; }
  .copy button[data-done="1"] { background:rgba(175,201,91,.16); color:#AFC95B;
    border-color:rgba(175,201,91,.4); }
  ol { margin:0 0 16px; padding-left:20px; font-size:14px; color:rgba(244,244,241,.62); }
  li { margin:0 0 8px; }
  .step { border-left:2px solid rgba(175,201,91,.4); padding-left:16px; margin:0 0 28px; }
  .foot { margin:32px 0 0; font-size:12px; color:rgba(244,244,241,.32); }
  a { color:#AFC95B; }
`;

/// A code block with a copy button.
///
/// The text lives in the markup rather than in a data attribute, so the button
/// copies exactly what is on screen. Reading it back from the DOM means the two
/// can never drift, which is the failure that matters here: a member pasting a
/// URL that differs from the one they were shown has no way to tell.
export function copyable(text: string): string {
  return `<div class="copy"><pre>${escapeHtml(text)}</pre>
<button type="button" class="js-copy">Copy</button></div>`;
}

/// Progressive enhancement, deliberately. Without JavaScript the block is still
/// selectable text, which is what it was before the button existed.
const COPY_SCRIPT = `
document.addEventListener('click', function (e) {
  var btn = e.target.closest('.js-copy');
  if (!btn) return;
  var pre = btn.parentElement.querySelector('pre');
  if (!pre) return;
  var done = function () {
    btn.textContent = 'Copied';
    btn.dataset.done = '1';
    setTimeout(function () { btn.textContent = 'Copy'; delete btn.dataset.done; }, 1600);
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(pre.textContent).then(done).catch(function () { select(pre); });
  } else {
    select(pre);
  }
  function select(el) {
    // Clipboard access is blocked without a secure context or permission.
    // Selecting the text is a downgrade, not a failure: the person can still
    // copy it themselves with one keystroke.
    var r = document.createRange();
    r.selectNodeContents(el);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    btn.textContent = 'Press Ctrl+C';
  }
});`;

export function page(title: string, body: string, opts: { status?: number; center?: boolean } = {}) {
  const inner = opts.center
    ? `<div class="center"><div class="card">${body}</div></div>`
    : `<div class="wrap">${body}</div>`;

  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · Karwan</title>
<style>${STYLE}</style></head><body>${inner}
<script>${COPY_SCRIPT}</script></body></html>`,
    {
      status: opts.status ?? 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // These pages carry a password form and a signed-in session. Nothing
        // about them should sit in a shared cache or be framed by anyone.
        'cache-control': 'no-store',
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer',
      },
    },
  );
}
