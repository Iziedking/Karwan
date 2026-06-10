'use client';
import type { ReactNode } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { SignInGate } from '@/shared/components/SignInGate';
import { FullBleed, Band, GridOverlay } from '@/shared/components/Bands';

/// Wraps a gated page so the auth-resolving moment doesn't cost the route
/// 0.9–1.3 CLS. Three branches:
///
///   1. `auth.isLoading`: render a stable, hero-sized placeholder that
///      reserves the same vertical space the resolved content takes. Without
///      this, SSR paints a SignInGate, then hydration swaps it for the real
///      page once `authMe()` resolves, and the layout shifts a screen down.
///   2. Not authenticated: render the SignInGate (caller controls the copy
///      via `gateTag` / `gateBody`).
///   3. Authenticated: render `children`.
///
/// The placeholder is intentionally a `<Band tone="dark">` of the same shape
/// as the SignInGate and most page heroes so the only visual change as auth
/// resolves is text fading in. Speed Insights routes that hit this guard
/// were sitting at CLS 0.9–1.3; the `/admin/treasuries` route, which never
/// flipped because it has no SignInGate, was the only one at CLS 0.01.
export function AuthGuard({
  children,
  gateTag,
  gateTitle,
  gateBody,
  gateButtonLabel,
}: {
  children: ReactNode;
  gateTag?: string;
  gateTitle?: ReactNode;
  gateBody?: ReactNode;
  gateButtonLabel?: string;
}) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div
            aria-hidden
            className="min-h-[44vh] flex items-start"
            style={{ contentVisibility: 'auto' }}
          />
        </Band>
      </FullBleed>
    );
  }

  if (!isAuthenticated) {
    return (
      <SignInGate
        variant="page"
        tag={gateTag}
        title={gateTitle}
        body={gateBody}
        buttonLabel={gateButtonLabel}
      />
    );
  }

  return <>{children}</>;
}
