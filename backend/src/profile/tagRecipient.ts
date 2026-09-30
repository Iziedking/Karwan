/// Who a Karwan tag pays. The send sheet shows the name and tag, then pays the
/// address this returns; it is read once when the person confirms.

import { normalizeKarwanTag } from './karwanTag.js';

export type TagRecipient =
  | { found: false; tag: string }
  | { found: true; self: boolean; tag: string; displayName: string; address: string };

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export function tagRecipient(
  rawTag: string,
  profile: { address: string; displayName?: string; handle?: string } | null,
  viewer: string,
): TagRecipient {
  const tag = normalizeKarwanTag(rawTag);
  if (!profile || !ADDRESS.test(profile.address)) return { found: false, tag };
  const name = profile.displayName?.trim();
  return {
    found: true,
    self: profile.address.toLowerCase() === viewer.toLowerCase(),
    tag,
    displayName: name ? name : `@${tag}`,
    address: profile.address.toLowerCase(),
  };
}
