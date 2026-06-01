'use client';
import { useState, type ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

/// Body-text wrapper for docs pages. Sets typography for h2/h3/p/ul/code so
/// each page can write JSX without restating the same Tailwind classes on
/// every element. Headings get the lime accent dot on the left to echo the
/// SectionTag/[:tag:] grammar without overusing the bracket form.
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('docs-prose', className)}>{children}</div>;
}

/// One step below HeroHeadline — used inside light bands as the per-section
/// heading. Big, extrabold, lime period.
export function DocsH2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-12 first:mt-0 font-sans text-[clamp(1.5rem,2.4vw,2rem)] font-extrabold tracking-[-0.015em] leading-tight text-[var(--lp-dark)]">
      {children}
      <span style={{ color: 'var(--lp-accent)' }}>.</span>
    </h2>
  );
}

/// Sub-heading inside a section. Smaller, weighted, no accent dot.
/// Optional `id` to make the heading a deep-link target. Set `scrollMarginTop`
/// so anchor jumps land below the sticky top nav rather than under it.
export function DocsH3({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3
      id={id}
      style={id ? { scrollMarginTop: 96 } : undefined}
      className="mt-7 font-sans text-[18px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]"
    >
      {children}
    </h3>
  );
}

/// Body paragraph. 15px, comfortable line-height, max width that holds the eye
/// without the line breaking too short.
export function DocsP({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[64ch]">
      {children}
    </p>
  );
}

/// Bullet list with the lime accent dot.
export function DocsList({ children }: { children: ReactNode }) {
  return <ul className="mt-4 space-y-2 max-w-[64ch]">{children}</ul>;
}

export function DocsListItem({ children }: { children: ReactNode }) {
  return (
    <li className="relative pl-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
      <span
        aria-hidden
        className="absolute left-0 top-[10px] w-1.5 h-1.5 rounded-full bg-[var(--lp-accent)]"
      />
      {children}
    </li>
  );
}

/// Eyebrow chip above a section. Same look as SectionTag but smaller, for
/// use inside content bands rather than at the top of a hero.
export function DocsEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
      [:{children}:]
    </p>
  );
}

/// Wraps a screenshot or video in the Phantom asymmetric-corner frame.
/// Pass the asset path (resolves under /docs/images/ or /docs/videos/) and
/// an alt string. Drop a caption below the frame as the children.
export function DocsFigure({
  src,
  alt,
  caption,
  kind = 'image',
}: {
  src: string;
  alt: string;
  caption?: ReactNode;
  kind?: 'image' | 'video';
}) {
  // When the asset hasn't been added yet, show a styled placeholder instead
  // of a broken-image icon. Drop the file at the src path under
  // frontend/public/ and it renders automatically on next load.
  const [missing, setMissing] = useState(false);
  return (
    <figure className="mt-7 max-w-[720px]">
      <div
        className="overflow-hidden bg-[var(--lp-card)] border border-[var(--lp-border-light)]"
        style={{
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          borderBottomLeftRadius: 14,
          borderBottomRightRadius: 4,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 14px 36px -14px rgba(0,0,0,0.18)',
        }}
      >
        {missing ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <span
              aria-hidden
              className="inline-block w-2 h-2 rounded-full bg-[var(--lp-accent)]"
            />
            <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
              {kind === 'video' ? 'video coming soon' : 'screenshot coming soon'}
            </span>
            <span className="mono text-[10px] text-[var(--lp-text-muted)]/60 break-all px-6">
              {src}
            </span>
          </div>
        ) : kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="block w-full h-auto" onError={() => setMissing(true)} />
        ) : (
          <video
            src={src}
            controls
            className="block w-full h-auto"
            onError={() => setMissing(true)}
          >
            <track kind="captions" />
          </video>
        )}
      </div>
      {caption && (
        <figcaption className="mt-3 mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/// Inline callout for an important warning or note. Lime left border.
export function DocsCallout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn';
  title: string;
  children: ReactNode;
}) {
  const accent = tone === 'warn' ? '#c96030' : 'var(--lp-accent)';
  return (
    <aside
      className="mt-6 max-w-[64ch] pl-5 py-1"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <p
        className="mono text-[10px] uppercase tracking-[0.16em]"
        style={{ color: accent }}
      >
        [:{title}:]
      </p>
      <div className="mt-2 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
        {children}
      </div>
    </aside>
  );
}
