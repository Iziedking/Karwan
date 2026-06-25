'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { isBusinessAccount } from '@/features/account/accountKind';

/// Keeps a person off business (SME-rail) surfaces and a business off P2P
/// surfaces. Business and individual are two separate products; a deep link to
/// the wrong rail bounces home. This is the UX layer only: the API enforces the
/// real boundary (a mismatched call is rejected regardless of the nav).
///
/// While the profile is still loading or the user is signed out, children
/// render normally (AuthGuard handles auth). The redirect fires only on a
/// confirmed mismatch, so there is no flash of the wrong page.
export function AccountGate({
  kind,
  children,
}: {
  kind: 'person' | 'business';
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { profile, loading, isConnected } = useUserProfile();

  const mismatch =
    !loading &&
    isConnected &&
    profile != null &&
    (kind === 'business' ? !isBusinessAccount(profile) : isBusinessAccount(profile));

  useEffect(() => {
    if (mismatch) router.replace('/app');
  }, [mismatch, router]);

  if (mismatch) return null;
  return <>{children}</>;
}
