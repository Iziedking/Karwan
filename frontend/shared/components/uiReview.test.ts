import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  assert.match(en.landingEditorial.trade, /market and deal flow are available on testnet/);
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
  const socialExamples = source('../i18n/messages/socialTrade.ts');

  assert.doesNotMatch(analyticsPage, /publicApiUrl|CheckIt|raw figures/);
  assert.match(analyticsCopy, /Every figure is read from Karwan's contracts on Arc\./);
  assert.match(networkContext, /network\.environment !== 'mainnet'/);
  assert.match(networkContext, /network\.environment !== 'mainnet' &&/);
  assert.match(nudge, /grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
  assert.match(nudge, /stepTwo/);
  assert.match(history, /width: 'min\(640px, 100vw\)'/);
  assert.match(history, /var\(--ink-secondary\)/);
  assert.doesNotMatch(history, /--lp-workspace-raised|--ink-3/);
  assert.match(socialExamples, /disclaimer: 'Illustrative trades'/);
});

test('landing respects reduced motion and blends its full-screen film into content', () => {
  const page = source('../../app/page.tsx');
  const css = source('../../app/landing.module.css');
  assert.match(page, /prefers-reduced-motion/);
  assert.match(page, /visibilitychange/);
  assert.doesNotMatch(page, /aria-pressed=\{paused\}|videoControl/);
  assert.match(css, /min-height: calc\(100svh - var\(--lp-nav-h,73px\)\)/);
  assert.match(css, /mask-image: linear-gradient\(to bottom,#000 0%,#000 calc\(100% - 12px\),transparent 100%\)/);
  assert.doesNotMatch(css, /\.media::after \{[^}]*linear-gradient/);
  assert.doesNotMatch(page, /heroBottom/);
  assert.doesNotMatch(css, /\.intro,\.record,\.closing \{ min-height: 100svh/);
  assert.doesNotMatch(page + css, /usePanelSnap|scroll-snap-type/);
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

test('account setup explains payment stages at the label and shows verification timing once', () => {
  const onboarding = source('../../app/onboarding/page.tsx');
  assert.match(onboarding, /hint=\{ps\.matching\.milestonePresetsHint\}/);
  assert.doesNotMatch(onboarding, /\{ats\.note\}/);
  assert.match(en.onboarding.accountTypeStep.description, /verification/);
});

test('profile photo is a user-initiated saved image with a generated fallback', () => {
  const hub = source('../../features/profile/components/ProfileAccountHub.tsx');
  assert.match(hub, /api\.setProfileAvatar\(address, imageDataUrl\)/);
  assert.match(hub, /profile\.profileImageDataUrl/);
  assert.match(hub, /<WalletAvatar address=\{address\} size=\{56\}/);
  assert.match(hub, /type="file" accept="image\/jpeg,image\/png,image\/webp"/);
});

test('stake keeps agent linking inside the stake panel', () => {
  const page = source('../../app/stake/page.tsx');
  const stake = source('../../features/reputation/components/StakeCard.tsx');
  const binding = source('../../features/reputation/components/AgentStakeBinding.tsx');
  assert.doesNotMatch(page, /<AgentStakeBinding/);
  assert.match(stake, /<AgentStakeBinding\s*\/>/);
  assert.match(page, /<StakeCard\s*\/>/);
  assert.match(binding, /\{done \? t\.doneCta : busy \? t\.busyCta : t\.cta\}/);
  assert.doesNotMatch(binding, /\{t\.title\}|\{t\.body\}|\{t\.tag\}/);
  assert.equal(en.agentStakeBinding.cta, 'Link agent');
});

test('setup ends in a preferences review before the existing submit action', () => {
  const page = source('../../app/onboarding/page.tsx');
  assert.match(page, /type ProfilePanel = [^;]*'review'/);
  assert.match(page, /currentPanel === 'review' \? props.canSubmit/);
  assert.match(page, /currentPanel === 'review' && <ProfileSection/);
  assert.match(page, /panel === 3 && <ProfileSection/);
  assert.match(page, /else props.onSubmit\(\)/);
});

test('documentation returns to a useful internal destination', () => {
  assert.equal(getProductBackHref('/docs', true), '/app');
  assert.equal(getProductBackHref('/docs', false), '/');
  assert.equal(getProductBackHref('/docs/escrow', false), '/docs');
  assert.equal(getProductBackHref('/how-it-works', true), '/app');
});

test('workspace width is column-bound and tablet navigation fills the rail gap', () => {
  const css = source('../../app/globals.css');
  assert.match(css, /\[data-workspace-main='true'\] \.w-bleed\s*\{\s*width: 100%;/);
  assert.match(css, /\[data-workspace-main='true'\] \.w-bleed\s*\{[^}]*--tw-translate-x: 0px;/);
  assert.match(source('./WorkspaceBottomNav.tsx'), /lg:hidden/);
});

test('signed-in business trade is a rail-bound action list, not three landing cards', () => {
  const page = source('../../app/b2b/page.tsx');
  assert.doesNotMatch(page, /FullBleed|<Band|DeskCard/);
  assert.match(page, /max-w-\[1100px\]/);
  assert.match(page, /<nav aria-label=\{bt\.eyebrow\}/);
  for (const route of ['/partners', '/supply', '/buyer?mode=direct']) assert.ok(page.includes(route));
});

test('signed-in home splits only when the content column has room', () => {
  const css = source('../../app/globals.css');
  const home = source('../../features/home/components/AccountHome.tsx');
  assert.match(css, /\.home-workbench\s*\{[^}]*container-type: inline-size;/);
  assert.match(css, /@container \(min-width: 1080px\)\s*\{\s*\.home-command-grid/);
  assert.match(css, /\.home-deals-grid\s*\{\s*grid-template-columns:/);
  assert.match(home, /currentDeal && showRecentDeals \? 'home-deals-grid grid gap-5' : ''/);
  assert.match(home, /currentDeal = pickCurrentDeal\(deals\)/);
  assert.match(home, /recentDeals = currentDeal \? deals\.filter\(\(deal\) => deal\.jobId !== currentDeal\.jobId\) : deals/);
  assert.doesNotMatch(home, /lg:grid-cols-\[minmax\(0,0\.92fr\)/);
});

test('business directory reads as open records without nested card scrollbars', () => {
  const partners = source('../../features/partners/components/PartnersBrowse.tsx');
  assert.match(partners, /<h1[^>]*>\s*\{copy\.directoryTitle\}/);
  assert.match(partners, /<article className="border-b/);
  assert.match(partners, /<dl className="mt-6 grid/);
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

test('the landing trade example keeps its explanatory copy readable', () => {
  const social = source('../../features/home/components/SocialTradeSection.module.css');
  for (const selector of ['.phoneBrand > span:last-child', '.source small', '.handoff', '.draft', '.terms dt', '.milestoneLabel', '.review']) {
    assert.match(social, new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{[^}]*font-size: 12px`));
  }
  assert.match(social, /\.disclaimer \{[^}]*font-size: 16px/);
});

test('the shared navbar cycles through three persisted appearance choices without a popover', () => {
  const nav = source('./TopNav.tsx');
  const control = source('./ThemeControl.tsx');
  const picker = source('../../features/settings/components/ThemePicker.tsx');
  assert.match(nav, /isAlwaysDarkRoute\(pathname\) \? null : <ThemeControl \/>/);
  assert.match(control, /system: 'light'/);
  assert.match(control, /light: 'dark'/);
  assert.match(control, /dark: 'system'/);
  assert.match(control, /setThemePreference\(next\)/);
  assert.doesNotMatch(control, /ThemePicker|aria-expanded|navbar-theme-options/);
  assert.match(picker, /value: 'system'/);
  assert.match(picker, /value: 'light'/);
  assert.match(picker, /value: 'dark'/);
  assert.equal(en.settings.themeLight, 'Light');
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
    for (const surfaceName of ['--canvas', '--surface']) {
      const background = resolve(surfaceName);
      const field = composite(resolve('--tint'), background);
      for (const name of ['--ink', '--lp-text-sub', '--lp-workspace-faint', '--color-offer', '--color-request', '--color-positive', '--color-warning', '--color-critical']) {
        assert.ok(contrast(hex(composite(resolve(name), background)), hex(background)) >= 4.5, `${theme} ${surfaceName} ${name}`);
      }
      assert.ok(contrast(hex(composite(resolve('--lp-field-border'), field)), hex(field)) >= 3, `${theme} field edge`);
      assert.ok(contrast(hex(composite(resolve('--lp-text-muted'), field)), hex(field)) >= 4.5, `${theme} placeholder`);
    }
    assert.ok(contrast(hex(resolve('--accent-ink')), hex(resolve('--karwan-green'))) >= 4.5, `${theme} action label`);
    assert.ok(contrast(hex(resolve('--lp-selected-bg')), hex(resolve('--lp-selected-ink'))) >= 4.5, `${theme} selected label`);
  }
});

test('market price and unit stay together while the account label can truncate', () => {
  const market = source('../../features/listings/components/ListingsBrowse.tsx');
  assert.match(market, /<p className="flex min-w-0 shrink-0 items-baseline gap-1\.5"/);
  assert.match(market, /<span className="whitespace-nowrap text-\[13px\] text-\[var\(--ink-secondary\)\]"/);
  assert.match(market, /truncate text-\[13px\] text-\[var\(--ink-secondary\)\]/);
});

test('account action is Move and keeps its existing route', () => {
  const account = source('../../features/account/AccountPageV1.tsx');
  const transfer = source('../../app/bridge/page.tsx');
  assert.equal(en.accountHome.move, 'Move');
  assert.match(account, /href="\/bridge\?direction=out&intent=move" label=\{messages\.accountHome\.move\}/);
  assert.doesNotMatch(account, /Withdraw from Gateway/);
  assert.match(transfer, /outIntent === 'move' \? header\.titleMove/);
  assert.equal(en.bridge.header.titleMove, 'Move USDC');
});

test('the transfer header speaks of one balance, never the Gateway pool', () => {
  const transfer = source('../../app/bridge/page.tsx');
  assert.doesNotMatch(transfer, /Gateway balance/);
  for (const locale of [en, ar, fr, hi, sw]) {
    assert.doesNotMatch(Object.values(locale.bridge.header).join(' '), /Gateway/);
    assert.doesNotMatch(locale.account.page.moveHelp, /Gateway/);
  }
});

test('public and workspace backgrounds follow the same selected theme', () => {
  const nav = source('./TopNav.tsx');
  const footer = source('./SiteFooter.tsx');
  const landing = source('../../app/landing.module.css');
  const social = source('../../features/home/components/SocialTradeSection.module.css');
  const protection = source('../../features/home/components/ProtectionSection.module.css');
  assert.doesNotMatch(nav, /LANDING_NAV_VARS/);
  assert.doesNotMatch(footer, /LANDING_FOOTER_VARS/);
  assert.match(landing, /--landing-paper: var\(--lp-light\)/);
  assert.match(landing, /\.record \{ background: var\(--lp-card\); color: var\(--lp-dark\)/);
  assert.match(social, /html:not\(\[data-theme='dark'\]\)/);
  assert.match(protection, /html:not\(\[data-theme='dark'\]\)/);
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

test('dark sign-in card uses slate surfaces and reserves brand green for an available action', () => {
  const css = source('../../app/globals.css');
  const modal = source('./LoginModal.tsx');
  const darkDialog = css.match(/html\[data-theme="dark"\] \.auth-capsule \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(darkDialog);
  const token = (name: string) => darkDialog.match(new RegExp(`${name}:\\s*(#[a-fA-F0-9]{6})`))?.[1];
  const card = token('--lp-card');
  const field = token('--lp-field');
  assert.ok(card && field);
  assert.notEqual(card.toLowerCase(), '#151b17');
  assert.ok(contrast(token('--lp-dark')!, card) >= 4.5);
  assert.ok(contrast(token('--lp-text-sub')!, card) >= 4.5);
  assert.ok(contrast(token('--lp-text-muted')!, field) >= 4.5);
  assert.ok(contrast(token('--lp-field-border')!, field) >= 3);
  assert.match(modal, /auth-email-continue/);
  assert.match(css, /html\[data-theme="dark"\] \.auth-capsule \.auth-email-continue:disabled \{[\s\S]*?background: var\(--lp-light\)/);
  assert.match(modal, /bg-\[var\(--lp-accent\)\] text-\[var\(--accent-ink\)\]/);
});

test('signed-out entry is a focused account-access page, not a second landing', () => {
  const gate = source('./SignInGate.tsx');
  const css = source('./SignInGate.module.css');
  assert.match(gate, /<h1 className=\{styles\.headline\}>/);
  assert.match(gate, /window\.location\.assign\(START_ROUTE\)/);
  assert.doesNotMatch(gate, /LoginModal/);
  assert.match(gate, /<Link href="\/market">\{copy\.browseLink\}<\/Link>/);
  assert.doesNotMatch(gate, /<figure|example\.note|agreementSubject/);
  assert.doesNotMatch(gate, /setInterval|motion\.div/);
  assert.match(css, /min-height: calc\(100svh - var\(--lp-nav-h, 72px\)\)/);
  assert.match(css, /width: min\(100%, 650px\)/);
  assert.match(css, /margin-inline-start: calc\(50% - 50vw\)/);
  assert.doesNotMatch(gate, /left-1\/2 w-bleed -translate-x-1\/2/);
  assert.match(css, /background-color: var\(--karwan-canvas\)/);
  assert.match(css, /background-image: url\('\/brand\/karwan-matte-grain\.svg'\)/);
  assert.doesNotMatch(en.auth.signInGate.heroBody, /\u2014/);
});

test('footer keeps the canonical brand and treats its motion as optional decoration', () => {
  const footer = source('./SiteFooter.tsx');
  const css = source('./SiteFooter.module.css');
  assert.match(footer, /<Brand \/>/);
  assert.match(footer, /<NetworkContext disclosure \/>/);
  assert.match(footer, /api.subscribeNewsletter\(value\)/);
  assert.match(footer, /prefers-reduced-motion: reduce/);
  assert.match(footer, /visibilitychange/);
  assert.match(footer, /IntersectionObserver/);
  assert.match(footer, /data-running=\{running\}/);
  assert.doesNotMatch(footer, /motionControl|aria-pressed=\{paused\}/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation-play-state: paused/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /background: var\(--lp-card\)/);
  assert.match(css, /min-height: 100svh/);
});

test('reputation badges and the app shell never leave a person on a bare number or an endless wait', () => {
  const badge = source('../../features/reputation/components/ReputationBadge.tsx');
  const cells = badge.slice(badge.indexOf('const badgeCells'), badge.indexOf('if (!withDetail)'));
  assert.doesNotMatch(cells, /\{score\}/);
  assert.match(source('../../app/not-found.tsx'), /pageNotFound/);
  assert.doesNotMatch(source('../../app/app/page.tsx'), />Account home</);
});

test('the deal page shows dated steps, keeps messages one tap away, and puts the chat beside the deal on desktop', () => {
  const hero = source('../../features/deals/workspace/DealHero.tsx');
  assert.match(hero, /<DealTimeline/);
  assert.doesNotMatch(hero, /className="mt-6 flex gap-1\.5"/);
  assert.match(hero, /aria-label=\{fill\(dl\.message/);
  assert.doesNotMatch(hero, /key: 'messages' as const/);
  assert.match(source('../../features/deals/workspace/DealWorkspace.tsx'), /desktop && address \? \([\s\S]*?<ChatPanel/);
});

test('recent trades lead with what the deal is and who it is with, without numbering or text arrows', () => {
  const home = source('../../features/home/components/AccountHome.tsx');
  const rows = home.slice(home.indexOf('const counterparty = deal.counterpartyName'));
  assert.match(rows, /dealHeadline\(deal\.terms\)/);
  assert.match(rows, /<PersonAvatar/);
  assert.doesNotMatch(rows, /padStart\(2, '0'\)/);
  assert.doesNotMatch(home, /→/);
});

test('a ledger row is one tap to its receipt, in plain words, with proof and reference inside the receipt', () => {
  const ledger = source('../../features/activity/components/MyMoneyLedger.tsx');
  assert.match(ledger, /ledgerRowText\(ledgerLine\(item, t\.text\)\)/);
  assert.doesNotMatch(ledger, /\{t\.viewProof\}/);
  assert.doesNotMatch(ledger, /copyReference/);
  assert.match(ledger, /proofHref=\{explorerFor\(selectedReceipt\)\}/);
});

test('a profile row that is not ready says so plainly, not only on hover, and is not a dead button', () => {
  const ui = source('../../features/profile/ui/ProfileUi.tsx');
  const soon = ui.slice(ui.indexOf('if (soon) {'), ui.indexOf('const content'));
  assert.doesNotMatch(soon, /opacity-0/);
  assert.doesNotMatch(soon, /role="button"|tabIndex/);
});

test('the trade chooser offers two equal choices, so neither is painted as the primary action', () => {
  const css = source('../../app/globals.css');
  const arrow = css.slice(css.indexOf('.trade-intent-action-arrow {'), css.indexOf('}', css.indexOf('.trade-intent-action-arrow {')));
  assert.doesNotMatch(arrow, /var\(--lp-accent\)/);
});

test('carousel dots are full-size tap targets and the trade chooser draws its arrows as icons', () => {
  const carousel = source('../../features/home/components/UpdatesCarousel.tsx');
  assert.doesNotMatch(carousel, /className="grid size-6 place-items-center/);
  assert.doesNotMatch(source('../../features/home/components/TradeDesk.tsx'), /→/);
});
