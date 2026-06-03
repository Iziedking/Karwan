import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import localFont from 'next/font/local';
import { DEFAULT_LOCALE, isLocale, isRtl, type Locale } from '@/shared/i18n/locales';
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

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
});
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the locale cookie at SSR so <html lang/dir> ships correctly on first
  // paint. Without this, the page renders LTR, then the LocaleProvider client
  // effect flips dir mid-frame, which jolts the layout and pushes the initial
  // scroll position to the wrong edge for RTL locales.
  const cookieStore = await cookies();
  const rawLocale = cookieStore.get('karwan-locale')?.value;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const dir = isRtl(locale) ? 'rtl' : 'ltr';

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable} ${generalSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('karwan-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <AppProviders initialLocale={locale}>
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
