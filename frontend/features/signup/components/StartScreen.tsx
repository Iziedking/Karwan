'use client';

import { useState } from 'react';
import { ARC_NETWORK } from '@/core/arcNetwork';
import { AuthCard } from './AuthCard';
import { WaitlistCard } from './WaitlistCard';

/// Mainnet opens by invitation: the waitlist leads, and invited people sign in
/// or create their account from it. Testnet keeps the full sign-up.
export function StartScreen({ mode }: { mode: 'signin' | 'signup' | 'waitlist' }) {
  const waitlistFirst = ARC_NETWORK === 'mainnet' || mode === 'waitlist';
  const [view, setView] = useState<'waitlist' | 'signin' | 'signup'>(
    mode === 'waitlist' || (waitlistFirst && mode !== 'signup') ? 'waitlist' : mode,
  );
  if (view === 'waitlist') {
    return <WaitlistCard onSignIn={() => setView('signin')} onCreate={() => setView('signup')} />;
  }
  return (
    <AuthCard
      key={view}
      initialMode={view}
      onWaitlist={waitlistFirst ? () => setView('waitlist') : undefined}
    />
  );
}
