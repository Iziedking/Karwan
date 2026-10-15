'use client';
import { useEffect, useState } from 'react';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import { START_ROUTE, WALLET_HOME } from '@/shared/utils/routes';
import { entryHref, wasSignedIn } from './signedInHint';

/// Where an "Open Karwan" link goes. Signed out on the server and on first
/// paint; a browser that was signed in last time goes straight to the app
/// instead of through the sign-in page. No sign-in call is made here.
export function useEntryHref(): string {
  const [href, setHref] = useState(START_ROUTE);
  useEffect(() => {
    setHref(entryHref(wasSignedIn(), DEALS_AVAILABLE ? '/app' : WALLET_HOME));
  }, []);
  return href;
}
