'use client';
import { useSiwe } from '@/shared/hooks/useSiwe';

/// Mount-once SIWE driver. Lives inside WagmiProvider + QueryClientProvider so
/// the hook can read wagmi state. Renders nothing — the wallet popup is the UI.
/// Without this the hook would have to be wired into every page that needs a
/// session, which is everywhere. One mount keeps it honest.
export function SiweGate() {
  useSiwe();
  return null;
}
