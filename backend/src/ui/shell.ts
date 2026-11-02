/// The server-rendered shell for the team-facing pages.
///
/// These pages are served from the backend rather than the Next.js frontend on
/// purpose. The OAuth login and the portal both need a session cookie set by
/// this origin, and putting them on the Vercel frontend would mean the login,
/// the cookie and the token endpoint sit on three different hosts with the
/// browser's third-party cookie rules in the middle. One origin, no ceremony.
///
/// Plain HTML and inline CSS: these are a few pages behind a password, not an
/// application, and a build step for them would be a build step to maintain.
/// The look follows the design quality standard (canon: brand/quality-standard).

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch,
  );
}

const STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; color:#F4F4F1;
    background:#0F1012 radial-gradient(90% 62% at 72% 16%, #212427 0%, #16181A 52%, #0F1012 100%) no-repeat fixed;
    font:15px/1.6 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
    -webkit-font-smoothing:antialiased; }
  .wrap { max-width:680px; margin:0 auto; padding:40px 20px 96px; }
  .center { min-height:100vh; display:grid; place-items:center; padding:24px 20px; }
  .center-inner { width:min(420px,100%); }
  .logo { display:flex; align-items:center; gap:10px; margin:0 0 28px; color:#F4F4F1; text-decoration:none;
    font-size:24px; font-weight:600; letter-spacing:-.034em; line-height:1; }
  .logo svg { width:32px; height:32px; display:block; }
  .card { padding:28px; border-radius:24px; border-end-start-radius:44px; background:#1A1D20;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.07), 0 28px 48px -28px rgba(0,0,0,.8); }
  h1 { margin:0 0 8px; font-size:30px; font-weight:600; letter-spacing:-.03em; line-height:1.1; }
  h2 { margin:0 0 12px; font-size:18px; font-weight:600; letter-spacing:-.02em; }
  p { margin:0 0 16px; color:#A0A6AD; font-size:15px; }
  strong { color:#F4F4F1; font-weight:600; }
  label { display:block; margin:0 0 16px; }
  span.l { display:block; margin-bottom:8px; font-size:14px; font-weight:500; color:#A0A6AD; }
  input { width:100%; min-height:48px; padding:12px 14px; border-radius:14px;
    border:1px solid rgba(206,220,232,.16); background:#101214; color:#F4F4F1; font-size:16px; }
  input:focus { outline:none; border-color:#AFC95B; }
  button { min-height:48px; padding:12px 20px; border:0; border-radius:14px; background:#AFC95B;
    color:#16202A; font:600 15px/1 Inter,ui-sans-serif,system-ui,sans-serif; cursor:pointer;
    transition:transform .18s ease-out, background-color .18s ease-out; }
  button:hover { background:#BAD365; }
  button:active { transform:translateY(1px); }
  button:focus-visible, a:focus-visible, summary:focus-visible { outline:2px solid #AFC95B; outline-offset:3px; }
  button.wide { width:100%; }
  button.quiet { min-height:44px; background:transparent; color:#F4F4F1;
    box-shadow:inset 0 0 0 1px rgba(206,220,232,.18); }
  button.quiet:hover { background:rgba(206,220,232,.06); }
  .err { margin:0 0 16px; padding:12px 14px; border-radius:14px; font-size:14px;
    color:#F0A58A; background:rgba(224,121,79,.1); }
  .ok { margin:0 0 16px; padding:12px 14px; border-radius:14px; font-size:14px;
    color:#CFE38A; background:rgba(175,201,91,.1); }
  .who { display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin:0 0 28px; font-size:14px; color:#A0A6AD; }
  .who form { margin-inline-start:auto; }
  .tag { padding:4px 10px; border-radius:999px; font-size:13px; font-weight:500; color:#F4F4F1;
    box-shadow:inset 0 0 0 1px rgba(206,220,232,.18); }

  /* The hero: Karwan green as a material. The tile's corner, grain, one light, stacked pages. */
  .stack { position:relative; z-index:0; margin:28px 0 44px; }
  .stack::before, .stack::after { content:""; position:absolute; inset-inline:9px; bottom:-9px; height:100%;
    border-radius:28px; border-end-start-radius:56px; background:#7F9441; z-index:-1; }
  .stack::after { inset-inline:18px; bottom:-17px; background:#55642C; z-index:-2; }
  .hero { position:relative; overflow:hidden; padding:26px; color:#16202A;
    border-radius:28px; border-end-start-radius:56px;
    background:radial-gradient(130% 125% at 88% -8%, #C6DD74 0%, #AFC95B 46%, #9AB34D 100%);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.3), 0 30px 50px -26px rgba(0,0,0,.75); }
  .hero::after { content:""; position:absolute; inset:0; pointer-events:none; opacity:.6; mix-blend-mode:multiply;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.62' numOctaves='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .32 0 0 0 0 .36 0 0 0 0 .14 0 0 0 .9 0'/></filter><rect width='220' height='220' filter='url(%23n)'/></svg>"); }
  .hero > * { position:relative; z-index:1; }
  .hero-label { margin:0 0 56px; font-size:15px; font-weight:600; color:#16202A; opacity:.8; }
  .hero .copy { margin:0; }
  .hero .copy pre { padding:0; background:none; box-shadow:none; overflow:visible; white-space:normal; overflow-wrap:anywhere;
    font:600 clamp(18px,4.6vw,38px)/1.08 Inter,ui-sans-serif,system-ui,sans-serif; letter-spacing:-.035em; color:#16202A; }
  .hero .copy button { position:static; margin-top:22px; min-height:48px; padding:12px 22px; font-size:15px;
    background:#16202A; color:#F4F4F1; }
  .hero .copy button:hover { background:#27313A; color:#F4F4F1; }
  .hero .copy button[data-done="1"] { background:#16202A; color:#CFE38A; }

  /* The path: one green tile travels from the agent to the canon and settles. */
  .flow { position:relative; display:flex; justify-content:space-between; margin:0 0 44px; }
  .flow::before { content:""; position:absolute; top:21px; inset-inline:calc(16.66% - 8px); height:2px;
    background:rgba(206,220,232,.16); }
  .node { position:relative; flex:1; display:flex; flex-direction:column; align-items:center; gap:10px;
    font-size:14px; font-weight:500; color:#A0A6AD; text-align:center; }
  .dot { width:44px; height:44px; border-radius:12px; border-end-start-radius:20px; background:#1A1D20;
    box-shadow:inset 0 0 0 1px rgba(206,220,232,.16); animation:lit 6s ease-out infinite; }
  .node:nth-of-type(2) .dot { animation-delay:1.6s; }
  .node:nth-of-type(3) .dot { animation-delay:3.2s; }
  .token { position:absolute; top:7px; inset-inline-start:calc(16.66% - 15px); width:30px; height:30px;
    border-radius:9px; border-end-start-radius:15px; background:#AFC95B; z-index:1;
    box-shadow:0 10px 18px -8px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.3);
    animation:travel 6s cubic-bezier(.22,.8,.3,1) infinite; }
  @keyframes travel {
    0%, 6% { inset-inline-start:calc(16.66% - 15px); opacity:0; }
    12%, 30% { inset-inline-start:calc(16.66% - 15px); opacity:1; }
    46%, 58% { inset-inline-start:calc(50% - 15px); opacity:1; }
    76%, 92% { inset-inline-start:calc(83.33% - 15px); opacity:1; }
    100% { inset-inline-start:calc(83.33% - 15px); opacity:0; }
  }
  @keyframes lit {
    0%, 8% { background:#1A1D20; }
    14%, 30% { background:#262B2F; }
    46%, 100% { background:#1A1D20; }
  }

  /* The tools: one open at a time. */
  .tools { margin:0 0 40px; border-top:1px solid rgba(206,220,232,.14); }
  details.tool { border-bottom:1px solid rgba(206,220,232,.14); }
  summary { display:flex; align-items:center; justify-content:space-between; min-height:60px; cursor:pointer;
    list-style:none; font-size:17px; font-weight:600; letter-spacing:-.015em; }
  summary::-webkit-details-marker { display:none; }
  summary::after { content:""; width:9px; height:9px; margin-inline-end:6px; border-inline-end:2px solid #A0A6AD;
    border-bottom:2px solid #A0A6AD; transform:rotate(45deg); transition:transform .25s ease-out; }
  details[open] summary::after { transform:rotate(-135deg); }
  .tool-body { padding:0 0 22px; animation:settle .32s ease-out; }
  @keyframes settle { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }

  .rows { margin:0 0 40px; border-top:1px solid rgba(206,220,232,.14); }
  .row { display:flex; justify-content:space-between; gap:20px; padding:14px 0;
    border-bottom:1px solid rgba(206,220,232,.14); font-size:15px; }
  .row span:first-child { flex:none; font-weight:600; color:#F4F4F1; }
  .row span:last-child { color:#A0A6AD; text-align:end; }

  pre { margin:0; padding:14px 16px; border-radius:14px; background:#101214; overflow-x:auto;
    box-shadow:inset 0 0 0 1px rgba(206,220,232,.12);
    font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace; color:#F4F4F1; }
  .copy { position:relative; margin:0 0 8px; }
  .copy pre { padding-inline-end:88px; white-space:pre-wrap; overflow-wrap:anywhere; }
  .copy button { position:absolute; top:8px; inset-inline-end:8px; min-height:34px; padding:7px 12px;
    background:rgba(206,220,232,.1); color:#F4F4F1; font-size:13px; }
  .copy button:hover { background:rgba(206,220,232,.18); }
  .copy button[data-done="1"] { color:#CFE38A; }
  ol { margin:0 0 8px; padding-inline-start:20px; font-size:15px; color:#A0A6AD; }
  li { margin:0 0 8px; }
  .foot { margin:24px 0 0; font-size:14px; color:#A0A6AD; }
  a { color:#CFE38A; }
  .rise { animation:rise .55s cubic-bezier(.22,.8,.3,1) both; }
  .rise.d1 { animation-delay:.07s; }
  .rise.d2 { animation-delay:.14s; }
  .rise.d3 { animation-delay:.21s; }
  @keyframes rise { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
  @media (max-width:480px) {
    .row { flex-direction:column; gap:2px; }
    .row span:last-child { text-align:start; }
    .node { font-size:13px; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation:none !important; transition:none !important; }
    .token { inset-inline-start:calc(83.33% - 15px); }
  }
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

/// The live logo: the tile from karwan-app-icon.svg beside the wordmark.
const LOGO = `<div class="logo"><svg viewBox="0 0 400 400" aria-hidden="true">
<path d="M44 16h312q28 0 28 28v312q0 28-28 28H72q-56 0-56-56V44q0-28 28-28Z" fill="#0E0E0E"/>
<path d="m116 283 52-166 32 100 32-100 52 166" fill="none" stroke="#AFC95B" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>
</svg><span>Karwan</span></div>`;

export function page(title: string, body: string, opts: { status?: number; center?: boolean } = {}) {
  const inner = opts.center
    ? `<div class="center"><div class="center-inner rise">${LOGO}<div class="card">${body}</div></div></div>`
    : `<div class="wrap">${LOGO}${body}</div>`;

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
