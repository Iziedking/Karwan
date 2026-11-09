'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, profilePhotoOf } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { PROFILE_SAVED_EVENT } from '@/shared/hooks/useUserProfile';

/// A person's profile photo (their upload, else their X image), or the first
/// letter of their name when there is none or it fails to load. Fetched once
/// per person and shared by every place that shows them.
export function PersonAvatar({ address, name, size = 40 }: { address?: string; name: string; size?: number }) {
  const profile = useQuery({
    queryKey: qk.personAvatar(address ?? ''),
    queryFn: () => api.getProfile(address!),
    enabled: !!address,
    staleTime: 60_000,
  });
  const queryClient = useQueryClient();
  // A photo you just changed shows at once on your own messages.
  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['person-avatar'] });
    window.addEventListener(PROFILE_SAVED_EVENT, refresh);
    return () => window.removeEventListener(PROFILE_SAVED_EVENT, refresh);
  }, [queryClient]);
  const [failed, setFailed] = useState(false);
  // A new photo gets a fresh chance to load after an earlier one failed.
  const image0 = profilePhotoOf(profile.data?.profile);
  useEffect(() => setFailed(false), [image0]);
  const image = failed ? undefined : image0;
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} referrerPolicy="no-referrer" alt="" width={size} height={size} style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" onError={() => setFailed(true)} />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: tintOf(address || name) }}
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
    >
      {initialOf(profile.data?.profile?.displayName || profile.data?.profile?.handle || name)}
    </span>
  );
}

function initialOf(name: string): string {
  return name.replace(/^(seller|buyer)\s+/i, '').replace(/^0x/i, '').trim().charAt(0).toUpperCase() || '·';
}

/// A steady colour for each person without a photo, so a list of initials
/// reads as different people (owner, 9 Nov 2026, Figma 228:570). Muted enough
/// for white letters in both themes.
const TINTS = ['#3F5A86', '#6A4A86', '#86553F', '#3F7A66', '#7A6A3A', '#3F6F86', '#864A5F', '#5A6A3F'];
export function tintOf(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}
