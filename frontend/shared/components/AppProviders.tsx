'use client';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { RainbowKitProvider, lightTheme, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { wagmiConfig } from '@/core/wagmi';
import { makeQueryClient } from '@/core/queryClient';
import { makeQueryPersister, persistOptions } from '@/core/queryPersister';
import { QueryInvalidator } from '@/core/queryInvalidator';
import { LocaleProvider } from '@/shared/i18n/LocaleProvider';
import { GuideProvider } from '@/shared/guide/GuideProvider';
import { SiweGate } from '@/shared/components/SiweGate';
import type { Locale } from '@/shared/i18n/locales';

type Mode = 'light' | 'dark';

export function AppProviders({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [queryClient] = useState(() => makeQueryClient());
  const [mode, setMode] = useState<Mode>('light');

  /// The persister is built lazily so it only constructs on the client
  /// (localStorage isn't available during SSR). When null (SSR or storage
  /// disabled) fall through to the plain QueryClientProvider so the app
  /// still works without persistence.
  const persister = useMemo(() => makeQueryPersister(), []);

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

  const inner = (
    <RainbowKitProvider theme={theme} modalSize="compact" appInfo={{ appName: 'Karwan' }}>
      <SiweGate />
      <QueryInvalidator />
      <GuideProvider>{children}</GuideProvider>
    </RainbowKitProvider>
  );

  return (
    <LocaleProvider initialLocale={initialLocale}>
      <WagmiProvider config={wagmiConfig}>
        {persister ? (
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister, ...persistOptions }}
          >
            {inner}
          </PersistQueryClientProvider>
        ) : (
          <QueryClientProvider client={queryClient}>{inner}</QueryClientProvider>
        )}
      </WagmiProvider>
    </LocaleProvider>
  );
}
