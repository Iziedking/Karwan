import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { getProductBackHref } from '../utils/routes';
import { en } from '../i18n/messages/en';
import { ar } from '../i18n/messages/ar';
import { fr } from '../i18n/messages/fr';
import { hi } from '../i18n/messages/hi';
import { sw } from '../i18n/messages/sw';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('editorial copy names the network and distinguishes current access from planned work', () => {
  const keys = Object.keys(en.landingEditorial).sort();
  for (const locale of [ar, fr, hi, sw]) assert.deepEqual(Object.keys(locale.landingEditorial).sort(), keys);
  assert.equal(en.networkUi.builtOnArc, 'Built on Arc');
  assert.match(en.networkUi.testnetNotice, /no real monetary value/);
  assert.match(en.landingEditorial.trade, /Mainnet access is by invitation/);
  assert.match(en.landingEditorial.trade, /market and deal flow are available on testnet with test funds/);
  assert.match(en.landingEditorial.introBody, /across platforms.*planned/);
  assert.match(en.landingEditorial.limitBody, /including the final one/);
  assert.match(en.landingEditorial.limitBody, /It does not refund them automatically/);
});

test('public analytics and workspace notices avoid API internals and repeat mainnet warnings', () => {
  const analyticsPage = source('../../app/activity/all-time/page.tsx');
  const analyticsCopy = source('../i18n/messages/analytics.ts');
  const networkContext = source('./NetworkContext.tsx');
  const nudge = source('./ProfileNudge.tsx');
  const history = source('../../features/bridge/components/BridgeHistorySection.tsx');

  assert.doesNotMatch(analyticsPage, /publicApiUrl|CheckIt|raw figures/);
  assert.match(analyticsCopy, /Every figure is read from Karwan's contracts on Arc\./);
  assert.match(networkContext, /network\.environment !== 'mainnet'/);
  assert.match(networkContext, /network\.environment !== 'mainnet' &&/);
  // The setup card sits on the page column, never as a strip against the rail.
  assert.match(nudge, /max-w-\[var\(--workspace-measure\)\] rounded-\[18px\]/);
  assert.doesNotMatch(nudge, /border-b border-\[var\(--lp-border-light\)\]/);
  assert.match(nudge, /stepTwo/);
  assert.match(history, /width: 'min\(640px, 100vw\)'/);
  assert.match(history, /var\(--ink-secondary\)/);
  assert.doesNotMatch(history, /--lp-workspace-raised|--ink-3/);
});

test('the landing respects reduced motion: no pinning, no clips, every scene at rest', () => {
  const page = source('../../app/page.tsx');
  const css = source('../../features/landing/landing.module.css');
  const motion = source('../../features/landing/useLandingMotion.ts');
  assert.match(page, /<LandingPage \/>/);
  assert.match(motion, /prefers-reduced-motion: reduce/);
  assert.match(motion, /el.style.setProperty\('--p', '1'\)/);
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {'));
  assert.match(reduced, /\.hero \{ height: auto; \}/);
  assert.match(reduced, /\.sellerPhone \{ display: none; \}/);
  assert.doesNotMatch(page + css, /usePanelSnap|scroll-snap-type/);
});

test('landing cards are told apart by tone, never by an outline', () => {
  const css = source('../../features/landing/landing.module.css');
  for (const card of ['.platforms', '.board', '.node', '.recordCard', '.tile', '.place', '.fitCard', '.toss', '.chatBar', '.phoneNote']) {
    const rule = css.match(new RegExp(`^\\${card} \\{[^}]*\\}`, 'm'))?.[0] ?? '';
    assert.ok(rule, `${card} exists`);
    assert.doesNotMatch(rule, /box-shadow: inset|border: 1/, `${card} has an outline`);
  }
});

test('the hero phone is a body in perspective, not a flat card', () => {
  const css = source('../../features/landing/landing.module.css');
  const hero = source('../../features/landing/components/Hero.tsx');
  assert.match(css, /\.buyerPhone \{[^}]*perspective: \d+px/);
  assert.match(css, /\.device \{[^}]*--depth: \d+px/);
  for (const side of ['left', 'right', 'top', 'bottom']) assert.match(css, new RegExp(`\\.edge\\[data-side='${side}'\\]`));
  assert.match(hero, /<Device className=\{s\.turn\}/);
  assert.match(hero, /SLICES\.map/);
});

test('nothing on the landing, mock-ups included, is under 14px', () => {
  const css = source('../../features/landing/landing.module.css') + source('./SiteFooter.module.css');
  for (const [, size] of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(size) >= 14, `${size}px on the landing`);
  }
});

test('activity keeps personal transactions and the public feed distinct without category cards', () => {
  const activity = source('../../features/activity/components/ActivityView.tsx');
  assert.match(activity, /activity-money-panel/);
  assert.match(activity, /activity-events-panel/);
  // Transaction history opens first; the public feed is one button away.
  assert.match(activity, /useState<'money' \| 'events'>\('money'\)/);
  assert.match(activity, /setActivePanel\(activePanel === 'money' \? 'events' : 'money'\)/);
  assert.doesNotMatch(activity, /role="tablist"/);
  assert.doesNotMatch(activity, /<ActivityStats|toggleGroup|countByGroup/);
});

test('profile photo is a user-initiated saved image with a generated fallback', () => {
  const hub = source('../../features/profile/components/ProfileAccountHub.tsx');
  assert.match(hub, /api\.setProfileAvatar\(address, imageDataUrl\)/);
  assert.match(hub, /profile\.profileImageDataUrl/);
  assert.match(hub, /<WalletAvatar address=\{address\} size=\{56\}/);
  assert.match(hub, /type="file" accept="image\/jpeg,image\/png,image\/webp"/);
});

test('the deal guarantee page holds the guarantee card, and the old staking page only redirects', () => {
  const page = source('../../app/guarantee/page.tsx');
  assert.match(page, /<GuaranteeCard\s*\/>/);
  const stake = source('../../app/stake/page.tsx');
  assert.match(stake, /\/guarantee/);
});

test('documentation returns to a useful internal destination', () => {
  assert.equal(getProductBackHref('/docs', true), '/app');
  assert.equal(getProductBackHref('/docs', false), '/');
  assert.equal(getProductBackHref('/docs/escrow', false), '/docs');
  assert.equal(getProductBackHref('/how-it-works', true), '/app');
});

test('every signed-in page but Home has a Back (owner, 23 Oct)', () => {
  assert.equal(getProductBackHref('/app', true), null);
  for (const root of ['/market', '/financier', '/activity', '/profile', '/messages/ada']) {
    assert.notEqual(getProductBackHref(root, true), null, root);
  }
  assert.equal(getProductBackHref('/profile/wallets', true), '/profile');
  assert.equal(getProductBackHref('/market', false), '/');
  assert.notEqual(getProductBackHref('/activity/receipt/1', true), null);
});

test('workspace width is column-bound and tablet navigation fills the rail gap', () => {
  const css = source('../../app/globals.css');
  assert.match(css, /\[data-workspace-main='true'\] \.w-bleed\s*\{\s*width: 100%;/);
  assert.match(css, /\[data-workspace-main='true'\] \.w-bleed\s*\{[^}]*--tw-translate-x: 0px;/);
  assert.match(source('./WorkspaceBottomNav.tsx'), /lg:hidden/);
});

test('signed-in home splits only when the content column has room', () => {
  const css = source('../../app/globals.css');
  const home = source('../../features/home/components/AccountHome.tsx');
  const deals = source('../../features/home/components/HomeDeals.tsx');
  assert.match(css, /\.home-workbench\s*\{[^}]*container-type: inline-size;/);
  assert.match(css, /@container \(min-width: 1080px\)\s*\{\s*\.home-command-grid/);
  // Home shows the top of the Deals list (view 44), or nothing when no deal is live.
  assert.match(home, /<HomeDeals \/>/);
  assert.match(deals, /homeDealsPreview\(groups\)/);
  assert.match(deals, /if \(preview\.empty\) return null;/);
  assert.doesNotMatch(home, /lg:grid-cols-\[minmax\(0,0\.92fr\)/);
});

test('business directory reads as open records without nested card scrollbars', () => {
  const partners = source('../../features/partners/components/PartnersBrowse.tsx');
  assert.match(partners, /<h1[^>]*>\s*\{messages\.listingsBrowse\.heroTitle\}/);
  assert.match(partners, /<article className="flex h-full flex-col/);
  assert.match(partners, /<dl className="mt-4 space-y-2/);
  assert.doesNotMatch(partners, /h-\[400px\]|overflow-y-auto|<select/);
});

test('public navigation uses viewport width while workspace chrome keeps its width contract', () => {
  const nav = source('./TopNav.tsx');
  assert.match(nav, /publicSurface \? 'max-w-none' : 'max-w-\[1600px\]'/);
  assert.match(nav, /w-full items-center gap-2\.5 px-4 sm:h-\[72px\] sm:gap-5 sm:px-6/);
  assert.match(nav, /ms-auto flex min-w-0 shrink-0 items-center/);
  assert.match(nav, /publicSurface && 'max-\[379px\]:\[&_span\]:hidden/);
  assert.match(nav, /function LaunchAppCTA\(\)[\s\S]*className="hidden [^"]*md:inline-flex"/);
});

test('the theme is chosen only in Profile: no control in the top bar or the rail, two choices in Settings', () => {
  const nav = source('./TopNav.tsx');
  assert.doesNotMatch(nav, /ThemeControl|RailTheme|useThemeCycle|ThemeIcon/);
  assert.equal(existsSync(new URL('./ThemeControl.tsx', import.meta.url)), false);
  const settings = source('../../features/settings/components/SettingsBand.tsx');
  assert.match(settings, /value: 'dark'/);
  assert.match(settings, /value: 'light'/);
  assert.doesNotMatch(settings, /value: 'system'|themeSystem/);
  assert.equal(en.settings.themeDark, 'Dark');
  assert.equal(en.settings.themeLight, 'Light');
  assert.equal('themeSystem' in en.settings, false);
});

test('the wallet home renders translated copy, not hardcoded English', () => {
  const page = source('../../app/account/page.tsx');
  assert.doesNotMatch(page, />(USDC balance|By chain|Manage USDC|Live balances|Add USDC|Send USDC)</);
  assert.doesNotMatch(page, /(label|description|aria-label)="[A-Z][a-z]+ /);
  for (const locale of [ar, fr, hi, sw]) {
    assert.notEqual(locale.account.page.manage, en.account.page.manage);
    assert.notEqual(locale.account.page.byChain, en.account.page.byChain);
  }
});

test('the landing page paints dark on a full load and on client-side navigation', () => {
  const layout = source('../../app/layout.tsx');
  assert.match(layout, /dangerouslySetInnerHTML=\{\{ __html: THEME_PREPAINT_SCRIPT \}\}/);
  assert.match(layout, /<ThemeRouteSync \/>/);
  assert.doesNotMatch(layout, /localStorage\.getItem\('karwan-theme'\)/);
});

function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const channels = hex.match(/[a-f\d]{2}/gi)!.map(part => parseInt(part,16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const [lighter,darker] = [luminance(a),luminance(b)].sort((x,y)=>y-x);
  return (lighter+0.05)/(darker+0.05);
}

test('canonical theme text, selected controls and field edges meet contrast thresholds', () => {
  const css = source('../../app/design-tokens.css');
  const declarations = (body: string) => Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]),
  );
  const light = declarations(css.match(/:root\s*\{([\s\S]*?)\n\}/)![1]);
  const dark = { ...light, ...declarations(css.match(/html\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)![1]) };
  type Colour = [number, number, number, number];
  const channels = (hex: string): Colour => [...hex.slice(1).match(/../g)!.map(part => parseInt(part, 16)), 1] as Colour;
  const composite = (paint: Colour, background: Colour): Colour => [
    ...paint.slice(0, 3).map((value, i) => Math.round(value * paint[3] + background[i] * (1 - paint[3]))), 1,
  ] as Colour;
  const hex = (value: Colour) => `#${value.slice(0, 3).map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
  for (const [theme, tokens] of [['light', light], ['dark', dark]] as const) {
    const resolve = (name: string): Colour => {
      const value = tokens[name];
      assert.ok(value, `${theme}: missing ${name}`);
      if (/^#[\da-f]{6}$/i.test(value)) return channels(value);
      const alias = value.match(/^var\((--[\w-]+)\)$/);
      if (alias) return resolve(alias[1]);
      const mix = value.match(/^color-mix\(in srgb, var\((--[\w-]+)\) (\d+)%, transparent\)$/);
      assert.ok(mix, `${theme}: unsupported colour ${name}=${value}`);
      return [...resolve(mix[1]).slice(0, 3), Number(mix[2]) / 100] as Colour;
    };
    for (const surfaceName of ['--canvas', '--surface', '--raised']) {
      const background = resolve(surfaceName);
      const field = composite(resolve('--tint'), background);
      for (const name of ['--ink', '--ink-secondary', '--ink-muted', '--lp-text-sub', '--lp-workspace-faint', '--color-offer', '--color-request', '--color-positive', '--color-warning', '--color-critical']) {
        assert.ok(contrast(hex(composite(resolve(name), background)), hex(background)) >= 4.5, `${theme} ${surfaceName} ${name}`);
      }
      assert.ok(contrast(hex(composite(resolve('--lp-field-border'), field)), hex(field)) >= 3, `${theme} field edge`);
      assert.ok(contrast(hex(composite(resolve('--lp-text-muted'), field)), hex(field)) >= 4.5, `${theme} placeholder`);
    }
    assert.ok(contrast(hex(resolve('--accent-ink')), hex(resolve('--karwan-green'))) >= 4.5, `${theme} action label`);
    assert.ok(contrast(hex(resolve('--lp-selected-bg')), hex(resolve('--lp-selected-ink'))) >= 4.5, `${theme} selected label`);
  }
});

test('market price and unit stay together, and card facts sit on fixed lines that truncate rather than wrap', () => {
  const card = source('../../features/market/components/ListingCard.tsx');
  assert.match(card, /\{formatUsdc\(card\.priceUsdc, \{ withSuffix: false \}\)\} \{t\.usdc\}/);
  assert.match(card, /line-clamp-2 text-\[15px\]/);
  assert.match(card, /<span className="truncate">\{rating\}<\/span>/);
});

test('market cards are quiet: a framed photo, never a boxed card, a real photo or a marked sample, and example stock says so (view 48)', () => {
  const card = source('../../features/market/components/ListingCard.tsx');
  assert.match(card, /aspect-\[4\/3\] overflow-hidden rounded-\[var\(--radius-card\)\] bg-\[var\(--raised\)\]/);
  assert.doesNotMatch(card, /border border-\[var\(--line\)\] bg-\[var\(--surface\)\]/);
  assert.doesNotMatch(card, /--market-surface|market-card-glyph|WORK_ICON/);
  assert.match(card, /card\.example \? t\.example/);
  assert.match(card, /picture === 'sample' && !card\.example/);
});

test('account action is Withdraw, the route out that works for every account', () => {
  const transfer = source('../../app/bridge/page.tsx');
  assert.equal(en.accountHome.withdraw, 'Withdraw');
  assert.match(transfer, /outIntent === 'move' \? header\.titleMove/);
  assert.equal(en.bridge.header.titleMove, 'Move USDC');
});

test('the transfer header speaks of one balance, never the Gateway pool', () => {
  const transfer = source('../../app/bridge/page.tsx');
  assert.doesNotMatch(transfer, /Gateway balance/);
  for (const locale of [en, ar, fr, hi, sw]) {
    assert.doesNotMatch(Object.values(locale.bridge.header).join(' '), /Gateway/);
    assert.doesNotMatch(locale.account.page.withdrawHelp, /Gateway/);
  }
});

test('public and workspace backgrounds follow the same selected theme', () => {
  const nav = source('./TopNav.tsx');
  const footer = source('./SiteFooter.tsx');
  assert.doesNotMatch(nav, /LANDING_NAV_VARS/);
  assert.doesNotMatch(footer, /LANDING_FOOTER_VARS/);
});

test('account entry stays centered across stages with readable, distinct methods', () => {
  const modal = source('./LoginModal.tsx');
  assert.match(modal, /items-end justify-center overflow-hidden sm:items-center/);
  assert.match(modal, /sm:w-\[min\(620px,calc\(100vw-48px\)\)\]/);
  assert.match(modal, /sm:items-center/);
  assert.match(modal, /karwan-auth-description[^\n]+text-\[16px\]/);
  assert.match(modal, /min-h-\[52px\] w-full/);
  assert.match(modal, /setStage\('enter-email'\)/);
  assert.doesNotMatch(modal, /choose-path|pick-method|intent-mismatch/);
  assert.match(modal, /<ConnectButton\.Custom>/);
  assert.doesNotMatch(modal, /auth-wallet-method/);
  assert.doesNotMatch(modal, /max-w-\[38ch\] text-\[13px\]/);
});

test('the first-sign-in terms gate retains the reviewed desktop width and phone sheet', () => {
  const terms = source('./TermsModal.tsx');
  const geometry = source('./TermsModal.module.css');
  assert.match(terms, /styles\.panel/);
  assert.match(geometry, /width: min\(440px, calc\(100vw - 48px\)\)/);
  assert.match(geometry, /max-width: 440px/);
  assert.match(geometry, /width: 100%/);
  assert.match(terms, /flex-col overflow-hidden rounded-t-\[22px\]/);
  assert.match(terms, /sm:rounded-\[16px\]/);
  assert.match(terms, /disabled=\{!scrolledToEnd \|\| submitting\}/);
});

test('the sign-in sheet uses the app surfaces and keeps green for an available Continue (view 48, batch 9g)', () => {
  const css = source('../../app/globals.css');
  const modal = source('./LoginModal.tsx');
  assert.match(css, /\.auth-capsule \{\n  color: var\(--ink\);\n  background: var\(--surface\);/);
  assert.doesNotMatch(css, /\.auth-capsule \{[^}]*--lp-card:/);
  assert.match(css, /\.auth-capsule \.auth-email-continue:disabled \{[\s\S]*?background: var\(--raised\)/);
  assert.match(modal, /auth-email-continue/);
  assert.match(modal, /bg-\[var\(--action\)\] text-\[var\(--on-action\)\]/);
});

test('signed out, a private page goes straight to the one sign-in screen, never an older gate', () => {
  const gate = source('./SignInGate.tsx');
  // In place, not a reload: a full reload would start a second cold splash.
  assert.match(gate, /router\.replace\(signInHref\(/);
  assert.doesNotMatch(gate, /window\.location\.assign|LoginModal|Bands|module\.css/);
  assert.doesNotMatch(source('./AuthGuard.tsx'), /Band|GridOverlay/);
});

test('footer keeps the canonical brand and, on the landing, waits under the page with a still light', () => {
  const footer = source('./SiteFooter.tsx');
  const css = source('./SiteFooter.module.css');
  assert.match(footer, /<Brand \/>/);
  assert.match(footer, /<NetworkContext disclosure \/>/);
  assert.match(footer, /api.subscribeNewsletter\(value\)/);
  assert.match(footer, /landing && <div className=\{styles.glow\} aria-hidden="true" \/>/);
  assert.match(footer, /landing && 'max-sm:hidden'/);
  assert.doesNotMatch(footer, /FooterWaves|data-running|motionControl|aria-pressed=\{paused\}/);
  assert.match(css, /position: sticky; bottom: 0; z-index: 0/);
  assert.match(css, /pointer-events: none/);
  assert.doesNotMatch(css, /animation/);
  assert.match(css, /background: var\(--lp-card\)/);
  assert.match(css, /min-height: calc\(100svh - var\(--lp-nav-h, 68px\)\)/);
  assert.match(css, /\.landing\[data-curtain\] \{ position: sticky/);
  assert.match(footer, /setOn\(el\.offsetHeight <= window\.innerHeight - bar\)/);
});

test('reputation badges and the app shell never leave a person on a bare number or an endless wait', () => {
  const badge = source('../../features/reputation/components/ReputationBadge.tsx');
  const cells = badge.slice(badge.indexOf('const badgeCells'), badge.indexOf('if (!withDetail)'));
  assert.doesNotMatch(cells, /\{score\}/);
  assert.match(source('../../app/not-found.tsx'), /pageNotFound/);
  assert.doesNotMatch(source('../../app/app/page.tsx'), />Account home</);
});

test('the deal page shows dated steps, and messages stay closed behind the message button at every width', () => {
  const hero = source('../../features/deals/workspace/DealHero.tsx');
  assert.match(hero, /<DealTimeline/);
  assert.doesNotMatch(hero, /className="mt-6 flex gap-1\.5"/);
  assert.match(hero, /\{address \? \(\s*<button[\s\S]*?aria-label=\{fill\(dl\.message/);
  assert.doesNotMatch(hero, /!desktop/);
  assert.doesNotMatch(hero, /key: 'messages' as const/);
  assert.doesNotMatch(source('../../features/deals/workspace/DealWorkspace.tsx'), /<ChatPanel/);
});

test('Home lists deals as the same rows as Deals, without numbering or text arrows', () => {
  const home = source('../../features/home/components/HomeDeals.tsx');
  assert.match(home, /<OpenDealRow key=\{r\.key\}/);
  assert.doesNotMatch(home, /padStart\(2, '0'\)/);
  assert.doesNotMatch(home, /→/);
});

test('a ledger row is one tap to its receipt, titled by what happened, with proof and reference inside the receipt', () => {
  const ledger = source('../../features/activity/components/MyMoneyLedger.tsx');
  assert.match(ledger, /ledgerTitle\(item, t\.kind, t\.text\)/);
  assert.doesNotMatch(ledger, /\{t\.viewProof\}/);
  assert.doesNotMatch(ledger, /copyReference/);
  assert.match(ledger, /proofHref=\{explorerFor\(selectedReceipt\)\}/);
});

test('activity is a statement: one count, rows under their day, a money in and out filter, a page title the size of the others', () => {
  const ledger = source('../../features/activity/components/MyMoneyLedger.tsx');
  assert.match(ledger, /const PAGE_SIZE = 25;/);
  assert.match(ledger, /groupByDay\(/);
  assert.match(ledger, /filterByDirection\(items, filter\)/);
  assert.doesNotMatch(ledger, /t\.count/);
  const page = source('../../app/activity/page.tsx');
  assert.match(page, /text-\[22px\] font-semibold/);
  assert.match(source('../../features/market/components/MarketPage.tsx'), /<h1 className="text-\[22px\] font-semibold/);
  assert.doesNotMatch(page, /Your records|clamp\(2\.8rem/);
});

test('a profile row that is not ready says so plainly, not only on hover, and is not a dead button', () => {
  const ui = source('../../features/profile/ui/ProfileUi.tsx');
  const soon = ui.slice(ui.indexOf('if (soon) {'), ui.indexOf('const content'));
  assert.doesNotMatch(soon, /opacity-0/);
  assert.doesNotMatch(soon, /role="button"|tabIndex/);
});

test('the trade chooser draws its arrows as icons', () => {
  for (const file of ['StartTradeSheet.tsx', 'YourTrades.tsx']) {
    assert.doesNotMatch(source(`../../features/market/components/${file}`), /→/, file);
  }
});

test('home Updates are media tiles with no generated art, a fixed media height, three to the column, and move on by themselves only while nobody is on them', () => {
  const carousel = source('../../features/home/components/UpdatesCarousel.tsx');
  assert.doesNotMatch(carousel, /update-art/);
  assert.doesNotMatch(source('../../app/globals.css'), /\.update-art/);
  // View 39: the strip pages itself, with no pause button, and holds still under
  // the pointer or focus, with reduced motion, or in a hidden tab.
  assert.match(carousel, /setInterval\(/);
  assert.match(carousel, /onPointerEnter=\{\(\) => setPaused\(true\)\}/);
  assert.match(carousel, /onFocus=\{\(\) => setPaused\(true\)\}/);
  assert.match(carousel, /updatesMayMove\(\{ paused, reducedMotion, hidden: document\.hidden \}\)/);
  assert.doesNotMatch(carousel, /aria-label=\{t\.(pause|play)/);
  assert.match(carousel, /h-\[180px\][^"]*sm:h-\[212px\]/);
  assert.match(carousel, /lg:w-\[calc\(\(100%-48px\)\/3\)\]/);
});

test('Updates tiles always show at full strength: no scroll-driven fade that can dim a card in view', () => {
  const css = source('../../app/globals.css');
  assert.doesNotMatch(css, /update-card-pass|\.update-card[^{]*\{[^}]*animation/);
});

test('phones keep the 14px floor: no rule shrinks text below the size the code asks for', () => {
  const css = source('../../app/globals.css');
  assert.doesNotMatch(css, /text-size-adjust:\s*(?!100%)\d+%/);
});

test('every balance surface offers Withdraw, the route out that works for every account, never the pooled Move', () => {
  for (const file of ['../../features/home/components/AccountHome.tsx', '../../features/money/components/MoneyHome.tsx']) {
    const src = source(file);
    assert.doesNotMatch(src, /intent=move/, file);
    assert.match(src, /\/bridge\?direction=out"/, file);
    assert.match(src, /\.withdraw\b/, file);
  }
  // Home's money moves are four round buttons; Add money is the green one (owner, 3 and 4 Nov 2026).
  const home = source('../../features/home/components/AccountHome.tsx');
  assert.equal(home.match(/<QuickAction href=/g)?.length, 4);
  assert.match(home, /<QuickAction href="\/request"/);
  assert.match(home, /<QuickAction href="\/bridge\?direction=in" icon="add" green>/);
  assert.doesNotMatch(home, /--lp-accent|--accent|variant: 'primary'/);
});

test('Send says what Available counts, so it is never read as a wrong balance', () => {
  const sheet = source('../../features/money/components/MoneySheet.tsx');
  assert.match(sheet, /t\.sheet\.available[\s\S]{0,400}<Hint[^>]*>\{t\.sheet\.availableHint\}<\/Hint>/);
});

test('Back sits on the content column: a page frame draws its own and the shell steps aside', () => {
  const frame = source('../../features/profile/ui/ProfileUi.tsx');
  const inner = frame.slice(frame.indexOf('export function ProfileFrame'), frame.indexOf('export function RowGroup'));
  assert.match(inner, /max-w-\[640px\][\s\S]*data-own-back[\s\S]*<ProductBackLink/);
  assert.match(source('./ChromeFrame.tsx'), /<ProductBackLink[^>]*shell/);
  assert.match(source('../../app/globals.css'), /main:has\(\[data-own-back\]\) \[data-shell-back\]/);
});

test('settings is a grouped list like Profile: choices open in a sheet, switches on the right, deleting asks in a sheet', () => {
  const band = source('../../features/settings/components/SettingsBand.tsx');
  assert.match(band, /<RowGroup title=\{t\.settings\.groups\.preferences\}/);
  assert.doesNotMatch(band, /<Hint/);
  assert.doesNotMatch(band, /settings\.notificationsMute\b|settings\.dangerZone/);
  // Language and theme show the current choice and open the full list in a sheet.
  assert.match(band, /label=\{t\.settings\.language\} value=\{LOCALE_NAMES\[locale\]\}/);
  assert.match(band, /<ConfirmSheetShell[^>]*open=\{sheet === 'language'\}/);
  assert.match(band, /<ConfirmSheetShell[^>]*open=\{sheet === 'theme'\}/);
  // The type-to-confirm field lives inside the delete sheet, never on the page.
  const del = band.indexOf("open={sheet === 'delete'}");
  assert.ok(del > 0 && band.indexOf('accountDeleteConfirm') > del);
  const ui = source('../../features/profile/ui/ProfileUi.tsx');
  assert.match(ui, /export function ToggleRow/);
  assert.equal(en.settings.title, 'Settings');
  assert.doesNotMatch(en.settings.accountDeleteHint, /off-chain|risk tags|Arc/);
  assert.doesNotMatch(en.settings.accountDelete, /off-chain/);
});

test('profile is tidy: one way to change the photo, rows say what they open, no address or dead rows by default', () => {
  const hub = source('../../features/profile/components/ProfileAccountHub.tsx');
  // The avatar is the one photo control: a menu once there is a photo.
  assert.match(hub, /<PhotoMenu/);
  assert.doesNotMatch(hub, /hint=\{simple\.photoHint\}/);
  assert.doesNotMatch(hub, /underline underline-offset-4">\{hub\.removePhoto\}/);
  const menu = source('../../features/profile/components/PhotoMenu.tsx');
  assert.match(menu, /role="menu"/);
  assert.match(menu, /role="menuitem"/);
  assert.doesNotMatch(hub, /hub\.devices/);
  assert.doesNotMatch(hub, /hub\.accountLabel|shortAddress\(address\)\}/);
});

test('profile says each thing once: one Your record row, Edit profile in the header, no payment request or open deals rows', () => {
  const hub = source('../../features/profile/components/ProfileAccountHub.tsx');
  // Edit profile is the header's one button, not a row further down.
  assert.match(hub, /href="\/profile\/edit"[^>]*>\{hub\.editProfile\}<\/Link>/);
  assert.doesNotMatch(hub, /label=\{hub\.editProfile\}/);
  // The record is one line that opens its own page; the numbers and the rest live there (view 48, batch 9e).
  assert.match(hub, /<Row label=\{pp\.yourRecord\} value=\{summary \?\? undefined\} href=\{`\/credit-passport\/\$\{address\}`\} \/>/);
  for (const piece of ['<RecordStats', 'pp.publicView', 'legacyContracts', 'pp.share']) assert.ok(!hub.includes(piece), piece);
  // Said elsewhere already: Deals has open deals, Home and Money ask for a payment.
  assert.doesNotMatch(hub, /hub\.openDeals|payLink\.create\.title/);
  assert.doesNotMatch(hub, /<RowGroup title=\{pp\.yourOffers\}>/);
  // Buying, selling and the money sit in one Trade and money group (owner, 3 Nov 2026).
  const trade = hub.slice(hub.indexOf('<RowGroup title={pp.tradeAndMoney}>'));
  assert.ok(hub.includes('<RowGroup title={pp.tradeAndMoney}>'));
  const group = trade.slice(0, trade.indexOf('</RowGroup>'));
  for (const piece of ['pp.balance', 'pp.withAgents', 'dealGuarantee', 'pp.buying', 'pp.selling', 'simple.agentsTitle', 'hub.activityReceipts']) assert.ok(group.includes(piece), piece);
  assert.doesNotMatch(hub, /<RowGroup title=\{pp\.selling\}>|<RowGroup title=\{hub\.money\}>/);
  // One agent row, not two that open the same page (owner, 3 Nov 2026).
  assert.equal(hub.split('simple.agentsTitle').length - 1, 1);
  assert.doesNotMatch(hub, /howAgentTrades/);
});

test('money is one balance on Arc: a transfer balance line, no list of other networks, local currency marked soon', () => {
  const money = source('../../features/money/components/MoneyHome.tsx');
  assert.doesNotMatch(money, /useChainBalances|money-networks|CHAIN_META/);
  assert.match(money, /data-gateway-balance[\s\S]{0,200}t\.home\.gatewayBalance/);
  assert.match(money, /t\.home\.localCurrencySoon/);
  assert.equal(en.money.home.gatewayBalance, 'Transfer balance');
});

test('the rail foot reads the person, then Sign out; no settings mark is a sun', () => {
  const nav = source('./TopNav.tsx');
  const rail = nav.slice(nav.indexOf('function WorkspaceRail('), nav.indexOf('function RailLink('));
  const foot = rail.slice(rail.indexOf('data-rail-footer'));
  const person = foot.indexOf('<RailProfile');
  assert.ok(person > -1 && person < foot.indexOf('<RailAction'));
  // The old settings mark was a circle with eight rays: the theme sun.
  assert.doesNotMatch(nav, /M6 6l1\.6 1\.6/);
});

test('languages are one list, a check on the current one, never an orphan tile centred alone', () => {
  const picker = source('../../features/settings/components/LanguagePicker.tsx');
  assert.match(picker, /role="radiogroup"/);
  assert.match(picker, /role="radio"/);
  assert.doesNotMatch(picker, /last:odd/);
});

test('the desktop rail ends with the person and Sign out, pinned to its foot, sign out asking first like Profile', () => {
  const nav = source('./TopNav.tsx');
  const rail = nav.slice(nav.indexOf('function WorkspaceRail('), nav.indexOf('function RailLink('));
  assert.match(rail, /data-rail-footer[^>]*mt-auto/);
  // Settings live inside Profile, reached from the person at the foot (view 44).
  assert.doesNotMatch(rail, /href="\/settings"/);
  assert.match(nav, /data-rail-profile/);
  assert.match(rail, /useSignOutRequest\(\)/);
  const profile = source('../../features/profile/components/ProfileSignOut.tsx');
  assert.match(profile, /useSignOutRequest\(\)/);
});

test('the deals on Home: the one that needs you as a card, then On the way, each under one heading line', () => {
  const home = source('../../features/home/components/HomeDeals.tsx');
  assert.equal(home.match(/<Heading id=/g)?.length, 2);
  assert.match(home, /variant=\{preview\.needsYou\.row\.move \? 'feature' : 'card'\}/);
  assert.match(home, /variant="row"/);
  assert.match(home, /<Link href="\/deals"/);
});

test('an X photo is fetched with no referrer, since X refuses images asked for from karwan.site', () => {
  for (const file of [
    '../../features/profile/components/ConnectXButton.tsx',
    '../../features/profile/components/ProfileAccountHub.tsx',
    './TopNav.tsx',
    // The other side's photo on deals, chat, pay links and passports.
    './PersonAvatar.tsx',
    './ProfileAvatar.tsx',
    '../../features/payLink/PayRequestView.tsx',
    '../../features/reputation/components/CreditPassport.tsx',
  ]) {
    const imgs = source(file).match(/<img\b[^>]*>/g) ?? [];
    assert.ok(imgs.length > 0, file);
    for (const img of imgs) assert.match(img, /referrerPolicy="no-referrer"/, `${file}: ${img}`);
  }
});
