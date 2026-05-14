import type { Metadata } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import './globals.css';
import { TopNav } from '@/shared/components/TopNav';
import { ProfileNudge } from '@/shared/components/ProfileNudge';
import { SiteFooter } from '@/shared/components/SiteFooter';
import { AppProviders } from '@/shared/components/AppProviders';

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

export const metadata: Metadata = {
  title: 'Karwan · cross-border SME settlement',
  description:
    'Agent-mediated, USDC-settled, milestone-escrowed deals on Arc. Built on Circle. For the MEASA corridor.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('karwan-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`,
          }}
        />
        {/* General Sans — the Phantom-grade display/body grotesk, from Fontshare. */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap"
        />
      </head>
      <body>
        <AppProviders>
          {/* overflow-x-clip lets full-bleed sections span the viewport without
              triggering horizontal scroll, and unlike overflow-hidden it does
              not break the sticky TopNav. */}
          <div className="min-h-screen flex flex-col overflow-x-clip">
            <TopNav />
            <ProfileNudge />
            <main className="flex-1 mx-auto max-w-6xl w-full px-6 py-10">{children}</main>
            <SiteFooter />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
