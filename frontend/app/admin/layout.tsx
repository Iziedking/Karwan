'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WagmiProvider } from 'wagmi';
import { api, DESK_SIGNED_OUT_EVENT, type AdminDeskNetwork } from '@/core/api';
import { adminWagmiConfig } from '@/core/adminWagmi';
import { DialogProvider } from '@/shared/components/Dialog';
import { canOpenPath } from '@/features/admin/adminNavigation';
import { DeskSignIn } from '@/features/admin/desk/DeskSignIn';
import { DeskShell } from '@/features/admin/desk/DeskShell';
import { DeskPage } from '@/features/admin/desk/DeskPage';
import { DeskProvider, deskMe, type DeskState } from '@/features/admin/desk/deskContext';
import { DeskMoneyProvider } from '@/features/admin/desk/useDeskCurrency';
import { DeskHomeProvider } from '@/features/admin/desk/useDeskHome';

function DeskBody({ desk, children }: { desk: DeskState; children: React.ReactNode }) {
  const pathname = usePathname();
  if (canOpenPath(deskMe(desk.me), pathname)) return <DialogProvider>{children}</DialogProvider>;
  return (
    <DeskPage title="Not on your pages" subtitle="The owner decides which desk pages you can open. Ask them if you need this one.">
      <Link href="/admin" className="inline-flex h-[30px] items-center rounded-md border border-[var(--d-line)] bg-[var(--d-button)] px-2.5 text-[13px] font-medium">Go to Home</Link>
    </DeskPage>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // undefined while the desk asks whether this browser is still signed in.
  const [desk, setDesk] = useState<DeskState | null | undefined>(undefined);
  const [signInTo, setSignInTo] = useState<AdminDeskNetwork | undefined>(undefined);

  useEffect(() => {
    let live = true;
    api
      .adminSession()
      .then((r) => live && setDesk(r.me ? { me: r.me, network: r.network ?? 'testnet' } : null))
      .catch(() => live && setDesk(null));
    const signedOut = () => setDesk(null);
    window.addEventListener(DESK_SIGNED_OUT_EVENT, signedOut);
    return () => {
      live = false;
      window.removeEventListener(DESK_SIGNED_OUT_EVENT, signedOut);
    };
  }, []);

  async function signOut(then?: AdminDeskNetwork) {
    await api.adminSignOut().catch(() => undefined);
    setSignInTo(then);
    setDesk(null);
  }

  if (desk === undefined) return <main className="min-h-screen bg-[#0D0E10]" />;
  if (!desk) return <DeskSignIn initialNetwork={signInTo} onSignedIn={(me, network) => setDesk({ me, network })} />;
  const signs = desk.me.owner || desk.me.pages.some((p) => p !== 'support' && p !== 'feedback');
  return (
    <WagmiProvider config={adminWagmiConfig} reconnectOnMount={false}>
      <DeskProvider value={desk}>
        <DeskMoneyProvider>
          <DeskHomeProvider>
            <DeskShell signs={signs} onSignOut={() => void signOut()} onSwitch={(n) => void signOut(n)}>
              <DeskBody desk={desk}>{children}</DeskBody>
            </DeskShell>
          </DeskHomeProvider>
        </DeskMoneyProvider>
      </DeskProvider>
    </WagmiProvider>
  );
}
