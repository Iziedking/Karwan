'use client';
import { ReactNode, useEffect, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, lightTheme, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { wagmiConfig } from '@/core/wagmi';
import { LocaleProvider } from '@/shared/i18n/LocaleProvider';
import { GuideProvider } from '@/shared/guide/GuideProvider';

type Mode = 'light' | 'dark';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [mode, setMode] = useState<Mode>('light');

  useEffect(() => {
    const root = document.documentElement;
    const read = (): Mode => (root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    setMode(read());
    const observer = new MutationObserver(() => setMode(read()));
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const theme =
    mode === 'dark'
      ? darkTheme({
          accentColor: '#ededed',
          accentColorForeground: '#0c0e10',
          borderRadius: 'medium',
          fontStack: 'system',
        })
      : lightTheme({
          accentColor: '#0c0e10',
          accentColorForeground: '#ffffff',
          borderRadius: 'medium',
          fontStack: 'system',
        });

  return (
    <LocaleProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider theme={theme} modalSize="compact" appInfo={{ appName: 'Karwan' }}>
            <GuideProvider>{children}</GuideProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </LocaleProvider>
  );
}
