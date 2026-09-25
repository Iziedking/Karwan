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

test('editorial copy leads with Arc while network disclosures retain environment/payment limits', () => {
  const keys = Object.keys(en.landingEditorial).sort();
  for (const locale of [ar, fr, hi, sw]) assert.deepEqual(Object.keys(locale.landingEditorial).sort(), keys);
  assert.equal(en.networkUi.builtOnArc, 'Built on Arc');
  assert.match(en.networkUi.testnetNotice, /no real monetary value/);
  assert.doesNotMatch(Object.values(en.landingEditorial).join(' '), /testnet/i);
  assert.match(en.landingEditorial.limitBody, /including the final one/);
  assert.match(en.landingEditorial.limitBody, /does not issue an automatic refund/);
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
  assert.match(activity, /rounded-\[10px\]/);
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
  assert.match(hub, /<WalletAvatar address=\{address\} size=\{72\}/);
  assert.match(hub, /type="file" accept="image\/jpeg,image\/png,image\/webp"/);
});

test('stake keeps agent linking inside the stake panel and balances the two columns', () => {
  const page = source('../../app/stake/page.tsx');
  const stake = source('../../features/reputation/components/StakeCard.tsx');
  const binding = source('../../features/reputation/components/AgentStakeBinding.tsx');
  assert.doesNotMatch(page, /<AgentStakeBinding/);
  assert.match(stake, /<AgentStakeBinding\s*\/>/);
  assert.match(page, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]/);
  assert.match(page, /\[grid-area:stake-body\][\s\S]*?<StakeCard\s*\/>/);
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
  assert.match(home, /currentDeal = activeDeals\[0\] \?\? null/);
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
    assert.notEqual(locale.account.page.intro, en.account.page.intro);
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

test('reviewed light theme text, selected controls, and field edges meet contrast thresholds', () => {
  const css = source('../../app/globals.css');
  const token = (name: string) => css.match(new RegExp(`${name}:\\s*(#[a-fA-F0-9]{6})`))![1];
  const paper = token('--karwan-canvas');
  const card = token('--karwan-card');
  assert.equal(paper.toUpperCase(), '#C7D3E2');
  assert.equal(card.toUpperCase(), '#F4F4F1');
  for (const surface of [paper, card]) {
    for (const name of ['--lp-text-sub','--ink-inv-2','--lp-workspace-faint','--lp-accent-on-light']) assert.ok(contrast(token(name),surface) >= 4.5, name);
    assert.ok(contrast(token('--lp-field-border'),surface) >= 3);
  }
  assert.ok(contrast(token('--accent-ink'),token('--karwan-green')) >= 4.5);
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
  assert.match(gate, /<LoginModal open=\{open\}/);
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
