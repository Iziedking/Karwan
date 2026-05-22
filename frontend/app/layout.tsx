import type { Metadata } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import { TopNav } from '@/shared/components/TopNav';
import { ProfileNudge } from '@/shared/components/ProfileNudge';
import { SiteFooter } from '@/shared/components/SiteFooter';
import { AppProviders } from '@/shared/components/AppProviders';
import { NotificationToasts } from '@/features/notifications/components/NotificationToasts';
import { GuideWelcome } from '@/shared/guide/GuideWelcome';
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
  'Agent-mediated, USDC-settled, milestone-escrowed deals on Arc. Built on Circle. For the MEASA corridor.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
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
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable} ${generalSans.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('karwan-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <AppProviders>
          <ScrollbarWidthProbe />
          {/* No overflow clip here on purpose: full-bleed sections use the
              scrollbar-aware `.w-bleed` width so they don't over-shoot at normal
              zoom, and leaving overflow visible lets the page show a real
              horizontal scrollbar when zoomed in far enough to clip content, so
              nothing is ever unreachable. */}
          <div className="min-h-screen flex flex-col">
            <TopNav />
            <ProfileNudge />
            <main className="flex-1 mx-auto max-w-6xl w-full px-6 py-10">{children}</main>
            <SiteFooter />
            <NotificationToasts />
            <GuideWelcome />
          </div>
        </AppProviders>
        <SpeedInsights />
      </body>
    </html>
  );
}
