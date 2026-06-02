'use client';

export function CopyButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="ms-2 text-[10px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] transition-colors"
      onClick={() => navigator.clipboard?.writeText(text).catch(() => {})}
      title="Copy"
    >
      copy
    </button>
  );
}
