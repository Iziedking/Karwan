'use client';

import { Suspense, useEffect, useState, type ComponentProps } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { publicTaskEntry } from '@/shared/auth/signInHref';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: string };

/// Only this link waits for the browser query; the public header keeps its server layout.
export function TaskEntryLink(props: Props) {
 return <Suspense fallback={<Link {...props} />}><ContextEntry {...props} /></Suspense>;
}

function ContextEntry({ href, ...props }: Props) {
 const path = usePathname();
 const search = useSearchParams().toString();
 const [hash, setHash] = useState('');
 useEffect(() => {
  const update = () => setHash(window.location.hash);
  update();
  window.addEventListener('hashchange', update);
  window.addEventListener('popstate', update);
  return () => { window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update); };
 }, [path, search]);
 return <Link {...props} href={publicTaskEntry(href, path + (search ? '?' + search : '') + hash)} />;
}
