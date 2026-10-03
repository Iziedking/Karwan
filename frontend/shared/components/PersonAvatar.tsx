'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { qk } from '@/core/queryKeys';

/// A person's profile photo (their upload, else their X image), or the first
/// letter of their name when there is none or it fails to load. Fetched once
/// per person and shared by every place that shows them.
export function PersonAvatar({ address, name, size = 40 }: { address?: string; name: string; size?: number }) {
  const profile = useQuery({
    queryKey: qk.profile.byAddress(address ?? ''),
    queryFn: () => api.getProfile(address!),
    enabled: !!address,
    staleTime: 5 * 60_000,
  });
  const [failed, setFailed] = useState(false);
  const image = failed ? undefined : profile.data?.profile?.profileImageDataUrl || profile.data?.profile?.xProfileImageUrl;
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" width={size} height={size} style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" onError={() => setFailed(true)} />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      className="grid shrink-0 place-items-center rounded-full bg-[var(--lp-light)] font-semibold text-[var(--lp-dark)]"
    >
      {initialOf(profile.data?.profile?.displayName || profile.data?.profile?.handle || name)}
    </span>
  );
}

function initialOf(name: string): string {
  return name.replace(/^(seller|buyer)\s+/i, '').replace(/^0x/i, '').trim().charAt(0).toUpperCase() || '·';
}
