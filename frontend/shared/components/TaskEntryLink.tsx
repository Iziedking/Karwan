'use client';

import { Suspense, useEffect, useState, type ComponentProps } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { publicTaskEntry } from '@/shared/auth/signInHref';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: string };

/// Sent after a page rewrites its own address in place (the market search),
/// so the sign-in link carries the latest search without waiting for Next.
export const ADDRESS_CHANGED = 'karwan:address';

/// Only this link waits for the browser query; the public header keeps its server layout.
export function TaskEntryLink(props: Props) {
 return <Suspense fallback={<Link {...props} />}><ContextEntry {...props} /></Suspense>;
}

function ContextEntry({ href, ...props }: Props) {
 const path = usePathname();
 const search = useSearchParams().toString();
 const [live, setLive] = useState<string | null>(null);
 useEffect(() => {
  const update = () => setLive(window.location.pathname + window.location.search + window.location.hash);
  update();
  window.addEventListener('hashchange', update);
  window.addEventListener('popstate', update);
  window.addEventListener(ADDRESS_CHANGED, update);
  return () => {
   window.removeEventListener('hashchange', update);
   window.removeEventListener('popstate', update);
   window.removeEventListener(ADDRESS_CHANGED, update);
  };
 }, [path, search]);
 return <Link {...props} href={publicTaskEntry(href, live ?? path + (search ? '?' + search : ''))} />;
}
