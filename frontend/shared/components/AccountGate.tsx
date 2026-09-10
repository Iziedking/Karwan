'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';

/// Keeps the selected workspace on its matching trade surface. Personal and
/// business workspaces share one identity, but their home and trade context
/// stay explicit; a deep link to the other context returns to the workspace
/// home. This is the UX layer only: the API enforces the real boundary (a
/// mismatched call is rejected regardless of the nav).
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
  const { activeWorkspace, isBusinessWorkspace, isLoading: workspacesLoading } = useWorkspaceContext();

  const mismatch =
    !loading &&
    !workspacesLoading &&
    isConnected &&
    profile != null &&
    activeWorkspace != null &&
    (kind === 'business' ? !isBusinessWorkspace : isBusinessWorkspace);

  useEffect(() => {
    if (mismatch) router.replace('/app');
  }, [mismatch, router]);

  if (mismatch) return null;
  return <>{children}</>;
}
