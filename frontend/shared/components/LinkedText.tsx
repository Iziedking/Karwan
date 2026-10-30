import { textParts } from '@/shared/utils/textLinks';

/// Text people wrote, with its web links clickable. A link opens in a new tab
/// and sends no referrer; everything else stays plain text.
export function LinkedText({ text }: { text: string }) {
  return (
    <>
      {textParts(text).map((part, i) =>
        part.href ? (
          <a key={i} href={part.href} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 [overflow-wrap:anywhere] hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
