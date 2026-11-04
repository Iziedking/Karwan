'use client';
import { CARD_CLASS } from '@/shared/components/Card';
import { useState, type ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Body-text wrapper for docs pages, so each page writes plain JSX.
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('docs-prose', className)}>{children}</div>;
}

/// Per-section heading inside a docs page. Sentence case, no decoration.
export function DocsH2({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2
      id={id}
      style={{ scrollMarginTop: 104 }}
      className="mt-12 first:mt-0 text-[20px] font-semibold tracking-[-0.01em] leading-snug text-[var(--ink)]"
    >
      {children}
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
      className="mt-7 text-[17px] font-semibold text-[var(--ink)]"
    >
      {children}
    </h3>
  );
}

/// Body paragraph. 15px, comfortable line-height, max width that holds the eye
/// without the line breaking too short.
export function DocsP({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 max-w-[64ch] text-[16px] leading-relaxed text-[var(--ink-secondary)]">
      {children}
    </p>
  );
}

/// A list is one card of rows; a leading <strong> becomes the row title.
export function DocsList({ children }: { children: ReactNode }) {
  return <ul className={`${CARD_CLASS} mt-4 max-w-[720px] divide-y divide-[var(--line)] px-5`}>{children}</ul>;
}

export function DocsListItem({ children }: { children: ReactNode }) {
  return (
    <li className="py-4 text-[15px] leading-relaxed text-[var(--ink-secondary)] [&>strong:first-child]:mb-1 [&>strong:first-child]:block [&>strong:first-child]:font-semibold [&>strong:first-child]:text-[var(--ink)]">
      {children}
    </li>
  );
}

/// Eyebrow chip above a section. Same look as SectionTag but smaller, for
/// use inside content bands rather than at the top of a hero.
export function DocsEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[14px] text-[var(--ink-secondary)] font-medium">
      {children}
    </p>
  );
}

/// Wraps a screenshot or video in a card.
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
  const t = useTranslations().docsShell;
  return (
    <figure className="mt-7 max-w-[720px]">
      <div
        className={`${CARD_CLASS} overflow-hidden`}
      >
        {missing ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <span className="text-[14px] text-[var(--ink-secondary)] font-medium">
              {kind === 'video' ? t.figure.videoComingSoon : t.figure.screenshotComingSoon}
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
        <figcaption className="mt-3 text-[14px] text-[var(--ink-muted)]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/// Inline callout for an important warning or note. The border carries the
/// tone; the title stays in body ink so it reads at every size and theme.
export function DocsCallout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn';
  title: string;
  children: ReactNode;
}) {
  const border = tone === 'warn' ? 'var(--color-warning)' : 'var(--line-strong)';
  return (
    <aside
      className="mt-6 max-w-[64ch] ps-5 py-1"
      style={{ borderInlineStart: `3px solid ${border}` }}
    >
      <p className="text-[14px] font-semibold text-[var(--ink)]">
        {title}
      </p>
      <div className="mt-2 text-[14px] leading-relaxed text-[var(--ink-secondary)] font-medium">
        {children}
      </div>
    </aside>
  );
}
