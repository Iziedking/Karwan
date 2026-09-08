export type SocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'x' | 'linkedin';

/** Published brand geometry, never a font glyph. Source attribution ships with the SVGs. */
export function PlatformMark({ id }: { id: SocialPlatform }) {
  return (
    <span className={`landing-platform-mark ${id === 'tiktok' ? 'landing-platform-mark-tiktok' : ''}`}>
      <img
        src={id === 'tiktok' ? '/brand/social/TikTok_Icon_Black_Square.png' : id === 'instagram' ? '/brand/social/instagram-color.svg' : `/brand/social/${id}.svg`}
        alt="" aria-hidden width={22} height={22}
        className={id === 'tiktok' ? 'size-full' : id === 'instagram' ? 'size-[24px]' : 'size-[22px] invert'}
      />
    </span>
  );
}
