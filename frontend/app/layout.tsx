import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { DEFAULT_LOCALE } from '@/shared/i18n/locales';
import './globals.css';
import { TopNav } from '@/shared/components/TopNav';
import { ProfileNudge } from '@/shared/components/ProfileNudge';
import { SiteFooter } from '@/shared/components/SiteFooter';
import { AppProviders } from '@/shared/components/AppProviders';
import { ChromeFrame } from '@/shared/components/ChromeFrame';
import { NotificationToasts } from '@/features/notifications/components/NotificationToasts';
import { GuideWelcome } from '@/shared/guide/GuideWelcome';
import { TermsModal } from '@/shared/components/TermsModal';
import { ScrollbarWidthProbe } from '@/shared/components/ScrollbarWidthProbe';
import { SpeedInsights } from '@vercel/speed-insights/next'

// Geist, Geist Mono, and Instrument Serif are self-hosted (woff2 in ./fonts)
// instead of pulled from next/font/google. The Google fetch runs at build time
// and fails in network-restricted build environments (the local Docker image
// could not reach fonts.googleapis.com). Serving them same-origin matches the
// General Sans treatment below and makes the build offline-safe.
const geist = localFont({
  src: [{ path: './fonts/Geist-Variable.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-geist',
  display: 'swap',
});
const geistMono = localFont({
  src: [{ path: './fonts/GeistMono-Variable.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-geist-mono',
  display: 'swap',
});
const instrumentSerif = localFont({
  src: [
    { path: './fonts/InstrumentSerif-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/InstrumentSerif-Italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-instrument-serif',
  display: 'swap',
});

// General Sans, self-hosted. Previously pulled from Fontshare via a
// render-blocking third-party stylesheet with no metric-matched fallback, which
// reflowed every headline + paragraph on swap (the dominant CLS source).
// next/font/local serves it same-origin and generates a size-adjusted Arial
// fallback so the swap is near-shift-free.
const generalSans = localFont({
  src: [
    { path: './fonts/GeneralSans-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/GeneralSans-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/GeneralSans-Semibold.woff2', weight: '600', style: 'normal' },
    { path: './fonts/GeneralSans-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-general-sans',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

const SITE_URL = 'https://karwan.site';
const TITLE = 'Karwan · cross-border SME settlement';
const DESCRIPTION =
  'Agent-mediated, USDC-settled, milestone-escrowed deals on Arc. Built on Circle.';

/// Viewport tag lives in its own export per the Next.js 15 metadata split.
/// themeColor reads as #0e0e0e so Android Chrome paints the address bar in
/// brand ink rather than the default white.
export const viewport: import('next').Viewport = {
  themeColor: '#0e0e0e',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  /// Web app manifest covers the PWA install icons (192 and 512) that Next.js
  /// does not generate from app/icon.svg automatically. Browser favicon and
  /// Apple touch icon are still picked up from app/icon.svg and
  /// app/apple-icon.png.
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/icon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Karwan',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    site: '@karwanBuild',
    creator: '@karwanBuild',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The layout used to read the karwan-locale cookie at SSR via `await
  // cookies()` so that <html lang/dir> shipped correctly on the first paint.
  // That single call forced every route into dynamic rendering on Vercel,
  // which pushed TTFB into the 2-4s range across the site (Speed Insights
  // showed /docs/reputation 4.24s, /market 3.93s, /onboarding 3.29s, etc).
  // The layout now ships statically. A tiny pre-hydration inline script in
  // <head> reads the cookie on the client and applies <html lang/dir> BEFORE
  // the first paint, so Arabic + other RTL locales still avoid the visual
  // layout jolt. Translations briefly render in English on first paint for
  // non-English users before the LocaleProvider's mount effect swaps to the
  // cookie locale (handled in shared/i18n/LocaleProvider.tsx). The TTFB win
  // is global; the text flash is bounded to ~80-200ms and only affects
  // returning non-English users.
  return (
    <html
      lang={DEFAULT_LOCALE}
      dir="ltr"
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable} ${generalSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('karwan-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`,
          }}
        />
        {/* Pre-hydration locale flip. Reads the karwan-locale cookie and
            applies <html lang/dir> before the React tree paints, so RTL
            users (Arabic) don't see an LTR → RTL jolt mid-frame. The
            translations still re-render after hydration, but the layout
            direction is already correct. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=document.cookie.split(';').map(function(s){return s.trim();}).find(function(s){return s.indexOf('karwan-locale=')===0;});if(!c)return;var v=decodeURIComponent(c.slice('karwan-locale='.length));var rtl={ar:1};if(['en','ar','fr','hi','sw'].indexOf(v)<0)return;document.documentElement.lang=v;document.documentElement.dir=rtl[v]?'rtl':'ltr';}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <AppProviders initialLocale={DEFAULT_LOCALE}>
          <ScrollbarWidthProbe />
          {/* No overflow clip here on purpose: full-bleed sections use the
              scrollbar-aware `.w-bleed` width so they don't over-shoot at normal
              zoom, and leaving overflow visible lets the page show a real
              horizontal scrollbar when zoomed in far enough to clip content, so
              nothing is ever unreachable. */}
          <ChromeFrame
            topNav={<TopNav />}
            profileNudge={<ProfileNudge />}
            footer={<SiteFooter />}
            notifications={<NotificationToasts />}
            guide={<GuideWelcome />}
            terms={<TermsModal />}
          >
            {children}
          </ChromeFrame>
        </AppProviders>
        <SpeedInsights />
      </body>
    </html>
  );
}
